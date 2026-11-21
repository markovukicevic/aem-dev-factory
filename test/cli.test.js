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

test('reads Azure Pipelines builds through separate CI configuration', async () => {
  const { messages, output } = capture();
  const options = { output, env: { ADO_PAT: 'secret' }, readBody: async () => JSON.stringify({ ci: { provider: 'ado-pipelines' } }), makeCi: (_config, credentials) => { assert.equal(credentials.adoToken, 'secret'); return { listBuilds: async query => ({ query, values: [] }), getBuild: async id => ({ id }) }; } };
  assert.equal(await runCli(['ado-builds', 'providers.json', 'feature/a', '--continuation', 'next'], options), 0);
  assert.deepEqual(JSON.parse(messages.logs.at(-1)).query, { branch: 'feature/a', continuationToken: 'next' });
  assert.equal(await runCli(['ado-build', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).id, 7);
});

test('reads hub status from the current repository without credentials', async t => {
  const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-hub-cli-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, '.ai'), { recursive: true });
  await writeFile(join(cwd, '.ai', 'config.yaml'), 'hub:\n  enabled: true\n');
  const { messages, output } = capture();
  assert.equal(await runCli(['hub-status'], { cwd, env: {}, output }), 0);
  assert.deepEqual(JSON.parse(messages.logs[0]).dispatches, []);
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

test('creates and compares local AEM dialog snapshots', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'aem-snapshot-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const xml = join(dir, 'dialog.xml');
  const before = join(dir, 'before.json');
  const after = join(dir, 'after.json');
  await writeFile(xml, '<root xmlns:sling="urn:sling"><title sling:resourceType="text" name="./title"/></root>');
  const { messages, output } = capture();
  assert.equal(await runCli(['aem-dialog-snapshot', xml, before], { output }), 0);
  assert.equal(await runCli(['aem-dialog-snapshot', xml, after], { output }), 0);
  assert.equal(await runCli(['aem-dialog-compare', before, after], { output }), 0);
  assert.deepEqual(JSON.parse(messages.logs.at(-1)).changed, []);
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

test('generates a PR description from plan and verification files', async t => {
  const { mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-pr-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const explanation = join(dir, 'explain.md');
  const plan = join(dir, 'implement.md');
  const verification = join(dir, 'verification.md');
  const out = join(dir, 'pr.md');
  await writeFile(explanation, '## Summary\nChange hero\n');
  await writeFile(plan, '### Step 1: Implement\n**Status:** done\n');
  await writeFile(verification, 'Unit tests passed');
  const { output } = capture();
  const args = ['pr-description', '-', explanation, plan, verification, out];
  assert.equal(await runCli(args, { output }), 0);
  assert.match(await readFile(out, 'utf8'), /Unit tests passed/);
  assert.equal(await runCli(args, { output }), 1);
});

test('inspects a signed webhook from files without executing a task', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { createHmac } = await import('node:crypto');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-webhook-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const body = JSON.stringify({ action: 'opened', issue: { number: 7 }, repository: { full_name: 'team/site' }, sender: { login: 'alex' } });
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  const policy = join(dir, 'policy.json');
  const headers = join(dir, 'headers.json');
  const payload = join(dir, 'body.json');
  await writeFile(policy, JSON.stringify({ allowedRepositories: ['team/site'], allowedActors: ['alex'] }));
  await writeFile(headers, JSON.stringify({ signature, event: 'issues', deliveryId: '12345678-1234-1234-1234-123456789abc' }));
  await writeFile(payload, body);
  const { messages, output } = capture();
  assert.equal(await runCli(['webhook-inspect', policy, headers, payload], { output, env: { GITHUB_WEBHOOK_SECRET: 'secret' } }), 0);
  assert.equal(JSON.parse(messages.logs[0]).kind, 'issue');
  assert.equal(await runCli(['webhook-inspect', policy, headers, payload], { output, env: { GITHUB_WEBHOOK_SECRET: 'wrong' } }), 1);
});

test('claims an approved webhook once without running a job', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { createHmac } = await import('node:crypto');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-claim-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const body = JSON.stringify({ action: 'opened', issue: { number: 7 }, repository: { full_name: 'team/site' }, sender: { login: 'alex' } });
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  const policy = join(dir, 'policy.json');
  const headers = join(dir, 'headers.json');
  const payload = join(dir, 'body.json');
  await writeFile(policy, JSON.stringify({ allowedRepositories: ['team/site'], allowedActors: ['alex'] }));
  await writeFile(headers, JSON.stringify({ signature, event: 'issues', deliveryId: '12345678-1234-1234-1234-123456789abc' }));
  await writeFile(payload, body);
  const { messages, output } = capture();
  const args = ['webhook-claim', policy, headers, payload, join(dir, 'claims')];
  const options = { output, env: { GITHUB_WEBHOOK_SECRET: 'secret' } };
  assert.equal(await runCli(args, options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).claimed, true);
  assert.equal(await runCli(args, options), 1);
  assert.equal(JSON.parse(messages.logs.at(-1)).reason, 'duplicate-payload');
});

test('summarizes GitHub CI through the configured provider', async () => {
  const { messages, output } = capture();
  const options = { output, env: { GITHUB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ ci: { provider: 'github-actions' } }), makeCi: () => ({ listCheckRuns: async () => ({ total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] }), getCommitStatus: async () => ({ total_count: 0 }) }) };
  assert.equal(await runCli(['ci-summary', 'providers.json', '123abcd'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).state, 'success');
  assert.equal(await runCli(['ci-summary', 'providers.json', 'main'], options), 2);
});

test('reads complete Bitbucket CI status only for the configured provider', async () => {
  const { messages, output } = capture();
  const options = { output, env: { BITBUCKET_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ ci: { provider: 'bitbucket-pipelines' } }), makeCi: (config, credentials) => { assert.equal(credentials.bitbucketToken, 'secret'); return { getAllCommitStatuses: async sha => [{ sha }] }; } };
  assert.equal(await runCli(['ci-status-all', 'providers.json', '123abcd'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).values[0].sha, '123abcd');
  assert.equal(await runCli(['ci-status-all', 'providers.json', 'main'], options), 2);
  assert.equal(await runCli(['ci-status-all', 'providers.json', '123abcd'], { ...options, readBody: async () => '{"ci":{"provider":"github-actions"}}' }), 1);
});

test('reads all GitLab pipelines using GitLab credentials', async () => {
  const { messages, output } = capture();
  const options = { output, env: { GITLAB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ ci: { provider: 'gitlab-ci' } }), makeCi: (config, credentials) => { assert.equal(credentials.gitlabToken, 'secret'); return { listAllPipelines: async sha => [{ sha }] }; } };
  assert.equal(await runCli(['ci-status-all', 'providers.json', '123abcd'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).values[0].sha, '123abcd');
  assert.equal(await runCli(['ci-status-all', 'providers.json', '123abcd'], { ...options, env: {} }), 2);
});

test('reads provider-configured pull request discussion context', async () => {
  const { messages, output } = capture();
  const options = { output, env: { GITLAB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'gitlab' } }), makeScm: (_config, credentials) => { assert.equal(credentials.gitlabToken, 'secret'); return { provider: 'gitlab', getPullRequest: async () => ({ iid: 7 }), getPullRequestComments: async () => [{ id: 1 }] }; } };
  assert.equal(await runCli(['scm-pr-context', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).comments[0].id, 1);
  assert.equal(await runCli(['scm-pr-context', 'providers.json', '../bad'], options), 2);
});

test('reads GitHub PR file metadata through the configured SCM', async () => {
  const { messages, output } = capture();
  const p = { number: 7, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) }, changed_files: 1 };
  const options = { output, env: { GITHUB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'github' } }), makeScm: () => ({ provider: 'github', getPullRequest: async () => p, listPullRequestFiles: async () => [{ filename: 'test.js' }] }) };
  assert.equal(await runCli(['github-pr-files', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).files[0].filename, 'test.js');
  assert.equal(await runCli(['github-pr-files', 'providers.json', 'bad'], options), 2);
});

test('reads GitLab merge request diffs with the configured provider', async () => {
  const { messages, output } = capture();
  const refs = { base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40), start_sha: 'c'.repeat(40) };
  const options = { output, env: { GITLAB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'gitlab' } }), makeScm: () => ({ provider: 'gitlab', getPullRequest: async () => ({ iid: 7, diff_refs: refs }), listMergeRequestDiffs: async () => ({ values: [], nextPage: null }) }) };
  assert.equal(await runCli(['gitlab-mr-diffs', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).diffComplete, null);
  assert.equal(await runCli(['gitlab-mr-diffs', 'providers.json', 'bad'], options), 2);
});

test('reads explicitly selected Azure PR iteration changes', async () => {
  const { messages, output } = capture();
  const options = { output, env: { ADO_PAT: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'ado' } }), makeScm: (_config, credentials) => { assert.equal(credentials.adoToken, 'secret'); return { getIterationChanges: async (pr, iteration) => ({ changes: [{ pr, iteration }], complete: true }) }; } };
  assert.equal(await runCli(['ado-pr-changes', 'providers.json', '7', '3'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).changes[0].iteration, 3);
  assert.equal(await runCli(['ado-pr-changes', 'providers.json', '7', '0'], options), 2);
});

test('reads Bitbucket pull request statuses with the configured SCM', async () => {
  const { messages, output } = capture();
  const options = { output, env: { BITBUCKET_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'bitbucket-cloud' } }), makeScm: (_config, credentials) => { assert.equal(credentials.bitbucketToken, 'secret'); return { provider: 'bitbucket-cloud', getPullRequestStatuses: async number => [{ number }] }; } };
  assert.equal(await runCli(['bitbucket-pr-statuses', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).statuses[0].number, 7);
  assert.equal(await runCli(['bitbucket-pr-statuses', 'providers.json', '0'], options), 2);
});

test('builds GitHub review context using CI from the same SCM repository', async () => {
  const { messages, output } = capture();
  const p = { number: 7, head: { sha: 'a'.repeat(40) }, base: { sha: 'b'.repeat(40) }, changed_files: 0 };
  const options = { output, env: { GITHUB_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'github', owner: 'team', repository: 'site' }, ci: { provider: 'gitlab-ci' } }), makeScm: () => ({ provider: 'github', getPullRequest: async () => p, listIssueComments: async () => [], listReviewComments: async () => [], listReviews: async () => [], listPullRequestFiles: async () => [] }), makeCi: config => { assert.deepEqual(config, { provider: 'github-actions', owner: 'team', repository: 'site' }); return { provider: 'github-actions', listCheckRuns: async () => ({ total_count: 0, check_runs: [] }), getCommitStatus: async () => ({ total_count: 0 }) }; } };
  assert.equal(await runCli(['github-review-context', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).ciSummary.state, 'unknown');
  assert.equal(await runCli(['github-review-context', 'providers.json', 'bad'], options), 2);
});

test('reports plan status without changing the plan', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'aem-plan-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'implement.md');
  await writeFile(path, '### Step 1: Change\n**Status:** pending\n');
  const { messages, output } = capture();
  assert.equal(await runCli(['plan-status', path], { output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).next.number, 1);
  assert.equal(await runCli(['plan-status'], { output }), 2);
});

test('reads Bitbucket PR diffstat using the configured provider', async () => {
  const { messages, output } = capture();
  const pr = { id: 7, source: { commit: { hash: 'a'.repeat(40) } }, destination: { commit: { hash: 'b'.repeat(40) } } };
  const options = { output, env: { BITBUCKET_TOKEN: 'secret' }, readBody: async () => JSON.stringify({ scm: { provider: 'bitbucket-cloud' } }), makeScm: () => ({ provider: 'bitbucket-cloud', getPullRequest: async () => pr, getPullRequestDiffstat: async () => [{ status: 'modified' }] }) };
  assert.equal(await runCli(['bitbucket-pr-diffstat', 'providers.json', '7'], options), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).files[0].status, 'modified');
  assert.equal(await runCli(['bitbucket-pr-diffstat', 'providers.json', '0'], options), 2);
});

test('lists bundled skills without modifying a target project', async () => {
  const { messages, output } = capture();
  assert.equal(await runCli(['list-skills'], { output }), 0);
  assert.ok(JSON.parse(messages.logs.at(-1)).skills.some(skill => skill.name === 'agent-req'));
  assert.equal(await runCli(['list-skills', 'extra'], { output }), 2);
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

test('reports missing local ticket artifacts', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'ticket-status-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { messages, output } = capture();
  assert.equal(await runCli(['ticket-status', dir], { output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).files.find(file => file.name === 'raw-story.md').status, 'missing');
});

test('initializes a project from explicit non-secret provider configuration', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'project-init-cli-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const configPath = join(cwd, 'providers-input.json');
  await writeFile(configPath, JSON.stringify({ scm: { provider: 'github', owner: 'team', repository: 'site' } }));
  const { messages, output } = capture();
  assert.equal(await runCli(['project-init', configPath], { cwd, output }), 0);
  assert.match(JSON.parse(messages.logs.at(-1)).path, /providers\.json$/);
  assert.equal(await runCli(['project-init', configPath], { cwd, output }), 1);
});

test('inspects local project markers without executing project commands', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'inspect-project-cli-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, 'pom.xml'), '<project/>');
  const { messages, output } = capture();
  assert.equal(await runCli(['project-inspect'], { cwd, output }), 0);
  assert.ok(JSON.parse(messages.logs.at(-1)).signals.includes('Maven project marker'));
});

test('inspects a local AEM component without accessing an AEM instance', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'aem-doctor-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { messages, output } = capture();
  assert.equal(await runCli(['aem-doctor-component', dir], { output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).definition.status, 'missing');
});

test('inspects a local OSGi directory without printing config values', async t => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'aem-osgi-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'service.cfg.json'), '{"value":"private"}');
  const { messages, output } = capture();
  assert.equal(await runCli(['aem-doctor-osgi', dir], { output }), 0);
  assert.equal(JSON.parse(messages.logs.at(-1)).files[0].status, 'valid-json-object');
  assert.ok(!messages.logs.at(-1).includes('private'));
});
