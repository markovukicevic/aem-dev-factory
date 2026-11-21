import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlugins } from '../scripts/validate-plugins.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'devflow-plugin-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.claude-plugin'), { recursive: true });
  await mkdir(join(root, 'plugins', 'core', '.claude-plugin'), { recursive: true });
  await mkdir(join(root, 'plugins', 'core', 'skills', 'agent-test'), { recursive: true });
  const marketplace = { name: 'test', owner: { name: 'owner' }, plugins: [{ name: 'core', source: './plugins/core' }] };
  await writeFile(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify(marketplace));
  await writeFile(join(root, 'plugins', 'core', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'core', version: '1.0.0' }));
  await writeFile(join(root, 'plugins', 'core', 'skills', 'agent-test', 'SKILL.md'), '---\nname: agent-test\ndescription: Test workflow\n---\nInstructions\n');
  return { root, marketplace };
}

test('validates a marketplace with a real plugin and skill', async t => {
  const { root } = await fixture(t);
  assert.deepEqual(await validatePlugins(root), { plugins: 1, skills: 1 });
});

test('rejects mismatched manifests and invalid skill metadata', async t => {
  const { root } = await fixture(t);
  await writeFile(join(root, 'plugins', 'core', 'skills', 'agent-test', 'SKILL.md'), '---\nname: other\ndescription: Test\n---\n');
  await assert.rejects(validatePlugins(root), /Invalid skill metadata/);
});

test('rejects plugin sources outside the marketplace', async t => {
  const { root, marketplace } = await fixture(t);
  marketplace.plugins[0].source = './..';
  await writeFile(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify(marketplace));
  await assert.rejects(validatePlugins(root), /escapes marketplace root/);
});
