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
  if (!['pullrequest:created', 'pullrequest:updated'].includes(event)) return { accepted: false, reason: 'unsupported-event' };
  if (!Number.isSafeInteger(number) || number < 1) return { accepted: false, reason: 'invalid-payload' };
  return { accepted: true, provider: 'bitbucket-cloud', repository, actor, kind: 'pull-request', number, eventHeader: event, scope: 'Offline signed payload classification only; event header is not signed, there is no timestamp or replay protection, and no task was queued or executed.' };
}
