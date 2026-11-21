import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalGitHubWebhookListener } from '../src/webhook-listener.js';

const secret = 'secret';
const body = JSON.stringify({ action: 'opened', issue: { number: 7 }, repository: { full_name: 'team/site' }, sender: { login: 'alex' } });
const headers = { 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`, 'x-github-event': 'issues', 'x-github-delivery': '12345678-1234-1234-1234-123456789abc' };

test('accepts signed local deliveries, deduplicates and refuses invalid signatures', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'webhook-listener-'));
  const server = await startLocalGitHubWebhookListener({ port: 0, secret, directory, policy: { allowedRepositories: ['team/site'], allowedActors: ['alex'] } });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 202);
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 200);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'x-hub-signature-256': 'bad' }, body })).status, 401);
  assert.equal((await fetch(`${url}/other`, { method: 'POST', body })).status, 404);
  assert.equal((await fetch(url, { method: 'POST', headers, body: 'x'.repeat(1024 * 1024 + 1) })).status, 413);
  assert.equal((await readdir(directory)).length, 1);
});

test('refuses invalid policy or missing secret before listening', async () => {
  await assert.rejects(startLocalGitHubWebhookListener({ port: 0, secret, directory: '/tmp', policy: { allowedRepositories: [], allowedActors: ['alex'] } }), /allowlists/);
  await assert.rejects(startLocalGitHubWebhookListener({ port: 0, secret: '', directory: '/tmp', policy: { allowedRepositories: ['team/site'], allowedActors: ['alex'] } }), /secret/);
});
