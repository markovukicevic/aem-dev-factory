import { readGitHubReviewContext } from './github-review-context.js';
import { readPullRequestContext } from './pr-context.js';
import { readScmPrCommits } from './scm-pr-commits.js';

/** Combine provider-specific review evidence without claiming unsupported guarantees. */
export async function readScmReviewContext({ scm, ci, number }) {
  if (scm?.provider === 'github') return readGitHubReviewContext({ scm, ci, number });
  if (!['gitlab', 'bitbucket-cloud', 'ado'].includes(scm?.provider)) throw new TypeError('Unsupported SCM provider');
  const discussion = await readPullRequestContext({ scm, number });
  const commitData = await readScmPrCommits({ scm, number });
  let revisionConsistency = null;
  if (scm.provider === 'gitlab') {
    const refs = discussion.pullRequest.diff_refs;
    if (discussion.pullRequest.iid !== number || !refs || ['base_sha', 'head_sha', 'start_sha'].some(key => refs[key] !== commitData.revisions[key])) throw new Error('Merge request changed during review context collection');
    revisionConsistency = true;
  } else if (scm.provider === 'bitbucket-cloud') {
    const pr = discussion.pullRequest;
    if (pr.id !== number || pr.source?.commit?.hash !== commitData.source || pr.destination?.commit?.hash !== commitData.destination) throw new Error('Pull request changed during review context collection');
    revisionConsistency = true;
  } else if (discussion.pullRequest.pullRequestId !== number) {
    throw new Error('Azure pull request identity mismatch');
  }
  return { provider: scm.provider, number, discussion, commitData, revisionConsistency, limitations: ['No full diff, CI, approval policy or review is established by this context.', 'Discussion and PR revisions can change during or after collection.', ...(scm.provider === 'ado' ? ['Azure current branch revisions and thread pagination were not verified; commits include only one page.'] : []), ...(scm.provider === 'gitlab' ? ['GitLab commit response completeness was not established.'] : [])] };
}
