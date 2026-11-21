import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectHubRepositories } from '../src/hub-repos.js';

test('inspects local hub repositories without assuming remote identity', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'hub-repos-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, '.ai'));
  await mkdir(join(cwd, 'web'));
  await mkdir(join(cwd, 'web', '.git'));
  await symlink(join(cwd, 'web'), join(cwd, 'linked'));
  await writeFile(join(cwd, '.ai', 'config.yaml'), 'hub:\n  enabled: true\n  repos:\n    - name: web\n      path: web\n      base-branch: main\n    - name: absent\n      path: absent\n    - name: linked\n      path: linked\n');
  const result = await inspectHubRepositories({ cwd });
  assert.equal(result.repos[0].gitMarker, 'present');
  assert.equal(result.repos[1].status, 'missing');
  assert.equal(result.repos[2].status, 'unsupported');
  assert.match(result.scope, /not verified/);
});

test('rejects duplicated names and disabled hubs', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'hub-repos-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, '.ai'));
  const config = join(cwd, '.ai', 'config.yaml');
  await writeFile(config, 'hub:\n  enabled: true\n  repos:\n    - name: web\n      path: one\n    - name: web\n      path: two\n');
  await assert.rejects(inspectHubRepositories({ cwd }), /Invalid/);
  await writeFile(config, 'hub:\n  enabled: false\n  repos: []\n');
  await assert.rejects(inspectHubRepositories({ cwd }), /disabled/);
});
