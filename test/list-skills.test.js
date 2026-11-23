import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listSkills } from '../src/list-skills.js';

test('lists bounded skill directories and flags duplicate names', async t => {
  const root = await mkdtemp(join(tmpdir(), 'skill-catalog-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, '.claude-plugin'), { recursive: true });
  await writeFile(join(root, '.claude-plugin', 'marketplace.json'), JSON.stringify({ plugins: [{ name: 'one', source: './plugins/one' }, { name: 'two', source: './plugins/two' }] }));
  async function skill(plugin, name, asset = false) {
    const dir = join(root, 'plugins', plugin, 'skills', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Test skill\n---\n`);
    if (asset) await writeFile(join(dir, 'helper.txt'), 'data');
  }
  await skill('one', 'unique');
  await skill('one', 'asset', true);
  await skill('one', 'duplicate');
  await skill('two', 'duplicate');
  const result = await listSkills({ sourceRoot: root });
  assert.equal(result.skills.find(item => item.name === 'unique').installable, true);
  assert.equal(result.skills.find(item => item.name === 'asset').installable, true);
  assert.equal(result.skills.filter(item => item.name === 'duplicate').every(item => !item.installable), true);
  assert.match(result.scope, /not verified/);
});
