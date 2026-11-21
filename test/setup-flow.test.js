import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCli } from '../src/cli.js';

test('sets up a project, diagnoses credentials and initializes a source-bound ticket', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'devflow-setup-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const input = join(cwd, 'input.json');
  const config = { tracker: { provider: 'github', owner: 'team', repository: 'issues' }, scm: { provider: 'github', owner: 'team', repository: 'code' } };
  await writeFile(input, JSON.stringify(config));
  const logs = [];
  const output = { log: value => logs.push(value), error: () => {} };
  const env = { GITHUB_TOKEN: 'not-for-output' };
  const makeTracker = () => ({ getTicket: async number => ({ provider: 'github', number, title: 'Story', body: 'Acceptance criteria', state: 'open', labels: [], comments: [] }) });
  assert.equal(await runCli(['project-init', input], { cwd, output, env }), 0);
  const providersPath = JSON.parse(logs.at(-1)).path;
  assert.equal(await runCli(['project-doctor', providersPath], { cwd, output, env }), 0);
  assert.ok(!logs.at(-1).includes('not-for-output'));
  assert.equal(await runCli(['ticket-init', providersPath, '7'], { cwd, output, env, makeTracker }), 0);
  const initialized = JSON.parse(logs.at(-1));
  assert.match(await readFile(initialized.storyPath, 'utf8'), /Acceptance criteria/);
  assert.equal(await runCli(['ticket-status', initialized.path], { cwd, output, env }), 0);
  assert.equal(JSON.parse(logs.at(-1)).identity.source, 'team/issues');
  assert.equal(await runCli(['ticket-init', providersPath, '7'], { cwd, output, env, makeTracker }), 1);
});
