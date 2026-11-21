import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeTicket } from '../src/ticket-init.js';
const ticket = { provider: 'github', number: 7, title: 'Change title', body: 'Original text', state: 'open', labels: [], comments: [] };
const config = { provider: 'github', owner: 'Team', repository: 'Site' };

test('initializes a source-bound ticket and refuses to overwrite it', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'ticket-init-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const result = await initializeTicket({ cwd, config, ticket });
  assert.equal(result.created, true);
  assert.equal(JSON.parse(await readFile(result.identityPath, 'utf8')).source, 'team/site');
  assert.match(await readFile(result.storyPath, 'utf8'), /Original text/);
  await assert.rejects(initializeTicket({ cwd, config, ticket }), { code: 'EEXIST' });
  assert.match(await readFile(result.storyPath, 'utf8'), /Original text/);
  await assert.rejects(initializeTicket({ cwd, config: { ...config, repository: 'other' }, ticket }), /identity does not match/);
});

test('does not adopt a legacy directory and can resume an identity-only directory', async t => {
  const cwd = await mkdtemp(join(tmpdir(), 'ticket-init-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const path = join(cwd, '.ai', 'specs', 'github-7-legacy');
  await mkdir(path, { recursive: true });
  await assert.rejects(initializeTicket({ cwd, config, ticket }), { code: 'ENOENT' });
  await writeFile(join(path, 'source-identity.json'), JSON.stringify({ version: 1, provider: 'github', source: 'team/site', id: 'github-7' }));
  const result = await initializeTicket({ cwd, config, ticket });
  assert.equal(result.created, false);
  assert.match(await readFile(result.storyPath, 'utf8'), /Original text/);
});
