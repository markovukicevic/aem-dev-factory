import { readFile } from 'node:fs/promises';
import { createGitHubPullRequest } from './github-pr-flow.js';
import { createGitHubClient } from './github.js';
import { fetchGitHubIssueContext } from './issue-context.js';
import { saveGitHubIssueStory } from './issue-story.js';
import { saveTrackerStory } from './tracker-story.js';
import { createTrackerProvider } from './providers.js';
import { inspectConfiguredReadiness } from './configured-readiness.js';

const usage = 'Usage: node bin/aem-devflow.js <github-pr|github-pr-context|github-issue|github-issue-context> <owner> <repository> <number> [--page <number>]\n       node bin/aem-devflow.js readiness <config.json> <implement.md>\n       node bin/aem-devflow.js tracker-ticket <providers.json> <id>\n       node bin/aem-devflow.js tracker-export <providers.json> <id> <output.md>\n       node bin/aem-devflow.js github-issue-export <owner> <repository> <number> <output.md>\n       node bin/aem-devflow.js github-pr-create <owner> <repository> <config> <implement.md> <title> --body-file <path> [--draft]';

/** Execute an explicitly requested CLI command; dependencies are injectable for tests. */
export async function runCli(args, { env = process.env, output = console, makeClient = createGitHubClient, inspect = inspectConfiguredReadiness, createPullRequest = createGitHubPullRequest, makeTracker = createTrackerProvider, readBody = readFile, cwd = process.cwd() } = {}) {
  if (args[0] === 'tracker-ticket' || args[0] === 'tracker-export') {
    const exporting = args[0] === 'tracker-export';
    if (args.length !== (exporting ? 4 : 3) || typeof args[2] !== 'string' || !args[2].trim() || (exporting && !args[3]?.trim())) { output.error(usage); return 2; }
    try {
      const config = JSON.parse(await readBody(args[1], 'utf8'));
      if (config.tracker?.provider === 'github' && !env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment before running this command.'); return 2; }
      if (config.tracker?.provider === 'jira' && (!env.JIRA_EMAIL || !env.JIRA_API_TOKEN)) { output.error('Set JIRA_EMAIL and JIRA_API_TOKEN in the environment.'); return 2; }
      const github = config.tracker?.provider === 'github';
      if (github && (!/^[1-9][0-9]*$/.test(args[2]) || !Number.isSafeInteger(Number(args[2])))) { output.error(usage); return 2; }
      const tracker = makeTracker(config.tracker, { token: env.GITHUB_TOKEN, jiraEmail: env.JIRA_EMAIL, jiraToken: env.JIRA_API_TOKEN });
      const ticket = await tracker.getTicket(github ? Number(args[2]) : args[2]);
      output.log(JSON.stringify(exporting ? await saveTrackerStory(ticket, args[3]) : ticket, null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to read or export tracker ticket. Check the configuration and connection.');
      return 1;
    }
  }
  if (args[0] === 'github-pr-create') {
    const valid = (args.length === 8 || (args.length === 9 && args[8] === '--draft')) && args[6] === '--body-file' && args.slice(1, 6).every(value => typeof value === 'string' && value.trim()) && args[7]?.trim();
    if (!valid) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment before running this command.'); return 2; }
    try {
      const body = await readBody(args[7], 'utf8');
      const result = await createPullRequest({ cwd, owner: args[1], repository: args[2], configPath: args[3], planPath: args[4], title: args[5], token: env.GITHUB_TOKEN, body, draft: args.length === 9 });
      output.log(JSON.stringify(result, null, 2));
      return result.created ? 0 : 1;
    } catch (error) {
      output.error(Number.isInteger(error?.status) ? `GitHub request failed (${error.status})` : 'Unable to create pull request. Check the configuration, plan, branch and connection.');
      return 1;
    }
  }
  if (args[0] === 'readiness') {
    if (args.length !== 3) { output.error(usage); return 2; }
    try {
      const result = await inspect({ cwd, configPath: args[1], planPath: args[2] });
      output.log(JSON.stringify(result, null, 2));
      return result.ready ? 0 : 1;
    } catch {
      output.error('Unable to inspect readiness. Check the configuration, plan and Git repository.');
      return 1;
    }
  }
  if (args[0] === 'github-issue-export') {
    if (args.length !== 5 || !/^[1-9][0-9]*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3])) || !args[4]?.trim()) { output.error(usage); return 2; }
    if (!env.GITHUB_TOKEN) { output.error('Set GITHUB_TOKEN in the environment before running this command.'); return 2; }
    try {
      const client = makeClient({ owner: args[1], repository: args[2], token: env.GITHUB_TOKEN });
      const issue = await fetchGitHubIssueContext({ client, number: Number(args[3]) });
      const result = await saveGitHubIssueStory(issue, args[4]);
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      output.error(error?.code === 'EEXIST' ? 'Output file already exists; it was not overwritten.' : 'Unable to export GitHub issue. Check the issue, output path and connection.');
      return 1;
    }
  }
  const validPage = args.length === 6 && args[0] === 'github-pr-context' && args[4] === '--page' && /^[1-9][0-9]*$/.test(args[5]) && Number.isSafeInteger(Number(args[5]));
  if ((args.length !== 4 && !validPage) || !['github-pr', 'github-pr-context', 'github-issue', 'github-issue-context'].includes(args[0]) || !/^[1-9][0-9]*$/.test(args[3]) || !Number.isSafeInteger(Number(args[3]))) {
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
    if (args[0] === 'github-issue-context') {
      output.log(JSON.stringify(await fetchGitHubIssueContext({ client, number }), null, 2));
      return 0;
    }
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
