import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findAemComponents } from '../src/aem-components.js';

test('locates real local component candidates and observed source files', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'aem-component-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const root = join(cwd, 'ui.apps', 'jcr_root', 'apps', 'site', 'components', 'content', 'hero');
  await mkdir(join(root, '_cq_dialog'), { recursive: true });
  await writeFile(join(root, '.content.xml'), '<component/>');
  await writeFile(join(root, 'hero.html'), '<div/>');
  await writeFile(join(root, '_cq_dialog', '.content.xml'), '<dialog/>');
  await mkdir(join(cwd, 'node_modules', 'components', 'hero'), { recursive: true });
  await writeFile(join(cwd, 'node_modules', 'components', 'hero', '.content.xml'), '<ignored/>');
  await symlink(root, join(cwd, 'link'));
  const result = await findAemComponents({ cwd, name: 'Hero' });
  assert.equal(result.candidates.length, 1);
  assert.match(result.candidates[0].definition, /hero\/\.content\.xml$/);
  assert.match(result.candidates[0].dialog, /hero\/_cq_dialog\/\.content\.xml$/);
  assert.ok(result.candidates[0].files.some(path => path.endsWith('hero.html')));
  assert.match(result.scope, /not checked/);
});

test('rejects unsafe names and fails rather than returning partial results', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'aem-component-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, 'components', 'hero'), { recursive: true });
  await assert.rejects(findAemComponents({ cwd, name: '../hero' }));
  await assert.rejects(findAemComponents({ cwd, name: 'hero', maxEntries: 1 }), /incomplete/);
});
