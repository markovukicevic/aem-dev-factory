import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseLegacyConfig, parseLegacyTestCommand } from '../src/legacy-config.js';
import { loadReadinessConfig } from '../src/config.js';
import { inspectConfiguredReadiness } from '../src/configured-readiness.js';

test('reads legacy YAML and handles quoted test arguments', async () => {
  const source = 'scm:\n  base-branch: develop\nbuild:\n  test: \'mvn test -Dtest="Foo Bar"\'\n';
  const config = await loadReadinessConfig('config.yaml', { read: async () => source });
  assert.deepEqual(config, { scm: { baseBranch: 'develop' }, test: { executable: 'mvn', args: ['test', '-Dtest=Foo Bar'] } });
});

test('rejects commands requiring a shell and unfinished templates', () => {
  for (const command of ['npm test && npm run lint', 'npm test > output', 'echo $(whoami)', 'echo `whoami`', 'npm $VAR', 'npm test # comment', 'npm test *.js', 'npm "unterminated', 'VAR=value npm test']) {
    assert.throws(() => parseLegacyTestCommand(command), TypeError, command);
  }
  assert.throws(() => parseLegacyConfig('build:\n  test: "{{TEST_COMMAND}}"'));
  assert.throws(() => parseLegacyConfig('scm:\n  base-branch: main\n  base-branch: other\nbuild:\n  test: npm test'));
});

test('checks a real repository using the reference YAML settings', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-legacy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cwd = join(dir, 'repo');
  execFileSync('git', ['init', '-q', '-b', 'feature', cwd]);
  const configPath = join(dir, 'config.yaml');
  const planPath = join(dir, 'implement.md');
  await writeFile(configPath, `scm:\n  base-branch: main\nbuild:\n  test: >-\n    ${process.execPath} -e 'process.exit(0)'\n`);
  await writeFile(planPath, '### Step 1: Work\n**Status:** done\n');
  assert.equal((await inspectConfiguredReadiness({ cwd, configPath, planPath })).ready, true);
});

test('reference template placeholders are not treated as runnable commands', async () => {
  // This fixture is supplied through a literal equivalent so the suite stays hermetic.
  const source = 'scm:\n  base-branch: "{{BASE_BRANCH}}"\nbuild:\n  test: "{{TEST_COMMAND}}"\n';
  assert.throws(() => parseLegacyConfig(source));
});
