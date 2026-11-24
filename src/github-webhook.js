import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Verify the raw request bytes using GitHub's HMAC-SHA256 signature. */
export function verifyGitHubSignature({ body, signature, secret }) {
  if (!Buffer.isBuffer(body) || body.length > 1024 * 1024) throw new TypeError('Invalid webhook body');
  if (typeof secret !== 'string' || !secret) throw new TypeError('Webhook secret is required');
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const supplied = Buffer.from(signature.slice(7), 'hex');
  return timingSafeEqual(expected, supplied);
}

/** Classify a signed delivery under explicit repository and actor allowlists. */
export function inspectGitHubWebhook({ body, signature, secret, event, deliveryId, allowedRepositories, allowedActors }) {
  if (!Array.isArray(allowedRepositories) || !allowedRepositories.length || allowedRepositories.some(value => typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) || !Array.isArray(allowedActors) || !allowedActors.length || allowedActors.some(value => typeof value !== 'string' || !/^[A-Za-z0-9-]+$/.test(value))) throw new TypeError('Non-empty repository and actor allowlists are required');
  if (typeof deliveryId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(deliveryId)) throw new TypeError('Invalid delivery ID');
  if (!verifyGitHubSignature({ body, signature, secret })) return { accepted: false, reason: 'invalid-signature' };
  let payload;
  try { payload = JSON.parse(body.toString('utf8')); } catch { return { accepted: false, reason: 'invalid-json' }; }
  const repository = payload?.repository?.full_name;
  const actor = payload?.sender?.login;
  if (typeof repository !== 'string' || typeof actor !== 'string' || !allowedRepositories.some(value => value.toLowerCase() === repository.toLowerCase()) || !allowedActors.some(value => value.toLowerCase() === actor.toLowerCase())) return { accepted: false, reason: 'not-allowlisted' };
  let kind;
  let number;
  let commentId;
  if (event === 'pull_request' && ['opened', 'reopened', 'synchronize'].includes(payload.action)) {
    number = payload.number;
    if (payload.pull_request?.number !== number) return { accepted: false, reason: 'invalid-payload' };
    kind = 'pull-request';
  } else if (event === 'issues' && payload.action === 'opened') {
    number = payload.issue?.number;
    kind = 'issue';
  } else if (event === 'issue_comment' && payload.action === 'created') {
    number = payload.issue?.number;
    if (typeof payload.comment?.body !== 'string' || !/^@aem-dev(?:\s|$)/i.test(payload.comment.body.trimStart())) return { accepted: false, reason: 'no-command' };
    kind = payload.issue?.pull_request ? 'pull-request-comment' : 'issue-comment';
    if (payload.comment?.id !== undefined) { if (!Number.isSafeInteger(payload.comment.id) || payload.comment.id < 1) return { accepted: false, reason: 'invalid-payload' }; commentId = payload.comment.id; }
  } else return { accepted: false, reason: 'unsupported-event' };
  if (!Number.isSafeInteger(number) || number < 1) return { accepted: false, reason: 'invalid-payload' };
  return { accepted: true, deliveryId, repository, actor, kind, number, action: payload.action, ...(commentId ? { commentId, commentBodyDigest: createHash('sha256').update(payload.comment.body, 'utf8').digest('hex') } : {}) };
}
