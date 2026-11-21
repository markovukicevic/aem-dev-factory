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

test('reports malformed status rather than silently claiming completeness', async t => {
  const cwd = await fixture(t);
  const folder = join(cwd, 'state', '123');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'status.json'), JSON.stringify({ ticket: '123', title: 'Story', repos: { web: 'invented' } }));
  const result = await readHubStatuses({ cwd });
  assert.equal(result.complete, false);
  assert.deepEqual(result.errors, [{ ticket: '123', message: 'Status file missing or invalid' }]);
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
