import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkill } from '../src/install-skill.js';

async function fixture(t) {
  const base = await mkdtemp(join(tmpdir(), 'devflow-install-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const sourceRoot = join(base, 'source');
  const target = join(base, 'target');
  await mkdir(join(sourceRoot, '.claude-plugin'), { recursive: true });
  await mkdir(join(sourceRoot, 'plugins', 'core', 'skills', 'agent-test'), { recursive: true });
  await mkdir(target);
  await writeFile(join(sourceRoot, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: [{ source: './plugins/core' }] }));
  await writeFile(join(sourceRoot, 'plugins', 'core', 'skills', 'agent-test', 'SKILL.md'), '---\nname: agent-test\ndescription: Test\n---\nInstructions\n');
  return { sourceRoot, target, base };
}

test('installs one skill to each client location without overwriting', async t => {
  const { sourceRoot, target } = await fixture(t);
  for (const [client, directory] of [['codex', '.agents'], ['claude', '.claude'], ['copilot', '.github']]) {
    const result = await installSkill({ client, name: 'agent-test', target, sourceRoot });
    assert.equal(result.path, join(await realpath(target), directory, 'skills', 'agent-test'));
    assert.match(await readFile(join(result.path, 'SKILL.md'), 'utf8'), /Instructions/);
    await assert.rejects(installSkill({ client, name: 'agent-test', target, sourceRoot }), /already exists/);
  }
});

test('rejects invalid skills, source traversal and symlinked destinations', async t => {
  const { sourceRoot, target, base } = await fixture(t);
  await assert.rejects(installSkill({ client: 'codex', name: '../bad', target, sourceRoot }));
  await assert.rejects(installSkill({ client: 'codex', name: 'missing', target, sourceRoot }));
  await symlink(base, join(target, '.agents'));
  await assert.rejects(installSkill({ client: 'codex', name: 'agent-test', target, sourceRoot }), /symlink/);
});
