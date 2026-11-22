import { readPullRequestContext } from './pr-context.js';
import { readGitHubPullRequestFiles } from './github-pr-files.js';
import { readGitHubPullRequestCommits } from './github-pr-commits.js';
import { readGitHubCiSummary } from './github-ci-summary.js';

/** Gather read-only GitHub review evidence and reject changed PR revisions. */
export async function readGitHubReviewContext({ scm, ci, number }) {
  if (scm?.provider !== 'github' || ci?.provider !== 'github-actions') throw new TypeError('GitHub SCM and CI providers required');
  const discussion = await readPullRequestContext({ scm, number });
  const fileData = await readGitHubPullRequestFiles({ scm, number });
  if (discussion.pullRequest.number !== number || discussion.pullRequest.head?.sha !== fileData.head || discussion.pullRequest.base?.sha !== fileData.base) throw new Error('Pull request changed during review context collection');
  const commitData = await readGitHubPullRequestCommits({ scm, number });
  if (commitData.head !== fileData.head || commitData.base !== fileData.base || discussion.pullRequest.commits !== commitData.commitCount) throw new Error('Pull request changed during review context collection');
  const ciSummary = await readGitHubCiSummary(ci, fileData.head);
  const last = await scm.getPullRequest(number);
  if (last?.number !== number || last.head?.sha !== fileData.head || last.base?.sha !== fileData.base || last.changed_files !== fileData.changedFiles || last.commits !== commitData.commitCount) throw new Error('Pull request changed during review context collection');
  return { provider: 'github', number, head: fileData.head, base: fileData.base, discussion, fileData, commitData, ciSummary, limitations: ['Review threads, full diffs, branch protection and required checks are not evaluated; commit lists are limited to 250.', 'CI is read from the configured base repository and may omit checks from a fork.', 'Discussion and CI can change while being fetched; the PR can change immediately afterward.'] };
}
