import { readFile } from 'node:fs/promises';
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
    branch: { head: git.head, base },
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
