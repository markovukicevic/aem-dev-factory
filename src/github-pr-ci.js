import { readGitHubCiSummary } from './github-ci-summary.js';

/** Read the current GitHub PR head and its observed checks, rejecting a changed PR. */
export async function readGitHubPullRequestCi({ scm, ci, number }) {
  if (scm?.provider !== 'github' || ci?.provider !== 'github-actions' || !Number.isSafeInteger(number) || number < 1) throw new TypeError('GitHub PR and CI providers are required');
  function revision(pr) {
    if (pr?.number !== number || !/^[a-f0-9]{40}$/i.test(pr?.head?.sha ?? '') || !/^[a-f0-9]{40}$/i.test(pr?.base?.sha ?? '')) throw new Error('Invalid pull request revision');
    return { head: pr.head.sha.toLowerCase(), base: pr.base.sha.toLowerCase() };
  }
  const before = revision(await scm.getPullRequest(number));
  const summary = await readGitHubCiSummary(ci, before.head);
  const after = revision(await scm.getPullRequest(number));
  if (before.head !== after.head || before.base !== after.base) throw new Error('Pull request changed while CI was read');
  return { number, head: before.head, base: before.base, summary, scope: 'Observed GitHub check runs and classic statuses for the PR head. Required branch protection, reviews and merge readiness are not evaluated. Results may change after collection.' };
}
