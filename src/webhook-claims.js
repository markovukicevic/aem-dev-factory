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
    if (!/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
    try {
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Invalid claim');
      const record = JSON.parse((await readLimitedFile(join(directory, entry.name), 16384)).toString('utf8'));
      if (record.digest !== entry.name.slice(0, 64) || typeof record.deliveryId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(record.deliveryId) || typeof record.claimedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.claimedAt)) throw new Error('Invalid claim');
      const metadata = ['repository', 'actor', 'kind', 'number', 'action'];
      const legacy = metadata.every(key => record[key] === undefined);
      if (!legacy && (typeof record.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(record.repository) || typeof record.actor !== 'string' || !/^[A-Za-z0-9-]+$/.test(record.actor) || !['pull-request', 'issue', 'pull-request-comment', 'issue-comment'].includes(record.kind) || !Number.isSafeInteger(record.number) || record.number < 1 || !['opened', 'reopened', 'synchronize', 'created'].includes(record.action))) throw new Error('Invalid metadata');
      claims.push({ digest: record.digest, deliveryId: record.deliveryId, claimedAt: record.claimedAt, ...(legacy ? { metadataAvailable: false } : { metadataAvailable: true, repository: record.repository, actor: record.actor, kind: record.kind, number: record.number, action: record.action }) });
    } catch { errors.push({ file: entry.name, message: 'Claim is invalid or unreadable' }); }
  }
  return { claims, errors, complete: errors.length === 0, scope: 'Local claim records only; headers are not signed and task execution is not established.' };
}
