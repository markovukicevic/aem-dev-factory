import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeHub } from '../src/hub-init.js';
import { inspectHubRepositories } from '../src/hub-repos.js';

test('creates an inspectable hub registry and refuses replacement', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'hub-init-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const result = await initializeHub({ cwd, repos: [{ name: 'web', path: '../web', 'base-branch': 'main' }] });
  const original = await readFile(result.path, 'utf8');
  assert.equal((await inspectHubRepositories({ cwd })).repos[0].name, 'web');
  await assert.rejects(initializeHub({ cwd, repos: [{ name: 'other', path: '../other' }] }), { code: 'EEXIST' });
  assert.equal(await readFile(result.path, 'utf8'), original);
});

test('rejects duplicate or unsafe entries and symlinked setup paths', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'hub-init-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await assert.rejects(initializeHub({ cwd, repos: [{ name: 'web', path: '../web' }, { name: 'web', path: '../two' }] }), /Invalid/);
  await assert.rejects(initializeHub({ cwd, repos: [{ name: 'web', path: '../web', token: 'secret' }] }), /Invalid/);
  await symlink('/tmp', join(cwd, '.ai'));
  await assert.rejects(initializeHub({ cwd, repos: [{ name: 'web', path: '../web' }] }), /directory/);
});
