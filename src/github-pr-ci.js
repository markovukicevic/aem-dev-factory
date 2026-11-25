import { readCiObservations } from './ci-observations.js';

/** Read the current GitHub PR head and its observed checks, rejecting a changed PR. */
export async function readGitHubPullRequestCi({ scm, ci, number, branch, sources }) {
  if (scm?.provider !== 'github' || !ci?.provider || !Number.isSafeInteger(number) || number < 1) throw new TypeError('GitHub PR and CI providers are required');
  function revision(pr) {
    if (pr?.number !== number || !/^[a-f0-9]{40}$/i.test(pr?.head?.sha ?? '') || !/^[a-f0-9]{40}$/i.test(pr?.base?.sha ?? '')) throw new Error('Invalid pull request revision');
    return { head: pr.head.sha.toLowerCase(), base: pr.base.sha.toLowerCase() };
  }
  const before = revision(await scm.getPullRequest(number));
  const observations = await readCiObservations({ ci, sha: before.head, ...(branch === undefined ? {} : { branch }) });
  const after = revision(await scm.getPullRequest(number));
  if (before.head !== after.head || before.base !== after.base) throw new Error('Pull request changed while CI was read');
  return { number, head: before.head, base: before.base, ...(observations.provider === 'github-actions' ? { summary: observations.summary } : {}), ci: observations, ...(sources ? { sources } : {}), scope: 'Observed CI results for the PR head SHA only. An independently configured CI project may not identify the SCM repository. Required branch protection, reviews and merge readiness are not evaluated. Results may change after collection.' };
}
