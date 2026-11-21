import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdoOrigin } from '../src/ado-origin.js';

test('parses standard Azure DevOps HTTPS and SSH remotes', () => {
  for (const url of ['https://dev.azure.com/org/My%20Project/_git/repo', 'https://org@dev.azure.com/org/My%20Project/_git/repo', 'git@ssh.dev.azure.com:v3/org/My%20Project/repo']) {
    assert.deepEqual(parseAdoOrigin(url), { organization: 'org', project: 'My Project', repository: 'repo' });
  }
});

test('rejects untrusted URLs and embedded passwords', () => {
  for (const url of ['https://evil.com/org/p/_git/r', 'https://org:secret@dev.azure.com/org/p/_git/r', 'git@ssh.dev.azure.com:v3/org/p/r/extra', 'https://dev.azure.com/org/p/_git/..']) assert.throws(() => parseAdoOrigin(url));
});
