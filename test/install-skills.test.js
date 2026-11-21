import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installSkills } from '../src/install-skills.js';

test('installs multiple explicitly selected skills into a project', async t => {
  const target = await mkdtemp(join(tmpdir(), 'skills-batch-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  const result = await installSkills({ client: 'codex', target, names: ['agent-req', 'agent-plan'] });
  assert.equal(result.complete, true);
  assert.deepEqual(result.installed.map(item => item.name), ['agent-req', 'agent-plan']);
  assert.match(await readFile(join(target, '.agents', 'skills', 'agent-plan', 'SKILL.md'), 'utf8'), /name: agent-plan/);
});

test('preflight refuses collisions before installing other skills', async t => {
  const target = await mkdtemp(join(tmpdir(), 'skills-batch-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  const existing = join(target, '.agents', 'skills', 'agent-plan');
  await mkdir(existing, { recursive: true });
  await writeFile(join(existing, 'SKILL.md'), 'original');
  await assert.rejects(installSkills({ client: 'codex', target, names: ['agent-req', 'agent-plan'] }), /already exists/);
  assert.equal(await readFile(join(existing, 'SKILL.md'), 'utf8'), 'original');
  await assert.rejects(readFile(join(target, '.agents', 'skills', 'agent-req', 'SKILL.md')), { code: 'ENOENT' });
});

test('reports partial installation rather than hiding or rolling back earlier success', async t => {
  const target = await mkdtemp(join(tmpdir(), 'skills-batch-'));
  t.after(() => rm(target, { recursive: true, force: true }));
  const result = await installSkills({ client: 'codex', target, names: ['agent-req', 'agent-plan'] }, { list: async () => ({ skills: [{ name: 'agent-req', installable: true }, { name: 'agent-plan', installable: true }] }), install: async ({ name }) => { if (name === 'agent-plan') throw new Error('copy failed'); return { name }; } });
  assert.equal(result.complete, false);
  assert.equal(result.failed, 'agent-plan');
  assert.equal(result.installed[0].name, 'agent-req');
});
