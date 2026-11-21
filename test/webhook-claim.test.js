import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimGitHubWebhook } from '../src/webhook-claim.js';

const body = Buffer.from(JSON.stringify({ action: 'opened', issue: { number: 7 }, repository: { full_name: 'team/site' }, sender: { login: 'alex' } }));
const secret = 'secret';
const input = { body, secret, signature: `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`, event: 'issues', deliveryId: '12345678-1234-1234-1234-123456789abc', allowedRepositories: ['team/site'], allowedActors: ['alex'] };

test('claims an accepted payload once, even with concurrent requests or a changed delivery ID', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'devflow-claim-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const results = await Promise.all([claimGitHubWebhook(input, { directory }), claimGitHubWebhook(input, { directory })]);
  assert.equal(results.filter(result => result.claimed).length, 1);
  assert.equal(results.filter(result => result.reason === 'duplicate-payload').length, 1);
  const replay = await claimGitHubWebhook({ ...input, deliveryId: '87654321-1234-1234-1234-123456789abc' }, { directory });
  assert.equal(replay.reason, 'duplicate-payload');
  assert.equal((await readdir(directory)).length, 1);
});

test('does not claim a bad signature or unauthorized actor', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'devflow-claim-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal((await claimGitHubWebhook({ ...input, signature: 'bad' }, { directory })).reason, 'invalid-signature');
  assert.equal((await claimGitHubWebhook({ ...input, allowedActors: ['other'] }, { directory })).reason, 'not-allowlisted');
  assert.deepEqual(await readdir(directory), []);
});
