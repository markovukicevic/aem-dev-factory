import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadReadinessConfig } from '../src/config.js';
import { inspectConfiguredReadiness } from '../src/configured-readiness.js';

test('loads explicit command configuration and rejects malformed values', async () => {
  const load = value => loadReadinessConfig('config.json', { read: async () => JSON.stringify(value) });
  assert.deepEqual(await load({ scm: { baseBranch: 'main' }, test: { executable: 'npm', args: ['test'] } }), { scm: { baseBranch: 'main' }, test: { executable: 'npm', args: ['test'] } });
  await assert.rejects(load({ test: { executable: 'npm', args: 'test' } }));
  await assert.rejects(load({ test: { executable: '', args: [] } }));
  await assert.rejects(load({ test: { executable: 'npm', args: [], timeoutMs: 0 } }));
});

test('checks a real plan using a configured base and actual test process', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cwd = join(dir, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
  const configPath = join(dir, 'devflow.json');
  const planPath = join(dir, 'implement.md');
  await writeFile(planPath, '### Step 1: Work\n**Status:** done\n');
  const config = { scm: { baseBranch: 'main' }, test: { executable: process.execPath, args: ['-e', 'process.exit(0)'] } };
  await writeFile(configPath, JSON.stringify(config));
  assert.equal((await inspectConfiguredReadiness({ cwd, configPath, planPath })).ready, true);
  config.test.args[1] = 'process.exit(3)';
  await writeFile(configPath, JSON.stringify(config));
  const result = await inspectConfiguredReadiness({ cwd, configPath, planPath });
  assert.equal(result.ready, false);
  assert.equal(result.testResult.exitCode, 3);
});

test('does not start testing when base-branch resolution fails', async () => {
  let inspected = false;
  await assert.rejects(inspectConfiguredReadiness({ cwd: '/repo', configPath: 'config.json', planPath: 'plan.md' }, {
    loadConfig: async () => ({ scm: {}, test: { executable: 'test', args: [] } }),
    resolveBase: async () => { throw new Error('missing base'); },
    inspect: async () => { inspected = true; },
  }));
  assert.equal(inspected, false);
});
