import { readGitHubReviewContext } from './github-review-context.js';
import { readPullRequestContext } from './pr-context.js';
import { readScmPrCommits } from './scm-pr-commits.js';
import { readGitLabMergeRequestDiffs } from './gitlab-mr-diffs.js';
import { readBitbucketPrDiffstat } from './bitbucket-pr-diffstat.js';

/** Combine provider-specific review evidence without claiming unsupported guarantees. */
export async function readScmReviewContext({ scm, ci, number, iteration }) {
  if (iteration !== undefined && (scm?.provider !== 'ado' || !Number.isSafeInteger(iteration) || iteration < 1 || iteration > 2147483647)) throw new TypeError('Iteration must be an explicit Azure PR iteration');
  if (scm?.provider === 'github') return readGitHubReviewContext({ scm, ci, number });
  if (!['gitlab', 'bitbucket-cloud', 'ado'].includes(scm?.provider)) throw new TypeError('Unsupported SCM provider');
  const discussion = await readPullRequestContext({ scm, number });
  const commitData = await readScmPrCommits({ scm, number });
  let revisionConsistency = null;
  let fileData = null;
  if (scm.provider === 'gitlab') fileData = await readGitLabMergeRequestDiffs({ scm, number });
  if (scm.provider === 'bitbucket-cloud') fileData = await readBitbucketPrDiffstat({ scm, number });
  if (scm.provider === 'ado' && iteration !== undefined) fileData = { iteration, ...(await scm.getIterationChanges(number, iteration)) };
  if (scm.provider === 'gitlab') {
    const refs = discussion.pullRequest.diff_refs;
    if (discussion.pullRequest.iid !== number || !refs || ['base_sha', 'head_sha', 'start_sha'].some(key => refs[key] !== commitData.revisions[key] || refs[key] !== fileData.revisions[key])) throw new Error('Merge request changed during review context collection');
    revisionConsistency = true;
  } else if (scm.provider === 'bitbucket-cloud') {
    const pr = discussion.pullRequest;
    if (pr.id !== number || pr.source?.commit?.hash !== commitData.source || pr.destination?.commit?.hash !== commitData.destination || commitData.source !== fileData.source || commitData.destination !== fileData.destination) throw new Error('Pull request changed during review context collection');
    revisionConsistency = true;
  } else if (discussion.pullRequest.pullRequestId !== number) {
    throw new Error('Azure pull request identity mismatch');
  }
  return { provider: scm.provider, number, discussion, commitData, fileData, revisionConsistency, limitations: ['No full diff, CI, approval policy or review is established by this context.', 'Discussion and PR revisions can change during or after collection.', ...(scm.provider === 'ado' ? ['Azure current branch revisions and thread pagination were not verified; commits include only one page.', ...(iteration !== undefined ? ['The selected iteration is not verified as current; change entries are metadata, not a full diff.'] : ['Azure file changes were not requested.'])] : []), ...(scm.provider === 'gitlab' ? ['GitLab commit and diff completeness were not established.'] : []), ...(scm.provider === 'bitbucket-cloud' ? ['Bitbucket diffstat provides file statistics, not a code diff.'] : [])] };
}
