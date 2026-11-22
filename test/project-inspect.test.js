import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectProject } from '../src/project-inspect.js';

test('reports only supported local project markers and dependency signals', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'inspect-project-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, 'ui.apps'));
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ dependencies: { react: '1' }, devDependencies: { 'aem-clientlib-generator': '1' } }));
  await symlink('/tmp', join(cwd, '.ai'));
  const result = await inspectProject({ cwd });
  assert.ok(result.signals.includes('AEM-style project structure marker'));
  assert.ok(result.signals.includes('react dependency'));
  assert.equal(result.markers.find(item => item.name === '.ai').type, 'unsupported');
  assert.match(result.scope, /not verified/);
});
