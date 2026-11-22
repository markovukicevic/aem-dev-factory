import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { runTestCommand } from '../src/command-runner.js';

test('records the outcome of a real command', async () => {
  assert.deepEqual(await runTestCommand({ cwd: tmpdir(), executable: process.execPath, args: ['-e', 'process.exit(0)'] }), { passed: true, exitCode: 0 });
  assert.deepEqual(await runTestCommand({ cwd: tmpdir(), executable: process.execPath, args: ['-e', 'process.exit(7)'] }), { passed: false, exitCode: 7 });
});

test('fails closed on unavailable commands and timeouts without leaking output', async () => {
  const unavailable = await runTestCommand({ cwd: tmpdir(), executable: '/no-such-test-executable' });
  assert.deepEqual(unavailable, { passed: false, exitCode: null });
  const timeout = await runTestCommand({ cwd: tmpdir(), executable: process.execPath, args: ['-e', 'setTimeout(() => {}, 10000)'], timeoutMs: 20 });
  assert.deepEqual(timeout, { passed: false, exitCode: null });
});

test('passes arguments directly without shell expansion', async () => {
  let captured;
  const result = await runTestCommand({ cwd: tmpdir(), executable: 'example', args: ['$(not-executed)'] }, { run: async (...args) => { captured = args; } });
  assert.equal(result.passed, true);
  assert.deepEqual(captured[1], ['$(not-executed)']);
  await assert.rejects(runTestCommand({ cwd: tmpdir(), executable: 'test', args: 'bad' }), TypeError);
});

test('bounds waiting when the command promise does not settle', async () => {
  const started = Date.now();
  const result = await runTestCommand({ cwd: tmpdir(), executable: 'example', timeoutMs: 20 }, { run: () => new Promise(() => {}) });
  assert.deepEqual(result, { passed: false, exitCode: null });
  assert.ok(Date.now() - started < 3000);
});

test('force-kills a direct child that ignores termination', { skip: process.platform === 'win32' }, async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'command-timeout-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const marker = join(dir, 'sigterm.txt');
  const script = "process.on('SIGTERM', () => require('node:fs').writeFileSync(process.argv[1], 'received')); setInterval(() => {}, 1000)";
  const started = Date.now();
  const result = await runTestCommand({ cwd: dir, executable: process.execPath, args: ['-e', script, marker], timeoutMs: 1000 });
  assert.deepEqual(result, { passed: false, exitCode: null });
  assert.equal(await readFile(marker, 'utf8'), 'received');
  assert.ok(Date.now() - started < 5000);
});

test('does not report a pass when a process exits successfully after the deadline', { skip: process.platform === 'win32' }, async () => {
  const script = "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)";
  const result = await runTestCommand({ cwd: tmpdir(), executable: process.execPath, args: ['-e', script], timeoutMs: 1000 });
  assert.deepEqual(result, { passed: false, exitCode: null });
});
