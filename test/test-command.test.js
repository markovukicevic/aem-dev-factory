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
