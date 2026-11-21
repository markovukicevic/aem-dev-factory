import { readFile } from 'node:fs/promises';
import { runTestCommand } from './command-runner.js';
import { parseImplementationPlan } from './plan-parser.js';
import { readGitState } from './git-state.js';
import { evaluatePullRequestReadiness } from './pr-readiness.js';

/** Combine user-supplied test/plan evidence with live, read-only Git state. */
export async function inspectPullRequestReadiness({ cwd, steps, provenance, testsPassed, base }, { readGit = readGitState } = {}) {
  const git = await readGit(cwd);
  const readiness = {
    steps,
    provenance,
    checks: { testsPassed, workingTreeClean: git.workingTreeClean },
    branch: { head: git.head, commit: git.commit, base },
  };
  return { readiness, ...evaluatePullRequestReadiness(readiness) };
}

/** Read plan evidence from disk, then inspect the current Git state. */
export async function inspectPlanReadiness({ cwd, planPath, testsPassed, base }, dependencies = {}) {
  if (typeof planPath !== 'string' || !planPath.trim()) throw new TypeError('planPath is required');
  const text = await (dependencies.readPlan ?? readFile)(planPath, 'utf8');
  const plan = parseImplementationPlan(text);
  return inspectPullRequestReadiness({ cwd, ...plan, testsPassed, base }, dependencies);
}

/** Validate a plan, run the selected tests, then refresh plan and Git evidence. */
export async function inspectPlanWithTests({ cwd, planPath, base, testCommand }, dependencies = {}) {
  if (typeof planPath !== 'string' || !planPath.trim()) throw new TypeError('planPath is required');
  const readPlan = dependencies.readPlan ?? readFile;
  const originalPlan = await readPlan(planPath, 'utf8');
  parseImplementationPlan(originalPlan);
  const before = await (dependencies.readGit ?? readGitState)(cwd);
  const testResult = await (dependencies.runTests ?? runTestCommand)({ ...testCommand, cwd });
  let refreshedPlan;
  const capturePlan = async (...args) => { refreshedPlan = await readPlan(...args); return refreshedPlan; };
  const result = await inspectPlanReadiness({ cwd, planPath, testsPassed: testResult?.passed === true, base }, { ...dependencies, readPlan: capturePlan });
  const stable = originalPlan === refreshedPlan && before.workingTreeClean === true && typeof before.commit === 'string' && /^[a-f0-9]{40,64}$/i.test(before.commit) && before.head === result.readiness.branch.head && before.commit === result.readiness.branch.commit;
  if (!stable) {
    result.readiness.checks.testsPassed = false;
    result.blockers.push('The plan, branch, commit or clean worktree changed around the test run.');
    result.ready = false;
  }
  return { ...result, testResult };
}
