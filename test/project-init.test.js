import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject } from '../src/project-init.js';
const config = { tracker: { provider: 'github', owner: 'team', repository: 'issues' }, scm: { provider: 'gitlab', project: 'team/code' }, ci: { provider: 'bitbucket-pipelines', workspace: 'team', repository: 'site' } };

test('creates explicit non-secret provider configuration without replacement', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'project-init-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const result = await initializeProject({ cwd, config });
  assert.deepEqual(JSON.parse(await readFile(result.path, 'utf8')), config);
  await assert.rejects(initializeProject({ cwd, config }), { code: 'EEXIST' });
  assert.deepEqual(JSON.parse(await readFile(result.path, 'utf8')), config);
});

test('rejects secrets, unsupported fields and symlinked setup directories', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'project-init-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await assert.rejects(initializeProject({ cwd, config: { tracker: { ...config.tracker, token: 'secret' } } }), /Unexpected/);
  await assert.rejects(initializeProject({ cwd, config: { tracker: { provider: 'github', owner: 'team' } } }), /missing/);
  const outside = join(cwd, 'outside');
  await mkdir(outside);
  await symlink(outside, join(cwd, '.ai'));
  await assert.rejects(initializeProject({ cwd, config }), /directory/);
});
