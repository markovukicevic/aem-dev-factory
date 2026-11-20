import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/cli.js';

function capture() {
  const messages = { logs: [], errors: [] };
  return { messages, output: { log: value => messages.logs.push(value), error: value => messages.errors.push(value) } };
}

test('reads a pull request using a token from the environment', async () => {
  const { messages, output } = capture();
  let options;
  const code = await runCli(['github-pr', 'team', 'site', '12'], {
    env: { GITHUB_TOKEN: 'secret' }, output,
    makeClient: input => { options = input; return { getPullRequest: async number => ({ number }) }; },
  });
  assert.equal(code, 0);
  assert.deepEqual(options, { owner: 'team', repository: 'site', token: 'secret' });
  assert.deepEqual(JSON.parse(messages.logs[0]), { number: 12 });
  assert.deepEqual(messages.errors, []);
});

test('rejects malformed input and missing credentials before constructing a client', async () => {
  const { output } = capture();
  const makeClient = () => { throw new Error('must not be called'); };
  assert.equal(await runCli(['github-pr', 'team', 'site', '1x'], { env: {}, output, makeClient }), 2);
  assert.equal(await runCli(['github-pr', 'team', 'site', '1'], { env: {}, output, makeClient }), 2);
});

test('reports failures without exposing credentials or server error messages', async () => {
  const { messages, output } = capture();
  const code = await runCli(['github-pr', 'team', 'site', '1'], {
    env: { GITHUB_TOKEN: 'secret' }, output,
    makeClient: () => ({ getPullRequest: async () => { throw new Error('secret'); } }),
  });
  assert.equal(code, 1);
  assert.equal(messages.errors[0].includes('secret'), false);
});

test('returns PR context with separate comments, check runs and commit status', async () => {
  const { messages, output } = capture();
  const makeClient = () => ({
    getPullRequest: async number => ({ number, head: { sha: '123abcd' } }),
    listReviewComments: async () => [{ id: 'review' }],
    listIssueComments: async () => [{ id: 'conversation' }],
    listCheckRuns: async sha => ({ sha, check_runs: [] }),
    getCommitStatus: async sha => ({ sha, state: 'pending' }),
  });
  assert.equal(await runCli(['github-pr-context', 'team', 'site', '12'], { env: { GITHUB_TOKEN: 'secret' }, output, makeClient }), 0);
  const result = JSON.parse(messages.logs[0]);
  assert.equal(result.reviewComments[0].id, 'review');
  assert.equal(result.conversationComments[0].id, 'conversation');
  assert.equal(result.checkRuns.sha, '123abcd');
  assert.equal(result.commitStatus.state, 'pending');
  assert.match(result.pagination.note, /requested page/);
});

test('does not present incomplete context as successful if a request fails', async () => {
  const { messages, output } = capture();
  const fail = async () => { throw Object.assign(new Error('private details'), { status: 403 }); };
  const makeClient = () => ({
    getPullRequest: async () => ({ head: { sha: '123abcd' } }),
    listReviewComments: fail, listIssueComments: async () => [],
    listCheckRuns: async () => ({}), getCommitStatus: async () => ({}),
  });
  assert.equal(await runCli(['github-pr-context', 'team', 'site', '12'], { env: { GITHUB_TOKEN: 'secret' }, output, makeClient }), 1);
  assert.deepEqual(messages.logs, []);
  assert.deepEqual(messages.errors, ['GitHub request failed (403)']);
});

test('reads an issue independently of the pull request commands', async () => {
  const { messages, output } = capture();
  const makeClient = () => ({ getIssue: async number => ({ number, title: 'Example' }) });
  assert.equal(await runCli(['github-issue', 'team', 'site', '31'], { env: { GITHUB_TOKEN: 'secret' }, output, makeClient }), 0);
  assert.deepEqual(JSON.parse(messages.logs[0]), { number: 31, title: 'Example' });
});


test('fetches the selected page for each paginated context component', async () => {
  const { messages, output } = capture();
  const pages = [];
  const page = async (_id, options) => { pages.push(options.page); return []; };
  const makeClient = () => ({
    getPullRequest: async () => ({ head: { sha: '123abcd' } }),
    listReviewComments: page, listIssueComments: page, listCheckRuns: page,
    getCommitStatus: async () => ({}),
  });
  assert.equal(await runCli(['github-pr-context', 'team', 'site', '12', '--page', '2'], { env: { GITHUB_TOKEN: 'secret' }, output, makeClient }), 0);
  assert.deepEqual(pages, [2, 2, 2]);
  assert.equal(JSON.parse(messages.logs[0]).pagination.page, 2);
  assert.equal(await runCli(['github-pr', 'team', 'site', '12', '--page', '2'], { env: { GITHUB_TOKEN: 'secret' }, output, makeClient }), 2);
  assert.equal(await runCli(['github-pr-context', 'team', 'site', '12', '--page', '0'], { env: { GITHUB_TOKEN: 'secret' }, output, makeClient }), 2);
});


test('runs configured readiness locally without a GitHub token', async () => {
  const { messages, output } = capture();
  let options;
  const inspect = async input => { options = input; return { ready: false, blockers: ['Tests failed.'] }; };
  assert.equal(await runCli(['readiness', 'config.json', 'implement.md'], { cwd: '/repo', env: {}, output, inspect }), 1);
  assert.deepEqual(options, { cwd: '/repo', configPath: 'config.json', planPath: 'implement.md' });
  assert.equal(JSON.parse(messages.logs[0]).ready, false);
});

test('returns normalized issue context without treating a pull request as an issue', async () => {
  const { messages, output } = capture();
  const makeClient = () => ({ getIssue: async number => ({ number, title: 'Bug', state: 'open', labels: [] }), listIssueComments: async () => [] });
  assert.equal(await runCli(['github-issue-context', 'team', 'site', '31'], { env: { GITHUB_TOKEN: 'secret' }, output, makeClient }), 0);
  assert.equal(JSON.parse(messages.logs[0]).provider, 'github');
});
