import test from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../src/cli.js';

function capture() {
  const messages = { logs: [], errors: [] };
  return { messages, output: { log: value => messages.logs.push(value), error: value => messages.errors.push(value) } };
}

test('reads a pull request using a token from the environment', async () => {
  const { messages, output } = capture();
  let options;
  const code = await runCli(['github-pr', 'team', 'site', '12'], {
    env: { GITHUB_TOKEN: 'secret' }, output,
    makeClient: input => { options = input; return { getPullRequest: async number => ({ number }) }; },
  });
  assert.equal(code, 0);
  assert.deepEqual(options, { owner: 'team', repository: 'site', token: 'secret' });
  assert.deepEqual(JSON.parse(messages.logs[0]), { number: 12 });
  assert.deepEqual(messages.errors, []);
});

test('rejects malformed input and missing credentials before constructing a client', async () => {
  const { output } = capture();
  const makeClient = () => { throw new Error('must not be called'); };
  assert.equal(await runCli(['github-pr', 'team', 'site', '1x'], { env: {}, output, makeClient }), 2);
  assert.equal(await runCli(['github-pr', 'team', 'site', '1'], { env: {}, output, makeClient }), 2);
});

test('reports failures without exposing credentials or server error messages', async () => {
  const { messages, output } = capture();
  const code = await runCli(['github-pr', 'team', 'site', '1'], {
    env: { GITHUB_TOKEN: 'secret' }, output,
    makeClient: () => ({ getPullRequest: async () => { throw new Error('secret'); } }),
  });
  assert.equal(code, 1);
  assert.equal(messages.errors[0].includes('secret'), false);
});
