import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Check GitLab Standard Webhooks signatures over the exact body, ID and timestamp. */
export function verifyGitLabWebhookSignature({ body, signingToken, id, timestamp, signature, now = Date.now(), toleranceSeconds = 300 }) {
  if (!Buffer.isBuffer(body) || body.length > 1024 * 1024 || typeof signingToken !== 'string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(signingToken) || signingToken.length > 256) throw new TypeError('Invalid GitLab webhook input');
  const encoded = signingToken.slice(6), key = Buffer.from(encoded, 'base64');
  if (key.length < 16 || key.length > 128 || key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) throw new TypeError('Invalid GitLab signing token');
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || typeof timestamp !== 'string' || !/^[1-9][0-9]{0,12}$/.test(timestamp) || typeof signature !== 'string' || signature.length > 4096 || !Number.isFinite(now) || !Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 1 || toleranceSeconds > 3600) return { valid: false, reason: 'invalid-headers' };
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > toleranceSeconds) return { valid: false, reason: 'timestamp-outside-window' };
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`, 'utf8').update(body).digest();
  let valid = false;
  for (const item of signature.split(' ')) {
    if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(item)) continue;
    const candidate = Buffer.from(item.slice(3), 'base64');
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) valid = true;
  }
  return valid ? { valid: true } : { valid: false, reason: 'invalid-signature' };
}

/** Classify supported signed GitLab issue/MR events under explicit allowlists. */
export function inspectGitLabWebhook({ body, signingToken, id, timestamp, signature, event, allowedProjects, allowedActors, now }) {
  const validList = (list, pattern) => Array.isArray(list) && list.length > 0 && list.length <= 100 && list.every(value => typeof value === 'string' && value.length <= 200 && pattern.test(value));
  if (!validList(allowedProjects, /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/) || !validList(allowedActors, /^[A-Za-z0-9_.-]+$/)) throw new TypeError('Explicit GitLab project and actor allowlists are required');
  const verified = verifyGitLabWebhookSignature({ body, signingToken, id, timestamp, signature, ...(now === undefined ? {} : { now }) });
  if (!verified.valid) return { accepted: false, reason: verified.reason };
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); } catch { return { accepted: false, reason: 'invalid-json' }; }
  const project = payload?.project?.path_with_namespace, actor = payload?.user?.username;
  if (typeof project !== 'string' || typeof actor !== 'string' || !allowedProjects.some(value => value.toLowerCase() === project.toLowerCase()) || !allowedActors.some(value => value.toLowerCase() === actor.toLowerCase())) return { accepted: false, reason: 'not-allowlisted' };
  let kind = payload?.object_kind, action = payload?.object_attributes?.action, number = payload?.object_attributes?.iid, commentId;
  if (event === 'Note Hook' && kind === 'note') {
    const note = payload?.object_attributes;
    if (note?.action !== 'create' || note?.system !== false || !['Issue', 'MergeRequest'].includes(note?.noteable_type)) return { accepted: false, reason: 'unsupported-event' };
    if (typeof note.note !== 'string' || !/^@aem-dev(?:\s|$)/i.test(note.note.trimStart())) return { accepted: false, reason: 'no-command' };
    const target = note.noteable_type === 'Issue' ? payload.issue : payload.merge_request;
    if (!Number.isSafeInteger(note.id) || note.id < 1 || !Number.isSafeInteger(note.noteable_id) || target?.id !== note.noteable_id) return { accepted: false, reason: 'invalid-payload' };
    number = target.iid; commentId = note.id; kind = note.noteable_type === 'Issue' ? 'issue-comment' : 'pull-request-comment'; action = 'create';
  } else if (!((event === 'Issue Hook' && kind === 'issue' && ['open', 'reopen'].includes(action)) || (event === 'Merge Request Hook' && kind === 'merge_request' && ['open', 'reopen', 'update'].includes(action)))) return { accepted: false, reason: 'unsupported-event' };
  if (!Number.isSafeInteger(number) || number < 1) return { accepted: false, reason: 'invalid-payload' };
  return { accepted: true, provider: 'gitlab', id, project, actor, kind, number, action, ...(commentId ? { commentId, commentBodyDigest: createHash('sha256').update(payload.object_attributes.note, 'utf8').digest('hex') } : {}), scope: 'Offline signed payload classification only; event header is not signed, freshness window does not prevent replay, and no task was queued or executed.' };
}
