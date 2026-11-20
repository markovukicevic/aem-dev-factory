import { createGitHubClient } from './github.js';

const usage = 'Usage: node bin/aem-devflow.js <github-pr|github-pr-context> <owner> <repository> <number>';

/** Execute the read-only CLI command; dependencies are injectable for tests. */
export async function runCli(args, { env = process.env, output = console, makeClient = createGitHubClient } = {}) {
  if (args.length !== 4 || !['github-pr', 'github-pr-context'].includes(args[0]) || !/^[1-9][0-9]*$/.test(args[3])) {
    output.error(usage);
    return 2;
  }
  if (!env.GITHUB_TOKEN) {
    output.error('Set GITHUB_TOKEN in the environment before running this command.');
    return 2;
  }
  try {
    const number = Number(args[3]);
    const client = makeClient({ owner: args[1], repository: args[2], token: env.GITHUB_TOKEN });
    const pullRequest = await client.getPullRequest(number);
    if (args[0] === 'github-pr') {
      output.log(JSON.stringify(pullRequest, null, 2));
    } else {
      const sha = pullRequest?.head?.sha;
      const [reviewComments, conversationComments, checkRuns, commitStatus] = await Promise.all([
        client.listReviewComments(number), client.listIssueComments(number),
        client.listCheckRuns(sha), client.getCommitStatus(sha),
      ]);
      output.log(JSON.stringify({ pullRequest, reviewComments, conversationComments, checkRuns, commitStatus,
        pagination: { page: 1, perPage: 100, note: 'Comments and checks contain only the first page.' } }, null, 2));
    }
    return 0;
  } catch (error) {
    // Remote response bodies and credentials are never printed.
    output.error(Number.isInteger(error?.status) ? `GitHub request failed (${error.status})` : 'Could not read pull request. Check the arguments and connection.');
    return 1;
  }
}
