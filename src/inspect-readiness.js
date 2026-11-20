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
