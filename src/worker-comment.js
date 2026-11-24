import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';

export function workerCommentKey({ provider, repository, commentId }) {
  const uuid = /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i, project = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/;
  if (!['github', 'gitlab', 'bitbucket-cloud'].includes(provider) || typeof repository !== 'string' || repository.length > 500 || !(provider === 'bitbucket-cloud' ? uuid : project).test(repository) || (provider === 'github' && repository.split('/').length !== 2) || !Number.isSafeInteger(commentId) || commentId < 1) throw new TypeError('Invalid comment identity');
  return createHash('sha256').update(JSON.stringify([provider, repository.toLowerCase(), commentId])).digest('hex');
}

/** Inspect one local reservation without assuming a process ran. */
export async function inspectWorkerComment({ store, provider, repository, commentId }) {
  if (typeof store !== 'string' || !store.trim()) throw new TypeError('Execution store is required');
  const key = workerCommentKey({ provider, repository, commentId }), info = await lstat(store);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid execution store');
  const path = join(await realpath(store), `${key}.comment.json`);
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if (error?.code === 'ENOENT') return { found: false, provider, repository, commentId, scope: 'No local reservation observed; this does not prove that work never ran.' }; throw error; }
  let record;
  try {
    const before = await handle.stat(); if (!before.isFile() || before.size > 16384) throw new Error('Invalid reservation');
    const buffer = Buffer.alloc(before.size + 1); let used = 0;
    while (used < buffer.length) { const next = await handle.read(buffer, used, buffer.length - used, null); if (!next.bytesRead) break; used += next.bytesRead; }
    const after = await handle.stat();
    if (used !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Reservation changed');
    record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, used)));
  } finally { await handle.close(); }
  if (record?.version !== 1 || record.provider !== provider || typeof record.repository !== 'string' || record.repository.toLowerCase() !== repository.toLowerCase() || record.commentId !== commentId || typeof record.claimDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.claimDigest) || typeof record.reservedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.reservedAt)) throw new Error('Invalid reservation');
  return { found: true, path, provider, repository: record.repository, commentId, claimDigest: record.claimDigest, reservedAt: record.reservedAt, scope: 'Editable local reservation only; this does not prove delivery, process execution, liveness or correctness.' };
}
