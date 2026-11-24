import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';

/** Inspect local claim records; a claim is not evidence that work ran. */
export async function listWebhookClaims({ directory, maxEntries = 10000 }) {
  if (typeof directory !== 'string' || !directory.trim() || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 100000) throw new TypeError('Invalid claim store');
  const root = await lstat(directory);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid claim directory');
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length > maxEntries) throw new Error('Claim store limit exceeded');
  const claims = [];
  const errors = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/^[a-f0-9]{64}(?:\.ado)?\.json$/.test(entry.name)) continue;
    try {
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Invalid claim');
      const record = JSON.parse((await readLimitedFile(join(directory, entry.name), 16384)).toString('utf8'));
      if (entry.name.endsWith('.ado.json')) {
        const guid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
        if (record.version !== 1 || record.provider !== 'ado' || record.digest !== entry.name.slice(0, 64) || !guid(record.eventId) || !guid(record.repository) || !guid(record.author) || !Number.isSafeInteger(record.number) || record.number < 1 || record.number > 2147483647 || record.kind !== 'pull-request' || record.action !== 'created' || typeof record.claimedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.claimedAt)) throw new Error('Invalid Azure claim');
        claims.push({ digest: record.digest, provider: 'ado', deliveryId: record.eventId, claimedAt: record.claimedAt, metadataAvailable: true, repository: record.repository, actor: record.author, kind: record.kind, number: record.number, action: record.action, bodyDigest: record.digest });
        continue;
      }
      if (record.version === 2) {
        const uuid = /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i;
        if (record.digest !== entry.name.slice(0, 64) || !['gitlab', 'bitbucket-cloud'].includes(record.provider) || typeof record.deliveryId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.deliveryId) || typeof record.claimedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.claimedAt) || typeof record.bodyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.bodyDigest) || !Number.isSafeInteger(record.number) || record.number < 1) throw new Error('Invalid provider claim');
        const gitlab = record.provider === 'gitlab';
        if (gitlab ? typeof record.repository !== 'string' || !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(record.repository) || typeof record.actor !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(record.actor) || !['issue', 'pull-request', 'issue-comment', 'pull-request-comment'].includes(record.kind) || !['opened', 'reopened', 'updated', 'created'].includes(record.action) : typeof record.repository !== 'string' || !uuid.test(record.repository) || typeof record.actor !== 'string' || !uuid.test(record.actor) || !['pull-request', 'pull-request-comment'].includes(record.kind) || record.action !== 'observed' || !['pullrequest:created', 'pullrequest:updated', 'pullrequest:comment_created'].includes(record.eventHeader)) throw new Error('Invalid provider claim metadata');
        if (record.kind.endsWith('-comment') && (!Number.isSafeInteger(record.commentId) || record.commentId < 1)) throw new Error('Invalid comment ID');
        claims.push({ digest: record.digest, provider: record.provider, deliveryId: record.deliveryId, claimedAt: record.claimedAt, metadataAvailable: true, repository: record.repository, actor: record.actor, kind: record.kind, number: record.number, action: record.action, bodyDigest: record.bodyDigest, ...(record.commentId ? { commentId: record.commentId } : {}), ...(gitlab ? {} : { eventHeader: record.eventHeader }) });
        continue;
      }
      if (record.digest !== entry.name.slice(0, 64) || typeof record.deliveryId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(record.deliveryId) || typeof record.claimedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.claimedAt)) throw new Error('Invalid claim');
      const metadata = ['repository', 'actor', 'kind', 'number', 'action'];
      const legacy = metadata.every(key => record[key] === undefined);
      if (!legacy && (typeof record.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(record.repository) || typeof record.actor !== 'string' || !/^[A-Za-z0-9-]+$/.test(record.actor) || !['pull-request', 'issue', 'pull-request-comment', 'issue-comment'].includes(record.kind) || !Number.isSafeInteger(record.number) || record.number < 1 || !['opened', 'reopened', 'synchronize', 'created'].includes(record.action))) throw new Error('Invalid metadata');
      if (record.commentId !== undefined && (!Number.isSafeInteger(record.commentId) || record.commentId < 1 || !['pull-request-comment', 'issue-comment'].includes(record.kind))) throw new Error('Invalid comment ID');
      claims.push({ digest: record.digest, deliveryId: record.deliveryId, claimedAt: record.claimedAt, ...(legacy ? { metadataAvailable: false } : { metadataAvailable: true, repository: record.repository, actor: record.actor, kind: record.kind, number: record.number, action: record.action, ...(record.commentId ? { commentId: record.commentId } : {}) }) });
    } catch { errors.push({ file: entry.name, message: 'Claim is invalid or unreadable' }); }
  }
  const seen = new Set();
  for (const claim of claims) { if (seen.has(claim.digest)) errors.push({ file: claim.digest, message: 'Ambiguous claim digest' }); seen.add(claim.digest); }
  return { claims, errors, complete: errors.length === 0, scope: 'Editable local claim records only; signatures are not reverified and task execution is not established. Some provider headers are unsigned.' };
}
