import { createGitHubClient } from './github.js';

const usage = 'Usage: node bin/aem-devflow.js <github-pr|github-pr-context|github-issue> <owner> <repository> <number> [--page <number>]';

/** Execute the read-only CLI command; dependencies are injectable for tests. */
export async function runCli(args, { env = process.env, output = console, makeClient = createGitHubClient } = {}) {
  const validPage = args.length === 6 && args[0] === 'github-pr-context' && args[4] === '--page' && /^[1-9][0-9]*$/.test(args[5]) && Number.isSafeInteger(Number(args[5]));
  if ((args.length !== 4 && !validPage) || !['github-pr', 'github-pr-context', 'github-issue'].includes(args[0]) || !/^[1-9][0-9]*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3]))) {
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
    if (args[0] === 'github-issue') {
      output.log(JSON.stringify(await client.getIssue(number), null, 2));
      return 0;
    }
    const pullRequest = await client.getPullRequest(number);
    if (args[0] === 'github-pr') {
      output.log(JSON.stringify(pullRequest, null, 2));
    } else {
      const sha = pullRequest?.head?.sha;
      const page = validPage ? Number(args[5]) : 1;
      const [reviewComments, conversationComments, checkRuns, commitStatus] = await Promise.all([
        client.listReviewComments(number, { page }), client.listIssueComments(number, { page }),
        client.listCheckRuns(sha, { page }), client.getCommitStatus(sha),
      ]);
      output.log(JSON.stringify({ pullRequest, reviewComments, conversationComments, checkRuns, commitStatus,
        pagination: { page, perPage: 100, note: 'Comments and checks contain only the requested page.' } }, null, 2));
    }
    return 0;
  } catch (error) {
    // Remote response bodies and credentials are never printed.
    output.error(Number.isInteger(error?.status) ? `GitHub request failed (${error.status})` : 'Could not read GitHub data. Check the arguments and connection.');
    return 1;
  }
}
