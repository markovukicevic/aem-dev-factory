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

test('exports a complete issue to a new story file without overwriting it', async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-cli-story-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'raw-story.md');
  const { messages, output } = capture();
  const makeClient = () => ({ getIssue: async number => ({ number, title: 'Bug', body: 'Details', state: 'open', labels: [] }), listIssueComments: async () => [] });
  const options = { env: { GITHUB_TOKEN: 'secret' }, output, makeClient };
  const args = ['github-issue-export', 'team', 'repo', '7', path];
  assert.equal(await runCli(args, options), 0);
  assert.match(await readFile(path, 'utf8'), /Details/);
  assert.equal(await runCli(args, options), 1);
  assert.match(messages.errors.at(-1), /not overwritten/);
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

test('exports a Jira tracker issue and preserves an existing story file', async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-jira-export-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'raw-story.md');
  const { messages, output } = capture();
  const issue = { provider: 'jira', key: 'TEAM-7', title: 'Story', labels: [], body: { type: 'doc', version: 1, content: [] }, comments: [] };
  const options = { output, env: { JIRA_EMAIL: 'user@example.com', JIRA_API_TOKEN: 'secret' }, makeTracker: () => ({ getTicket: async () => issue }), readBody: async () => JSON.stringify({ tracker: { provider: 'jira' } }) };
  const args = ['tracker-export', 'providers.json', 'TEAM-7', path];
  assert.equal(await runCli(args, options), 0);
  assert.match(await readFile(path, 'utf8'), /Jira issue.*TEAM-7/);
  assert.equal(await runCli(args, options), 1);
  assert.match(messages.errors.at(-1), /not overwritten/);
});

test('uses Azure DevOps credentials for a numeric tracker ticket', async () => {
  const { messages, output } = capture();
  const options = { output, env: { ADO_PAT: 'secret' }, readBody: async () => JSON.stringify({ tracker: { provider: 'ado' } }), makeTracker: (_config, credentials) => { assert.equal(credentials.adoToken, 'secret'); return { getTicket: async id => ({ provider: 'ado', number: id }) }; } };
  assert.equal(await runCli(['tracker-ticket', 'providers.json', '12'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).number, 12);
});

test('exports an Azure DevOps work item through the configured tracker', async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-ado-export-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'raw-story.md');
  const { output } = capture();
  const issue = { provider: 'ado', number: 12, title: 'Work', fields: { 'System.Title': 'Work' }, relations: [], comments: [] };
  const options = { output, env: { ADO_PAT: 'secret' }, makeTracker: () => ({ getTicket: async number => { assert.equal(number, 12); return issue; } }), readBody: async () => JSON.stringify({ tracker: { provider: 'ado' } }) };
  assert.equal(await runCli(['tracker-export', 'providers.json', '12', path], options), 0);
  assert.match(await readFile(path, 'utf8'), /Azure DevOps work item/);
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

test('initializes a ticket directory through the CLI without replacing existing work', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-cli-spec-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const { messages, output } = capture();
  assert.equal(await runCli(['spec-init', 'github-12', 'A new feature'], { cwd, output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).created, true);
  assert.equal(await runCli(['spec-init', 'github-12', 'Renamed'], { cwd, output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).created, false);
  assert.equal(await runCli(['spec-init', '../bad', 'Title'], { cwd, output }), 1);
});

test('reads CI runs using the separately configured CI adapter', async () => {
  const { messages, output } = capture();
  const options = { output, env: { GITHUB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ ci: { provider: 'github-actions' } }), makeCi: (config, credentials) => { assert.equal(config.provider, 'github-actions'); assert.equal(credentials.token, 'secret'); return { listWorkflowRuns: async input => ({ input }), getWorkflowRun: async id => ({ id }) }; } };
  assert.equal(await runCli(['ci-runs', 'providers.json', '123abcd', '--page', '2'], options), 0);
  assert.deepEqual(JSON.parse(messages.logs.at(-1)).input, { sha: '123abcd', page: 2 });
  assert.equal(await runCli(['ci-run', 'providers.json', '42'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).id, 42);
  assert.equal(await runCli(['ci-runs', 'providers.json', 'main'], options), 2);
});

test('uses Bitbucket credentials for an independently configured SCM provider', async () => {
  const { messages, output } = capture();
  const options = { output, env: { BITBUCKET_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'bitbucket-cloud' } }), makeScm: (config, credentials) => { assert.equal(credentials.bitbucketToken, 'secret'); return { getPullRequest: async id => ({ id, provider: config.provider }) }; } };
  assert.equal(await runCli(['scm-pr', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).provider, 'bitbucket-cloud');
});

test('reads Bitbucket commit status using independently configured CI credentials', async () => {
  const { messages, output } = capture();
  const options = { output, env: { BITBUCKET_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ ci: { provider: 'bitbucket-pipelines' } }), makeCi: (config, credentials) => { assert.equal(credentials.bitbucketToken, 'secret'); assert.equal(config.provider, 'bitbucket-pipelines'); return { getCommitStatuses: async sha => ({ sha, values: [] }) }; } };
  assert.equal(await runCli(['ci-status', 'providers.json', '123abcd'], options), 0);
  assert.equal(JSON.parse(messages.logs[0]).sha, '123abcd');
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

test('exports GitLab tracker issues using a numeric IID', async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-gitlab-export-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const path = join(cwd, 'raw-story.md');
  const { output } = capture();
  const options = { output, env: { GITLAB_TOKEN: 'secret' }, makeTracker: () => ({ getTicket: async number => ({ provider: 'gitlab', number, title: 'Bug', body: 'Details', labels: [], comments: [] }) }), readBody: async () => JSON.stringify({ tracker: { provider: 'gitlab' } }) };
  assert.equal(await runCli(['tracker-export', 'providers.json', '7', path], options), 0);
  assert.match(await readFile(path, 'utf8'), /GitLab issue/);
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

test('searches local AEM component candidates without credentials', async t => {
  const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-aem-cli-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const folder = join(cwd, 'components', 'hero');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, '.content.xml'), '<component/>');
  const { messages, output } = capture();
  assert.equal(await runCli(['aem-components', 'hero'], { cwd, env: {}, output }), 0);
  assert.equal(JSON.parse(messages.logs[0]).candidates.length, 1);
});

test('inspects a local AEM dialog without credentials', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-aem-dialog-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, '.content.xml');
  await writeFile(path, '<root xmlns:sling="urn:sling"><title sling:resourceType="text" name="./title" fieldLabel="Title"/></root>');
  const { messages, output } = capture();
  assert.equal(await runCli(['aem-dialog', path], { env: {}, output }), 0);
  assert.equal(JSON.parse(messages.logs[0]).fields[0].name, './title');
});
