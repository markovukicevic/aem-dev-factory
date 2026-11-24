import { createHash, timingSafeEqual } from 'node:crypto';
const guid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const hash = value => createHash('sha256').update(value).digest();
/** Inspect one saved Azure Services hook using configured Basic credentials. */
export function inspectAdoWebhook({ body, authorization, username, password, allowedRepositories, allowedAuthors }) {
  if (!Buffer.isBuffer(body) || body.length > 1024 * 1024 || typeof username !== 'string' || !username || username.length > 256 || /[:\u0000-\u001f\u007f]/.test(username) || typeof password !== 'string' || !password || password.length > 1024 || /[\u0000-\u001f\u007f]/.test(password) || typeof authorization !== 'string' || authorization.length > 4096 || !Array.isArray(allowedRepositories) || !allowedRepositories.length || allowedRepositories.length > 100 || !allowedRepositories.every(guid) || !Array.isArray(allowedAuthors) || !allowedAuthors.length || allowedAuthors.length > 100 || !allowedAuthors.every(guid)) throw new TypeError('Invalid webhook inspection request');
  const expected = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
  if (!timingSafeEqual(hash(authorization), hash(expected))) return { accepted: false, reason: 'credentials-mismatch' };
  let event;
  try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); } catch { return { accepted: false, reason: 'invalid-payload' }; }
  if (event?.publisherId !== 'tfs' || event.eventType !== 'git.pullrequest.created') return { accepted: false, reason: 'unsupported-event' };
  const repository = event.resource?.repository?.id, author = event.resource?.createdBy?.id, number = event.resource?.pullRequestId;
  if (!guid(event.id) || !guid(repository) || !guid(author) || !Number.isSafeInteger(number) || number < 1 || number > 2147483647 || event.resource?.status !== 'active') return { accepted: false, reason: 'invalid-payload' };
  if (!allowedRepositories.some(id => id.toLowerCase() === repository.toLowerCase()) || !allowedAuthors.some(id => id.toLowerCase() === author.toLowerCase())) return { accepted: false, reason: 'not-allowlisted' };
  return { accepted: true, provider: 'ado', kind: 'pull-request', action: 'created', eventId: event.id, repository, author, number, scope: 'Basic credentials and saved payload only. No signature, replay protection, delivery provenance, live provider validation or execution is established.' };
}
