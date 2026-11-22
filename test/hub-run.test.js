import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { initializeHub } from '../src/hub-init.js';
import { readHubStatuses } from '../src/hub-status.js';
import { runHubTask } from '../src/hub-run.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'hub-run-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const hub = join(root, 'hub'), web = join(root, 'web'), api = join(root, 'api');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(hub);
  for (const cwd of [web, api]) {
    execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'initial'], { cwd });
  }
  await initializeHub({ cwd: hub, repos: [{ name: 'web', path: web }, { name: 'api', path: api }] });
  return { hub, web, api };
}
const task = { ticket: 'TASK-7', title: 'Test task', repositories: ['web', 'api'], executable: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 10000 };

test('runs a trusted command sequentially and records compatible hub status', async t => {
  const { hub } = await fixture(t);
  const result = await runHubTask({ cwd: hub, task });
  assert.equal(result.complete, true);
  assert.deepEqual(result.repos, { web: 'done', api: 'done' });
  const report = await readHubStatuses({ cwd: hub, ticket: task.ticket });
  assert.deepEqual(report.dispatches[0].repos, result.repos);
  assert.equal(report.dispatches[0].details.web.state, 'process-succeeded');
  assert.equal(report.dispatches[0].details.web.exitCode, 0);
  assert.match(result.scope, /not verified/);
  await assert.rejects(runHubTask({ cwd: hub, task }), { code: 'EEXIST' });
});

test('stops on failure and keeps later repositories unstarted', async t => {
  const { hub } = await fixture(t);
  const result = await runHubTask({ cwd: hub, task: { ...task, args: ['-e', 'process.exit(3)'] } });
  assert.equal(result.complete, false);
  assert.equal(result.repos.web, 'failed');
  assert.equal(result.repos.api, 'blocked');
  assert.equal(result.details.web.exitCode, 3);
  assert.equal(result.details.api.state, 'not-started');
});

test('preflight refuses dirty repositories and rechecks before each run', async t => {
  const { hub, web } = await fixture(t);
  await writeFile(join(web, 'user-change.txt'), 'preserve');
  await assert.rejects(runHubTask({ cwd: hub, task }), /clean/);
  assert.equal(await readFile(join(web, 'user-change.txt'), 'utf8'), 'preserve');
  await rm(join(web, 'user-change.txt'));
  let checks = 0, runs = 0;
  const inspect = async () => ({ head: 'feature', commit: (++checks === 4 ? 'b' : 'a').repeat(40), workingTreeClean: true });
  const result = await runHubTask({ cwd: hub, task }, { inspect, run: async () => { runs++; return { passed: true, exitCode: 0 }; } });
  assert.equal(runs, 1);
  assert.equal(result.details.api.state, 'repository-changed-before-run');
  assert.equal(result.repos.api, 'blocked');
});

test('previews targets without running a command, writing state or exposing arguments', async t => {
  const { previewHubTask } = await import('../src/hub-run.js');
  const { hub } = await fixture(t);
  const secret = 'do-not-print-argument';
  const preview = await previewHubTask({ cwd: hub, task: { ...task, args: [secret] } });
  assert.deepEqual(preview.repositories.map(repo => repo.name), ['web', 'api']);
  assert.equal(preview.argumentCount, 1);
  assert.ok(!JSON.stringify(preview).includes(secret));
  const { lstat } = await import('node:fs/promises');
  await assert.rejects(lstat(join(hub, 'state', task.ticket)), { code: 'ENOENT' });
  assert.match(preview.scope, /not verified/);
});
