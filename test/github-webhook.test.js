import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { inspectGitHubWebhook, verifyGitHubSignature } from '../src/github-webhook.js';

const secret = 'test-secret';
const deliveryId = '12345678-1234-1234-1234-123456789abc';
const policy = { secret, deliveryId, allowedRepositories: ['team/site'], allowedActors: ['alex'] };
function signed(payload, event) {
  const body = Buffer.from(JSON.stringify(payload));
  return { ...policy, body, event, signature: `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` };
}

test('verifies the published GitHub signature test vector and rejects tampering', () => {
  const body = Buffer.from('Hello, World!');
  const signature = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
  assert.equal(verifyGitHubSignature({ body, signature, secret: "It's a Secret to Everybody" }), true);
  assert.equal(verifyGitHubSignature({ body: Buffer.from('changed'), signature, secret: "It's a Secret to Everybody" }), false);
  assert.equal(verifyGitHubSignature({ body, signature: 'sha256=bad', secret }), false);
});

test('classifies only signed and allowlisted repository and actor events', () => {
  const payload = { action: 'opened', number: 7, pull_request: { number: 7 }, repository: { full_name: 'Team/Site' }, sender: { login: 'Alex' } };
  const request = signed(payload, 'pull_request');
  assert.deepEqual(inspectGitHubWebhook(request), { accepted: true, deliveryId, repository: 'Team/Site', actor: 'Alex', kind: 'pull-request', number: 7, action: 'opened' });
  assert.equal(inspectGitHubWebhook({ ...request, signature: 'sha256=bad' }).reason, 'invalid-signature');
  assert.equal(inspectGitHubWebhook({ ...request, allowedActors: ['other'] }).reason, 'not-allowlisted');
  assert.throws(() => inspectGitHubWebhook({ ...request, allowedActors: [] }));
});

test('requires an explicit mention for issue comments and never executes it', () => {
  const payload = { action: 'created', issue: { number: 7 }, comment: { body: '@aem-dev please inspect' }, repository: { full_name: 'team/site' }, sender: { login: 'alex' } };
  assert.equal(inspectGitHubWebhook(signed(payload, 'issue_comment')).kind, 'issue-comment');
  payload.comment.body = 'ordinary comment';
  assert.equal(inspectGitHubWebhook(signed(payload, 'issue_comment')).reason, 'no-command');
  payload.comment.body = '@aem-devil do work';
  assert.equal(inspectGitHubWebhook(signed(payload, 'issue_comment')).reason, 'no-command');
});
