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

test('creates a PR only when explicitly invoked with a body file and token', async () => {
  const { messages, output } = capture();
  let input;
  const options = { cwd: '/repo', env: { GITHUB_TOKEN: 'secret' }, output, readBody: async path => { assert.equal(path, 'body.md'); return 'Description'; }, createPullRequest: async value => { input = value; return { created: true, pullRequest: { number: 42 } }; } };
  assert.equal(await runCli(['github-pr-create', 'team', 'site', 'config.json', 'plan.md', 'A change', '--body-file', 'body.md', '--draft'], options), 0);
  assert.equal(input.body, 'Description');
  assert.equal(input.draft, true);
  assert.equal(input.token, 'secret');
  assert.equal(JSON.parse(messages.logs[0]).pullRequest.number, 42);
});

test('rejects incomplete creation requests and hides provider errors', async () => {
  const { messages, output } = capture();
  let called = false;
  const options = { env: { GITHUB_TOKEN: 'secret' }, output, readBody: async () => 'Description', createPullRequest: async () => { called = true; throw new Error('secret'); } };
  assert.equal(await runCli(['github-pr-create', 'team', 'site', 'config.json', 'plan.md', 'Title'], options), 2);
  assert.equal(called, false);
  assert.equal(await runCli(['github-pr-create', 'team', 'site', 'config.json', 'plan.md', 'Title', '--body-file', 'body.md'], options), 1);
  assert.equal(messages.errors.at(-1).includes('secret'), false);
});

test('reads a ticket through the independently configured tracker adapter', async () => {
  const { messages, output } = capture();
  const makeTracker = (config, credentials) => {
    assert.equal(config.provider, 'github');
    assert.equal(credentials.token, 'secret');
    return { getTicket: async number => ({ number, provider: 'github' }) };
  };
  const options = { output, env: { GITHUB_TOKEN: 'secret' }, makeTracker, readBody: async () => JSON.stringify({ tracker: { provider: 'github', owner: 'team', repository: 'issues' } }) };
  assert.equal(await runCli(['tracker-ticket', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).number, 7);
});

test('uses Jira credentials for a Jira tracker without requiring a GitHub token', async () => {
  const { messages, output } = capture();
  const makeTracker = (config, credentials) => {
    assert.equal(config.provider, 'jira');
    assert.equal(credentials.jiraEmail, 'user@example.com');
    assert.equal(credentials.jiraToken, 'jira-secret');
    return { getTicket: async key => ({ key, provider: 'jira' }) };
  };
  const options = { output, env: { JIRA_EMAIL: 'user@example.com', JIRA_API_TOKEN: 'jira-secret' }, makeTracker, readBody: async () => JSON.stringify({ tracker: { provider: 'jira' } }) };
  assert.equal(await runCli(['tracker-ticket', 'providers.json', 'TEAM-7'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).key, 'TEAM-7');
});

test('uses Azure DevOps credentials for a numeric tracker ticket', async () => {
  const { messages, output } = capture();
  const options = { output, env: { ADO_PAT: 'secret' }, readBody: async () => JSON.stringify({ tracker: { provider: 'ado' } }), makeTracker: (_config, credentials) => { assert.equal(credentials.adoToken, 'secret'); return { getTicket: async id => ({ provider: 'ado', number: id }) }; } };
  assert.equal(await runCli(['tracker-ticket', 'providers.json', '12'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).number, 12);
});

test('reads an Azure pull request using independently selected SCM settings', async () => {
  const { messages, output } = capture();
  const options = { output, env: { ADO_PAT: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'ado' } }), makeScm: (config, credentials) => { assert.equal(config.provider, 'ado'); assert.equal(credentials.adoToken, 'secret'); return { getPullRequest: async id => ({ pullRequestId: id }) }; } };
  assert.equal(await runCli(['scm-pr', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).pullRequestId, 7);
  assert.equal(await runCli(['scm-pr', 'providers.json', '-7'], options), 2);
});

test('creates Azure PRs only on explicit command and passes selected work-item IDs', async () => {
  const { messages, output } = capture();
  let input;
  const options = { cwd: '/repo', output, env: { ADO_PAT: 'secret' }, readBody: async () => 'Description', createAzurePullRequest: async value => { input = value; return { created: true, pullRequest: { pullRequestId: 9 } }; } };
  const args = ['ado-pr-create', 'org', 'project', 'repo', 'config.yaml', 'plan.md', 'Change', '--body-file', 'body.md', '--work-item', '12', '--draft'];
  assert.equal(await runCli(args, options), 0);
  assert.equal(input.token, 'secret');
  assert.equal(input.body, 'Description');
  assert.equal(input.draft, true);
  assert.deepEqual(input.workItemIds, [12]);
  assert.equal(JSON.parse(messages.logs[0]).pullRequest.pullRequestId, 9);
  assert.equal(await runCli(args.concat(['--work-item', '-1']), options), 2);
});

test('uses Bitbucket credentials for an independently configured SCM provider', async () => {
  const { messages, output } = capture();
  const options = { output, env: { BITBUCKET_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'bitbucket-cloud' } }), makeScm: (config, credentials) => { assert.equal(credentials.bitbucketToken, 'secret'); return { getPullRequest: async id => ({ id, provider: config.provider }) }; } };
  assert.equal(await runCli(['scm-pr', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).provider, 'bitbucket-cloud');
});

test('creates a Bitbucket PR only on the explicit command', async () => {
  const { messages, output } = capture();
  let input;
  const options = { cwd: '/repo', output, env: { BITBUCKET_TOKEN: 'secret' }, readBody: async () => 'Description', createBitbucketPr: async value => { input = value; return { created: true, pullRequest: { id: 9 } }; } };
  const args = ['bitbucket-pr-create', 'team', 'repo', 'config.yaml', 'plan.md', 'Change', '--body-file', 'body.md', '--draft'];
  assert.equal(await runCli(args, options), 0);
  assert.equal(input.token, 'secret');
  assert.equal(input.draft, true);
  assert.equal(input.body, 'Description');
  assert.equal(JSON.parse(messages.logs[0]).pullRequest.id, 9);
  assert.equal(await runCli(args.slice(0, 6), options), 2);
});

test('routes GitLab tracker, SCM and CI operations using a GitLab token', async () => {
  const { messages, output } = capture();
  const options = { output, env: { GITLAB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ tracker: { provider: 'gitlab' }, scm: { provider: 'gitlab' }, ci: { provider: 'gitlab-ci' } }), makeTracker: (_config, credentials) => { assert.equal(credentials.gitlabToken, 'secret'); return { getTicket: async id => ({ number: id }) }; }, makeScm: (_config, credentials) => { assert.equal(credentials.gitlabToken, 'secret'); return { getPullRequest: async id => ({ iid: id }) }; }, makeCi: (_config, credentials) => { assert.equal(credentials.gitlabToken, 'secret'); return { listPipelines: async ({ sha }) => ({ sha, values: [] }) }; } };
  assert.equal(await runCli(['tracker-ticket', 'providers.json', '7'], options), 0);
  assert.equal(await runCli(['scm-pr', 'providers.json', '8'], options), 0);
  assert.equal(await runCli(['ci-status', 'providers.json', '123abcd'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).sha, '123abcd');
});

test('creates a GitLab MR only on the explicit command', async () => {
  const { messages, output } = capture();
  let input;
  const options = { cwd: '/repo', output, env: { GITLAB_TOKEN: 'secret' }, readBody: async () => 'Description', createGitlabMr: async value => { input = value; return { created: true, pullRequest: { iid: 9 } }; } };
  const args = ['gitlab-mr-create', 'team/site', 'config.yaml', 'plan.md', 'Change', '--body-file', 'body.md', '--draft'];
  assert.equal(await runCli(args, options), 0);
  assert.equal(input.token, 'secret');
  assert.equal(input.draft, true);
  assert.equal(input.body, 'Description');
  assert.equal(JSON.parse(messages.logs[0]).pullRequest.iid, 9);
  assert.equal(await runCli(args.slice(0, 5), options), 2);
});

test('reads an explicitly selected Confluence page with separate credentials', async () => {
  const { messages, output } = capture();
  const options = { output, env: { CONFLUENCE_EMAIL: 'user@example.com', CONFLUENCE_API_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ documentation: { provider: 'confluence' } }), makeDocumentation: (_config, credentials) => { assert.equal(credentials.confluenceToken, 'secret'); return { getPage: async id => ({ id, title: 'Docs' }) }; } };
  assert.equal(await runCli(['confluence-page', 'providers.json', '123'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).id, '123');
  assert.equal(await runCli(['confluence-page', 'providers.json', '../bad'], options), 2);
});

test('downloads an explicitly selected Jira attachment using the tracker credentials', async () => {
  const { messages, output } = capture();
  const options = { output, env: { JIRA_EMAIL: 'user@example.com', JIRA_API_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ tracker: { provider: 'jira' } }), makeTracker: (_config, credentials) => { assert.equal(credentials.jiraToken, 'secret'); return { saveAttachment: async (id, path) => ({ id, path, size: 3 }) }; } };
  assert.equal(await runCli(['jira-attachment', 'providers.json', '42', 'image.bin'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).id, '42');
  assert.equal(await runCli(['jira-attachment', 'providers.json', '../bad', 'image.bin'], options), 2);
});

test('dispatches only an explicitly requested GitHub workflow', async () => {
  const { messages, output } = capture();
  let input;
  const options = { output, env: { GITHUB_TOKEN: 'secret' }, readBody: async path => path === 'config.json' ? JSON.stringify({ ci: { provider: 'github-actions' } }) : JSON.stringify({ stage: 'test' }), makeCi: () => ({ dispatchWorkflow: async value => { input = value; return { accepted: true, runId: null }; } }) };
  assert.equal(await runCli(['ci-dispatch', 'config.json', 'build.yml', 'main', '--inputs-file', 'inputs.json'], options), 0);
  assert.deepEqual(input, { workflow: 'build.yml', ref: 'main', inputs: { stage: 'test' } });
  assert.equal(JSON.parse(messages.logs[0]).accepted, true);
  assert.equal(await runCli(['ci-dispatch', 'config.json', 'build.yml'], options), 2);
});

test('builds GitHub review context using CI from the same SCM repository', async () => {
  const { messages, output } = capture();
  const p = { number: 7, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) }, changed_files: 0, commits: 0 };
  const options = { output, env: { GITHUB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'github', owner: 'team', repository: 'site' }, ci: { provider: 'gitlab-ci' } }), makeScm: () => ({ provider: 'github', getPullRequest: async () => p, listIssueComments: async () => [], listReviewComments: async () => [], listReviews: async () => [], listPullRequestFiles: async () => [] }), makeCi: config => { assert.deepEqual(config, { provider: 'github-actions', owner: 'team', repository: 'site' }); return { provider: 'github-actions', listCheckRuns: async () => ({ total_count: 0, check_runs: [] }), getCommitStatus: async () => ({ total_count: 0 }) }; } };
  assert.equal(await runCli(['github-review-context', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).ciSummary.state, 'unknown');
  assert.equal(await runCli(['github-review-context', 'providers.json', 'bad'], options), 2);
});

test('fetches a tracker ticket once and initializes its source record', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'ticket-cli-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  let calls = 0;
  const { messages, output } = capture();
  const options = { cwd, output, env: { GITHUB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ tracker: { provider: 'github', owner: 'team', repository: 'site' } }), makeTracker: () => ({ getTicket: async number => { calls++; return { provider: 'github', number, title: 'Title', body: 'Source', state: 'open', labels: [], comments: [] }; } }) };
  assert.equal(await runCli(['ticket-init', 'providers.json', '7'], options), 0);
  assert.equal(calls, 1);
  assert.equal(JSON.parse(messages.logs.at(-1)).id, 'github-7');
  assert.equal(await runCli(['ticket-init', 'providers.json', 'invalid'], options), 2);
});

test('shows help successfully with the supported PR creation commands', async () => {
  const { messages, output } = capture();
  assert.equal(await runCli(['--help'], { output }), 0);
  assert.match(messages.logs.at(-1), /gitlab-mr-create/);
  assert.match(messages.logs.at(-1), /bitbucket-pr-create/);
});

test('starts an explicit local webhook listener without exposing its secret', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'webhook-listener-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'policy.json');
  await writeFile(path, JSON.stringify({ allowedRepositories: ['team/site'], allowedActors: ['alex'] }));
  const { messages, output } = capture();
  const options = { output, env: { GITHUB_WEBHOOK_SECRET: 'secret-value' }, startWebhook: async opts => { assert.equal(opts.secret, 'secret-value'); assert.equal(opts.port, 12345); return { on: () => {} }; } };
  assert.equal(await runCli(['webhook-listen', path, dir, '12345'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).listening, '127.0.0.1');
  assert.ok(!messages.logs.at(-1).includes('secret-value'));
  assert.equal(await runCli(['webhook-listen', path, dir, '0'], options), 2);
});

test('transitions a plan using the digest from plan-status', async t => {
  const { mkdtemp, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'plan-transition-cli-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const path = join(cwd, 'implement.md');
  await writeFile(path, '### Step 1: Change\n**Status:** pending\n');
  const { messages, output } = capture();
  assert.equal(await runCli(['plan-status', path], { cwd, output }), 0);
  const digest = JSON.parse(messages.logs.at(-1)).digest;
  assert.equal(await runCli(['plan-transition', path, '1', 'pending', 'in-progress', digest], { cwd, output }), 0);
  assert.match(await readFile(path, 'utf8'), /in-progress/);
  assert.equal(await runCli(['plan-transition', path, '1', 'pending', 'in-progress', digest], { cwd, output }), 1);
});

test('runs and records configured tests without marking a plan verified', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const root = await mkdtemp(join(tmpdir(), 'evidence-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { cwd });
  execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd });
  const plan = join(root, 'plan.md'), config = join(root, 'config.json'), evidence = join(root, 'evidence.md');
  await writeFile(plan, '### Step 1: Work\n**Status:** done\n');
  await writeFile(config, JSON.stringify({ scm: { baseBranch: 'main' }, test: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }));
  const { messages, output } = capture();
  assert.equal(await runCli(['verification-run', config, plan, evidence], { cwd, output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).testPassed, true);
  assert.equal(await runCli(['verification-check', config, plan, evidence], { cwd, output }), 0);
  await writeFile(plan, '### Step 1: Changed\n**Status:** done\n');
  assert.equal(await runCli(['verification-check', config, plan, evidence], { cwd, output }), 1);
  assert.equal(await runCli(['verification-run', config, plan, evidence], { cwd, output }), 1);
});

test('runs an explicitly configured local hub task', async t => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { initializeHub } = await import('../src/hub-init.js');
  const root = await mkdtemp(join(tmpdir(), 'hub-run-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const hub = join(root, 'hub'), repo = join(root, 'repo');
  await mkdir(hub);
  execFileSync('git', ['init', '-q', '-b', 'feature', repo]);
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { cwd: repo });
  await initializeHub({ cwd: hub, repos: [{ name: 'repo', path: repo }] });
  const input = join(root, 'task.json');
  await writeFile(input, JSON.stringify({ ticket: 'TASK-1', title: 'Check', repositories: ['repo'], executable: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 10000 }));
  const { messages, output } = capture();
  assert.equal(await runCli(['hub-run', input], { cwd: hub, output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).repos.repo, 'done');
});

test('routes PR commit reads to the selected provider and checks credentials', async () => {
  const { messages, output } = capture();
  const options = { output, env: { ADO_PAT: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'ado' } }), makeScm: (_config, credentials) => { assert.equal(credentials.adoToken, 'secret'); return { provider: 'ado', getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }) }; } };
  assert.equal(await runCli(['scm-pr-commits', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).provider, 'ado');
  assert.equal(await runCli(['scm-pr-commits', 'providers.json', '7'], { ...options, env: {} }), 2);
  assert.equal(await runCli(['scm-pr-commits', 'providers.json', 'bad'], options), 2);
});


test('routes provider-selected review context without inventing Azure revision consistency', async () => {
  const { messages, output } = capture();
  const options = { output, env: { ADO_PAT: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'ado' } }), makeScm: () => ({ provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }) }) };
  assert.equal(await runCli(['scm-review-context', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).revisionConsistency, null);
  const withIteration = { ...options, makeScm: () => ({ provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }), getIterationChanges: async () => ({ changes: [], complete: true }) }) };
  assert.equal(await runCli(['scm-review-context', 'providers.json', '7', '--iteration', '2'], withIteration), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).fileData.iteration, 2);
  assert.equal(await runCli(['scm-review-context', 'providers.json', '7'], { ...options, env: {} }), 2);
});


test('collects CI observations from the independently selected provider', async () => {
  const { messages, output } = capture();
  const sha = 'a'.repeat(40);
  const options = { output, env: { GITLAB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ ci: { provider: 'gitlab-ci' } }), makeCi: () => ({ provider: 'gitlab-ci', listAllPipelines: async () => [{ sha, status: 'running' }] }) };
  assert.equal(await runCli(['ci-observations', 'providers.json', sha], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).states[0].state, 'running');
  assert.equal(await runCli(['ci-observations', 'providers.json', 'abc'], options), 2);
  assert.equal(await runCli(['ci-observations', 'providers.json', sha, '--branch', 'main'], options), 2);
});


test('collects independently configured review and CI evidence for an explicit SHA', async () => {
  const { messages, output } = capture(), sha = 'a'.repeat(40);
  const options = { output, env: { ADO_PAT: 'ado', GITLAB_TOKEN: 'gitlab' }, readBody: async () => JSON.stringify({ scm: { provider: 'ado', organization: 'org', project: 'site', repository: 'repo' }, ci: { provider: 'gitlab-ci', project: 'team/site' } }), makeScm: () => ({ provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }) }), makeCi: () => ({ provider: 'gitlab-ci', listAllPipelines: async () => [{ sha, status: 'running' }] }) };
  assert.equal(await runCli(['scm-review-ci', 'providers.json', '7', sha], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).prHeadMatchesSha, null);
  assert.equal(JSON.parse(messages.logs.at(-1)).sources.ci.project, 'team/site');
  assert.equal(await runCli(['scm-review-ci', 'providers.json', '7', sha], { ...options, env: { ADO_PAT: 'ado' } }), 2);
});


test('saves PR and CI evidence locally without overwriting', async t => {
  const { mkdtemp, rm, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'review-evidence-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { messages, output } = capture(), sha = 'a'.repeat(40), path = join(root, 'evidence.md');
  const options = { output, env: { ADO_PAT: 'ado', GITLAB_TOKEN: 'gitlab' }, readBody: async () => JSON.stringify({ scm: { provider: 'ado', organization: 'org', project: 'site', repository: 'repo' }, ci: { provider: 'gitlab-ci', project: 'team/site' } }), makeScm: () => ({ provider: 'ado', getPullRequest: async () => ({ pullRequestId: 7 }), getPullRequestThreads: async () => ({ value: [] }), getPullRequestCommitPage: async () => ({ values: [], continuationToken: null }) }), makeCi: () => ({ provider: 'gitlab-ci', listAllPipelines: async () => [{ sha, status: 'running' }] }) };
  assert.equal(await runCli(['scm-review-evidence', 'providers.json', '7', sha, path], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).prHeadMatchesSha, null);
  assert.match(await readFile(path, 'utf8'), /untrusted provider data/);
  assert.equal(await runCli(['scm-review-evidence', 'providers.json', '7', sha, path], options), 1);
  assert.equal(await runCli(['scm-review-evidence-check', 'providers.json', path], options), 1);
  assert.equal(JSON.parse(messages.logs.at(-1)).revisionMatches, null);
});


test('downloads issue attachments and records their local evidence', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'jira-ticket-evidence-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { messages, output } = capture(), path = join(directory, 'manifest.json');
  const options = { output, env: { JIRA_EMAIL: 'x', JIRA_API_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ tracker: { provider: 'jira', baseUrl: 'https://team.atlassian.net' } }), makeTracker: () => ({ provider: 'jira', getTicket: async key => ({ provider: 'jira', key, attachments: [{ id: '7' }] }), getAttachmentMetadata: async id => ({ id, filename: 'file', size: 1 }), saveAttachment: async (id, target) => { await writeFile(target, 'x', { flag: 'wx' }); return { id, path: target, size: 1, sha256: '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881' }; } }) };
  assert.equal(await runCli(['jira-ticket-evidence', 'providers.json', 'TEAM-7', directory, path, '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).manifest.files, 1);
});
