import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubOrigin, readGitHubOrigin } from '../src/github-origin.js';

test('parses standard HTTPS and SSH origin URLs', () => {
  for (const url of ['https://github.com/Team/Repo.git', 'git@github.com:Team/Repo.git', 'ssh://git@github.com/Team/Repo']) {
    assert.deepEqual(parseGitHubOrigin(url), { owner: 'Team', repository: 'Repo' });
  }
});

test('rejects other hosts, credentials, paths and query strings', () => {
  for (const url of ['https://evil.example/Team/Repo', 'https://token@github.com/Team/Repo', 'https://github.com/Team/Repo?secret=x', 'git@github.com:Team/Repo/extra', 'https://github.com/../Repo']) assert.throws(() => parseGitHubOrigin(url));
});

test('reads the origin through Git without a shell', async () => {
  const run = async (command, args) => { assert.equal(command, 'git'); assert.deepEqual(args, ['remote', 'get-url', 'origin']); return { stdout: 'git@github.com:team/repo.git\n' }; };
  assert.equal((await readGitHubOrigin('/repo', { run })).repository, 'repo');
});
