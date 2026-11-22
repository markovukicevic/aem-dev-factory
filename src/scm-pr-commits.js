import { readGitHubPullRequestCommits } from './github-pr-commits.js';
import { readGitLabMergeRequestCommits } from './gitlab-mr-commits.js';
import { readBitbucketPrCommits } from './bitbucket-pr-commits.js';
import { readAzurePrCommitPage } from './ado-pr-commits.js';

/** Route to the configured SCM without hiding provider-specific completeness. */
export async function readScmPrCommits({ scm, number, continuationToken }) {
  if (continuationToken !== undefined && scm?.provider !== 'ado') throw new TypeError('Continuation is supported only for Azure');
  if (scm?.provider === 'github') return readGitHubPullRequestCommits({ scm, number });
  if (scm?.provider === 'gitlab') return readGitLabMergeRequestCommits({ scm, number });
  if (scm?.provider === 'bitbucket-cloud') return readBitbucketPrCommits({ scm, number });
  if (scm?.provider === 'ado') return readAzurePrCommitPage({ scm, number, continuationToken });
  throw new TypeError('Unsupported SCM provider');
}
