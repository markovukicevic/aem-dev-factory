import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimGitHubWebhook } from '../src/webhook-claim.js';
import { listWebhookClaims } from '../src/webhook-claims.js';

test('lists accepted event metadata without storing payload content', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'webhook-claims-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secret = 'secret';
  const body = Buffer.from(JSON.stringify({ action: 'opened', issue: { number: 7, title: 'private body' }, repository: { full_name: 'team/site' }, sender: { login: 'alex' } }));
  const input = { body, secret, signature: `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`, event: 'issues', deliveryId: '12345678-1234-1234-1234-123456789abc', allowedRepositories: ['team/site'], allowedActors: ['alex'] };
  assert.equal((await claimGitHubWebhook(input, { directory })).claimed, true);
  const result = await listWebhookClaims({ directory });
  assert.equal(result.claims[0].repository, 'team/site');
  assert.equal(result.claims[0].number, 7);
  assert.equal(result.complete, true);
  assert.ok(!JSON.stringify(result).includes('private body'));
});

test('recognizes legacy claims and reports malformed or symlinked claims', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'webhook-claims-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const digest = 'a'.repeat(64);
  await writeFile(join(directory, `${digest}.json`), JSON.stringify({ digest, deliveryId: '12345678-1234-1234-1234-123456789abc', claimedAt: '2026-11-21T12:00:00Z' }));
  await writeFile(join(directory, `${'b'.repeat(64)}.json`), '{broken');
  await symlink('/tmp', join(directory, `${'c'.repeat(64)}.json`));
  const result = await listWebhookClaims({ directory });
  assert.equal(result.claims[0].metadataAvailable, false);
  assert.equal(result.errors.length, 2);
  assert.equal(result.complete, false);
  await assert.rejects(listWebhookClaims({ directory, maxEntries: 1 }), /limit/);
});
