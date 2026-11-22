import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureSpecDirectory } from '../src/spec-directory.js';

test('creates a ticket directory and reuses it when its title changes', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-spec-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const first = await ensureSpecDirectory({ cwd, id: 'TEAM-12', title: 'Hero component!' });
  assert.equal(first.created, true);
  assert.match(first.path, /TEAM-12-hero-component$/);
  await writeFile(join(first.path, 'raw-story.md'), 'user content');
  const second = await ensureSpecDirectory({ cwd, id: 'TEAM-12', title: 'Renamed story' });
  assert.equal(second.path, first.path);
  assert.equal(second.created, false);
  assert.equal(await readFile(join(first.path, 'raw-story.md'), 'utf8'), 'user content');
});

test('rejects invalid IDs, ambiguous directories and symlinks', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-spec-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  for (const id of ['../bad', '12', 'github-0', 'TEAM-1/../../x']) await assert.rejects(ensureSpecDirectory({ cwd, id, title: 'test' }));
  const root = join(cwd, '.ai', 'specs');
  await mkdir(join(root, 'ado-12-one'), { recursive: true });
  await mkdir(join(root, 'ado-12-two'));
  await assert.rejects(ensureSpecDirectory({ cwd, id: 'ado-12', title: 'test' }), /Multiple/);
  await symlink(cwd, join(root, 'github-7-link'));
  await assert.rejects(ensureSpecDirectory({ cwd, id: 'github-7', title: 'test' }), /not a directory/);
});
