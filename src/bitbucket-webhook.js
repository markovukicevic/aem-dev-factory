import { verifyGitHubSignature } from './github-webhook.js';
const uuidPattern = /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i;

/** Inspect a signed Bitbucket Cloud pull-request payload using stable UUID allowlists. */
export function inspectBitbucketWebhook({ body, secret, signature, event, allowedRepositories, allowedActors }) {
  const valid = values => Array.isArray(values) && values.length > 0 && values.length <= 100 && values.every(value => typeof value === 'string' && uuidPattern.test(value));
  if (!valid(allowedRepositories) || !valid(allowedActors)) throw new TypeError('Explicit Bitbucket UUID allowlists are required');
  if (!verifyGitHubSignature({ body, signature, secret })) return { accepted: false, reason: 'invalid-signature' };
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); } catch { return { accepted: false, reason: 'invalid-json' }; }
  const repository = payload?.repository?.uuid, actor = payload?.actor?.uuid, number = payload?.pullrequest?.id;
  if (typeof repository !== 'string' || typeof actor !== 'string' || !uuidPattern.test(repository) || !uuidPattern.test(actor) || !allowedRepositories.some(value => value.toLowerCase() === repository.toLowerCase()) || !allowedActors.some(value => value.toLowerCase() === actor.toLowerCase())) return { accepted: false, reason: 'not-allowlisted' };
  if (!['pullrequest:created', 'pullrequest:updated', 'pullrequest:comment_created'].includes(event)) return { accepted: false, reason: 'unsupported-event' };
  let kind = 'pull-request', commentId;
  if (event === 'pullrequest:comment_created') {
    const comment = payload?.comment;
    if (typeof comment?.content?.raw !== 'string' || !/^@aem-dev(?:\s|$)/i.test(comment.content.raw.trimStart())) return { accepted: false, reason: 'no-command' };
    if (!Number.isSafeInteger(comment.id) || comment.id < 1) return { accepted: false, reason: 'invalid-payload' };
    kind = 'pull-request-comment'; commentId = comment.id;
  } else if (payload?.comment !== undefined) return { accepted: false, reason: 'invalid-payload' };
  if (!Number.isSafeInteger(number) || number < 1) return { accepted: false, reason: 'invalid-payload' };
  return { accepted: true, provider: 'bitbucket-cloud', repository, actor, kind, number, ...(commentId ? { commentId } : {}), eventHeader: event, scope: 'Offline signed payload classification only; event header is not signed, there is no timestamp or replay protection, and no task was queued or executed.' };
}
