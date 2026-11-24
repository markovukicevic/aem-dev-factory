import { createHash } from 'node:crypto';
import { mkdir, lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectGitHubWebhook } from './github-webhook.js';

/** Verify and atomically claim a payload once in a local store; no task is run. */
export async function claimGitHubWebhook(input, { directory, now = () => new Date().toISOString() } = {}) {
  if (typeof directory !== 'string' || !directory.trim()) throw new TypeError('Claim directory is required');
  const inspected = inspectGitHubWebhook(input);
  if (!inspected.accepted) return inspected;
  const digest = createHash('sha256').update(input.body).digest('hex');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid claim directory');
  const path = join(directory, `${digest}.json`);
  let file;
  try {
    file = await open(path, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') return { accepted: false, reason: 'duplicate-payload' };
    throw error;
  }
  try {
    await file.writeFile(`${JSON.stringify({ digest, deliveryId: inspected.deliveryId, claimedAt: now(), repository: inspected.repository, actor: inspected.actor, kind: inspected.kind, number: inspected.number, action: inspected.action, ...(inspected.commentId ? { commentId: inspected.commentId, commentBodyDigest: inspected.commentBodyDigest } : {}) })}\n`, 'utf8');
    await file.sync();
  } finally { await file.close(); }
  return { ...inspected, claimed: true };
}
