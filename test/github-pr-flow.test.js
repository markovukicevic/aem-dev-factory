import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubPullRequest } from '../src/github-pr-flow.js';

const input = { cwd: '/repo', configPath: '/config', planPath: '/plan', owner: 'team', repository: 'site', token: 'token', title: 'Example' };
const readiness = { configDigest: 'e'.repeat(64), planDigest: 'c'.repeat(64), steps: [{ status: 'done' }], checks: { testsPassed: true, workingTreeClean: true }, branch: { head: 'feature', base: 'main', commit: 'a'.repeat(40) } };
const good = { ready: true, blockers: [], warnings: [], readiness };
const deps = () => ({ readConfigDigest: async () => 'e'.repeat(64), inspect: async () => good, refresh: async () => good, originReader: async () => ({ owner: 'team', repository: 'site' }), publishedReader: async () => ({ published: true, commit: 'a'.repeat(40) }), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: 'b'.repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => ({ number: 1 }) }) });

test('creates only after checks and repository identity succeed', async () => {
  let calls = 0;
  const dependencies = { ...deps(), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async fields => { calls++; assert.equal(fields.head, 'feature'); return { number: 1 }; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, true);
  assert.equal(calls, 1);
});

test('does not create a PR for a different origin, unpublished branch, or failed readiness', async () => {
  for (const override of [
    { originReader: async () => ({ owner: 'other', repository: 'site' }) },
    { publishedReader: async () => ({ published: false }) },
    { inspect: async () => ({ ready: false, blockers: ['tests failed'], warnings: [] }) },
    { refresh: async () => ({ ...good, readiness: { ...readiness, branch: { head: 'other', base: 'main' } } }) },
  ]) {
    let calls = 0;
    const result = await createGitHubPullRequest(input, { ...deps(), ...override, makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { calls++; } }) });
    assert.equal(result.created, false);
    assert.equal(calls, 0);
  }
});

test('does not create a PR when the branch changes during checks', async () => {
  let reads = 0;
  const dependencies = { ...deps(), publishedReader: async () => ({ published: true, commit: `${++reads}` }) };
  assert.equal((await createGitHubPullRequest(input, dependencies)).created, false);
});

test('integrates readiness and published branch checks against a real local Git origin', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-pr-flow-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const remote = join(dir, 'origin.git');
  const cwd = join(dir, 'repo');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const commit = () => git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'test']);
  commit();
  git(['remote', 'add', 'origin', remote]);
  git(['push', '-q', 'origin', 'HEAD:refs/heads/main']);
  await writeFile(join(cwd, 'feature.txt'), 'feature content');
  git(['add', 'feature.txt']);
  commit();
  git(['push', '-q', 'origin', 'HEAD:refs/heads/feature']);
  git(['fetch', '-q', 'origin']);
  const configPath = join(dir, 'config.json');
  const planPath = join(dir, 'implement.md');
  await writeFile(configPath, JSON.stringify({ scm: { baseBranch: 'main' }, test: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }));
  await writeFile(planPath, '### Step 1: Work\n**Status:** done\n');
  let creates = 0;
  const dependencies = { originReader: async () => ({ owner: 'team', repository: 'site' }), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { creates++; return { number: 1 }; } }) };
  const options = { ...input, cwd, configPath, planPath };
  assert.equal((await createGitHubPullRequest(options, dependencies)).created, true);
  commit();
  assert.equal((await createGitHubPullRequest(options, dependencies)).created, false);
  assert.equal(creates, 1);
});


test('does not create duplicate or empty pull requests', async () => {
  let creates = 0;
  const client = { listOpenPullRequests: async () => [{ number: 42, html_url: 'https://github.com/team/site/pull/42' }], createPullRequest: async () => { creates++; } };
  const duplicate = await createGitHubPullRequest(input, { ...deps(), makeClient: () => client });
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.existingPullRequests[0].number, 42);
  const empty = await createGitHubPullRequest(input, { ...deps(), inspectDiff: async () => ({ hasCommits: false }), makeClient: () => client });
  assert.equal(empty.created, false);
  const emptyCommit = await createGitHubPullRequest(input, { ...deps(), inspectDiff: async () => ({ hasCommits: true, hasChanges: false }), makeClient: () => client });
  assert.equal(emptyCommit.created, false);
  assert.equal(creates, 0);
});

test('rejects a published commit different from the tested commit', async () => {
  let writes = 0;
  const dependencies = { ...deps(), publishedReader: async () => ({ published: true, commit: 'b'.repeat(40) }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tested commit/);
});

test('rejects an implementation plan changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /plan changed/);
});

test('rejects readiness configuration changed after testing', async () => {
  let writes = 0;
  const dependencies = { ...deps(), readConfigDigest: async () => 'f'.repeat(64), makeClient: () => ({ createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /configuration changed/);
});

test('refuses to write when the plan changes during duplicate lookup', async () => {
  let refreshes = 0;
  let writes = 0;
  const dependencies = { ...deps(), refresh: async () => ++refreshes === 1 ? good : ({ ...good, readiness: { ...readiness, planDigest: 'd'.repeat(64) } }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /changed before/);
});

test('refuses to write if the tracked base changes during remote lookup', async () => {
  let diffs = 0, writes = 0;
  const dependencies = { ...deps(), inspectDiff: async () => ({ hasCommits: true, hasChanges: true, baseCommit: (++diffs === 1 ? 'b' : 'c').repeat(40), headCommit: 'a'.repeat(40) }), makeClient: () => ({ listOpenPullRequests: async () => [], listActivePullRequests: async () => [], createPullRequest: async () => { writes++; } }) };
  const result = await createGitHubPullRequest(input, dependencies);
  assert.equal(result.created, false);
  assert.equal(writes, 0);
  assert.match(result.blockers.join(' '), /tracked base changed/);
});


test('CLI connects a Jira source to the GitHub write and blocks a ticket change', async t => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { initializeTicket } = await import('../src/ticket-init.js');
  const { runCli } = await import('../src/cli.js');
  const dir = await mkdtemp(join(tmpdir(), 'devflow-ticket-pr-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const trackerConfig = { provider: 'jira', baseUrl: 'https://example.atlassian.net' };
  const ticket = { provider: 'jira', key: 'DEMO-7', title: 'Ticket title', comments: [], labels: [], body: null };
  const spec = await initializeTicket({ cwd: dir, config: trackerConfig, ticket });
  const planPath = join(spec.path, 'implement.md');
  const providersPath = join(dir, 'providers.json');
  const bodyPath = join(dir, 'pr.md');
  await writeFile(planPath, '### Step 1: Work\n**Status:** done\n');
  await writeFile(providersPath, JSON.stringify({ tracker: trackerConfig }));
  await writeFile(bodyPath, 'Reviewed description');
  let reads = 0, writes = 0, changeOnSecondRead = false, result;
  const tracker = { getTicket: async key => { assert.equal(key, 'DEMO-7'); reads++; return changeOnSecondRead && reads === 2 ? { ...ticket, title: 'Changed' } : ticket; } };
  const flowDeps = { ...deps(), makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { writes++; return { number: 1 }; } }) };
  const options = { env: { GITHUB_TOKEN: 'example', JIRA_EMAIL: 'example', JIRA_API_TOKEN: 'example' }, cwd: dir, output: { log: text => { result = JSON.parse(text); }, error: () => {} }, makeTracker: () => tracker, createPullRequest: input => createGitHubPullRequest(input, flowDeps) };
  const args = ['github-pr-create', 'team', 'site', '/config', planPath, 'Title', '--body-file', bodyPath, '--draft', '--ticket', providersPath, 'DEMO-7'];
  assert.equal(await runCli(args, options), 0);
  assert.equal(reads, 2); assert.equal(writes, 1); assert.equal(result.created, true);
  reads = 0; changeOnSecondRead = true;
  assert.equal(await runCli(args, options), 1);
  assert.equal(reads, 2); assert.equal(writes, 1); assert.match(result.blockers.join(' '), /changed/);
});

test('publishes only the reviewed commit and branch to the selected origin', async t => {
  const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { processGitHubBranchPublish } = await import('../src/github-branch-publish.js');
  const root = await mkdtemp(join(tmpdir(), 'ticket-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'origin.git'), cwd = join(root, 'repo'), spec = join(root, 'spec');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', '-b', 'main', cwd]);
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  await writeFile(join(cwd, 'file'), 'base'); git(['add', 'file']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'base']);
  git(['remote', 'add', 'origin', remote]); git(['push', '-q', 'origin', 'main']); git(['switch', '-q', '-c', 'feature/test']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'tag', '-a', 'unrelated', '-m', 'tag']);
  git(['config', 'push.followTags', 'true']);
  await mkdir(spec); await writeFile(join(spec, 'source-identity.json'), JSON.stringify({ version: 1, provider: 'jira', source: 'https://example.atlassian.net', id: 'ABC-1' }));
  const configPath = join(root, 'config.json'), providersPath = join(root, 'providers.json');
  await writeFile(configPath, JSON.stringify({ scm: { baseBranch: 'main' }, test: { executable: 'node', args: ['--version'] } }));
  await writeFile(providersPath, JSON.stringify({ scm: { provider: 'github', owner: 'team', repository: 'site' } }));
  const input = { cwd, spec, configPath, providersPath }, origin = { owner: 'team', repository: 'site' };
  const deps = { originReader: async () => origin, pushOriginReader: async () => origin };
  const preview = await processGitHubBranchPublish(input, deps);
  assert.equal(preview.allowed, true);
  assert.equal((await processGitHubBranchPublish({ ...input, expectedDigest: 'a'.repeat(64) }, deps)).published, false);
  const result = await processGitHubBranchPublish({ ...input, expectedDigest: preview.digest }, deps);
  assert.equal(result.published, true); assert.equal(result.sent, true);
  assert.equal(git(['ls-remote', '--tags', 'origin']), '');
  assert.equal((await processGitHubBranchPublish(input, deps)).alreadyPublished, true);
});

test('runs a ticket through a local branch, reviewed plan, publish, simulated PR and CI', async t => {
  const { mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { initializeTicket } = await import('../src/ticket-init.js');
  const { processTicketBranch } = await import('../src/ticket-branch.js');
  const { savePlanReview, checkPlanReview } = await import('../src/plan-review.js');
  const { previewWorkflowStep, startWorkflowStep, finishWorkflowStep } = await import('../src/workflow-step.js');
  const { readPlanStatus } = await import('../src/plan-status.js');
  const { savePullRequestDescription } = await import('../src/pr-description.js');
  const { compareTicketSource } = await import('../src/ticket-source-refresh.js');
  const { processGitHubBranchPublish } = await import('../src/github-branch-publish.js');
  const { readGitHubPullRequestCi } = await import('../src/github-pr-ci.js');
  const { evaluateExpectedGitHubChecks } = await import('../src/github-expected-checks.js');
  const root = await mkdtemp(join(tmpdir(), 'ticket-to-pr-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'origin.git'), cwd = join(root, 'repo');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  execFileSync('git', ['init', '-q', '-b', 'main', cwd]);
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const commit = message => git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', message]);
  await writeFile(join(cwd, '.gitignore'), '.ai/\n'); await writeFile(join(cwd, 'site.txt'), 'before\n');
  git(['add', '.gitignore', 'site.txt']); commit('base'); git(['remote', 'add', 'origin', remote]); git(['push', '-q', 'origin', 'main']);
  const tracker = { provider: 'jira', baseUrl: 'https://example.atlassian.net' };
  const ticket = { provider: 'jira', key: 'DEMO-7', title: 'Update page', body: null, comments: [], labels: [] };
  const spec = await initializeTicket({ cwd, config: tracker, ticket });
  const configPath = join(root, 'readiness.json'), providersPath = join(root, 'providers.json');
  await writeFile(configPath, JSON.stringify({ scm: { baseBranch: 'main' }, test: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } }));
  await writeFile(providersPath, JSON.stringify({ tracker, scm: { provider: 'github', owner: 'team', repository: 'site' } }));
  const branchInput = { cwd, spec: spec.path, configPath, branch: 'feature/demo-7', checkRemote: true };
  const branchPlan = await processTicketBranch(branchInput);
  assert.equal((await processTicketBranch({ ...branchInput, expectedDigest: branchPlan.digest })).created, true);
  for (const [name, contents] of [['dor.md', 'Ready'], ['explain.md', '## What & Why\nUpdate page'], ['research.md', 'Existing page']]) await writeFile(join(spec.path, name), contents);
  const planPath = join(spec.path, 'implement.md'), reportPath = join(spec.path, 'validation-report.md'), reviewInput = join(root, 'review.json');
  await writeFile(planPath, '---\nprovenance:\n  verified: false\n---\n### Step 1: Update page\n**Status:** pending\n');
  await writeFile(reviewInput, JSON.stringify({ verdict: 'ready', summary: 'Reviewed requirements and plan', findings: [], unresolved: [] }));
  await savePlanReview({ planPath, inputPath: reviewInput, outputPath: reportPath });
  const stepPlan = await previewWorkflowStep({ path: spec.path, step: 1 });
  assert.equal((await startWorkflowStep({ path: spec.path, step: 1, expectedDigest: stepPlan.planDigest })).evidenceCurrent, true);
  await writeFile(join(cwd, 'site.txt'), 'after\n'); git(['diff', '--check']);
  const evidenceInput = join(root, 'step.json');
  await writeFile(evidenceInput, JSON.stringify({ summary: 'Updated page', checks: [{ name: 'git diff --check', result: 'passed', evidence: 'No whitespace errors' }], limitations: [] }));
  const finished = await finishWorkflowStep({ path: spec.path, step: 1, outcome: 'done', inputPath: evidenceInput, outputPath: join(spec.path, 'step-evidence.json'), expectedDigest: (await readPlanStatus(planPath)).digest });
  assert.equal(finished.evidenceCurrent, true);
  await writeFile(join(spec.path, 'verification.md'), 'Reviewed change; git diff --check passed.');
  await writeFile(planPath, (await readFile(planPath, 'utf8')).replace('verified: false', 'verified: true'));
  git(['add', 'site.txt']); commit('Update page');
  const description = join(root, 'pr.md');
  await savePullRequestDescription({ explanationPath: join(spec.path, 'explain.md'), planPath, verificationPath: join(spec.path, 'verification.md'), ticketIdentityPath: spec.identityPath, outputPath: description });
  assert.match(await readFile(description, 'utf8'), /example\.atlassian\.net\/browse\/DEMO-7/);
  const origin = { owner: 'team', repository: 'site' }, publishInput = { cwd, spec: spec.path, configPath, providersPath };
  const publishDeps = { originReader: async () => origin, pushOriginReader: async () => origin };
  const publishPlan = await processGitHubBranchPublish(publishInput, publishDeps);
  assert.equal((await processGitHubBranchPublish({ ...publishInput, expectedDigest: publishPlan.digest }, publishDeps)).published, true);
  let writes = 0;
  const result = await createGitHubPullRequest({ cwd, configPath, planPath, owner: 'team', repository: 'site', title: 'Update page', body: await readFile(description, 'utf8'), ticketCheck: () => compareTicketSource({ path: spec.path, config: tracker, ticket }), reviewCheck: () => checkPlanReview({ planPath, reportPath }) }, { originReader: async () => origin, makeClient: () => ({ listOpenPullRequests: async () => [], createPullRequest: async () => { writes++; return { number: 11 }; } }) });
  assert.equal(result.created, true); assert.equal(writes, 1);
  const sha = git(['rev-parse', 'HEAD']), base = git(['rev-parse', 'origin/main']);
  const ci = await readGitHubPullRequestCi({ number: 11, scm: { provider: 'github', getPullRequest: async () => ({ number: 11, head: { sha }, base: { sha: base } }) }, ci: { provider: 'github-actions', listCheckRuns: async () => ({ total_count: 1, check_runs: [{ id: 1, name: 'build', status: 'completed', conclusion: 'success' }] }), getCommitStatus: async () => ({ total_count: 0, statuses: [] }) } });
  assert.equal(evaluateExpectedGitHubChecks({ summary: ci.summary, policy: { checks: [{ type: 'check-run', name: 'build' }] } }).state, 'success');
});
