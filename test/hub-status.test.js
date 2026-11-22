import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readHubStatuses } from '../src/hub-status.js';

async function fixture(t) {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-hub-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, '.ai'), { recursive: true });
  await writeFile(join(cwd, '.ai', 'config.yaml'), 'hub:\n  enabled: true\n');
  return cwd;
}

test('reads original hub status format and filters by ticket', async t => {
  const cwd = await fixture(t);
  const folder = join(cwd, 'state', 'TEAM-12');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'status.json'), JSON.stringify({ ticket: 'TEAM-12', title: 'Story', repos: { web: 'done', api: 'blocked' } }));
  const result = await readHubStatuses({ cwd, ticket: 'TEAM-12' });
  assert.equal(result.complete, true);
  assert.equal(result.dispatches[0].repos.api, 'blocked');
  assert.equal((await readHubStatuses({ cwd, ticket: 'OTHER-1' })).dispatches.length, 0);
});

test('rejects disabled hubs, unsafe ticket IDs and symlinked status files', async t => {
  const cwd = await fixture(t);
  await assert.rejects(readHubStatuses({ cwd, ticket: '../bad' }));
  const folder = join(cwd, 'state', '123');
  await mkdir(folder, { recursive: true });
  await symlink(join(cwd, '.ai', 'config.yaml'), join(folder, 'status.json'));
  assert.equal((await readHubStatuses({ cwd })).complete, false);
  await writeFile(join(cwd, '.ai', 'config.yaml'), 'hub:\n  enabled: false\n');
  await assert.rejects(readHubStatuses({ cwd }), /not enabled/);
});

test('reports validated local task details without exposing unrecognized fields', async t => {
  const cwd = await fixture(t);
  const folder = join(cwd, 'state', 'TASK-1');
  await mkdir(folder, { recursive: true });
  const statusPath = join(folder, 'status.json');
  await writeFile(statusPath, JSON.stringify({ ticket: 'TASK-1', title: 'Run', type: 'local-command', repos: { web: 'done', api: 'blocked' }, details: { web: { state: 'process-succeeded', startingCommit: 'a'.repeat(40), exitCode: 0, unexpected: 'private' }, api: { state: 'not-started' } } }));
  const result = await readHubStatuses({ cwd });
  assert.equal(result.dispatches[0].details.web.exitCode, 0);
  assert.equal(result.dispatches[0].details.api.state, 'not-started');
  assert.ok(!JSON.stringify(result).includes('private'));
  await writeFile(statusPath, JSON.stringify({ ticket: 'TASK-1', title: 'Run', type: 'local-command', repos: { web: 'done' }, details: { web: { state: 'not-started' } } }));
  assert.equal((await readHubStatuses({ cwd })).complete, false);
});
