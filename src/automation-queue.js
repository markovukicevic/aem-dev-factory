import { lstat, mkdir, open, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { listWebhookClaims } from './webhook-claims.js';
import { projectAutomationDirectory, validateAutomationPolicy } from './automation-local.js';

async function readLocalJson(path, max = 262144) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > max) throw new Error('Invalid local record');
    const data = Buffer.alloc(max + 1); let used = 0;
    while (used < data.length) { const chunk = await handle.read(data, used, data.length - used, null); if (!chunk.bytesRead) break; used += chunk.bytesRead; }
    const after = await handle.stat();
    if (used !== before.size || used > max || before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.size !== after.size) throw new Error('Record changed while reading');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, used)));
  } finally { await handle.close(); }
}
const fields = ['digest', 'deliveryId', 'claimedAt', 'repository', 'actor', 'kind', 'number', 'action', 'provider', 'eventHeader', 'bodyDigest', 'commentId'];
const allowed = (claim, policy) => {
  const selected = claim.provider === 'gitlab' ? policy.gitlab && { repositories: policy.gitlab.allowedProjects, actors: policy.gitlab.allowedActors } : claim.provider === 'bitbucket-cloud' ? policy.bitbucket && { repositories: policy.bitbucket.allowedRepositories, actors: policy.bitbucket.allowedActors } : policy.allowedRepositories && { repositories: policy.allowedRepositories, actors: policy.allowedActors };
  return !!selected && selected.repositories.some(value => value.toLowerCase() === claim.repository.toLowerCase()) && selected.actors.some(value => value.toLowerCase() === claim.actor.toLowerCase());
};
async function loadInputs(target) {
  const directory = await projectAutomationDirectory(target, false);
  const policy = validateAutomationPolicy(await readLocalJson(join(directory, 'policy.json')));
  const result = await listWebhookClaims({ directory: join(directory, 'claims') });
  return { directory, policy, claims: result.claims, claimErrors: result.errors.length };
}

/** Queue one explicitly selected metadata record; this never runs a job. */
export async function enqueueAutomationClaim({ target, digest, expectedClaim }) {
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new TypeError('A full claim digest is required');
  const { directory, policy, claims } = await loadInputs(target);
  const claim = claims.find(item => item.digest === digest);
  if (!claim?.metadataAvailable || !allowed(claim, policy)) throw new Error('Claim unavailable or not currently allowlisted');
  if (expectedClaim !== undefined && JSON.stringify(claim) !== JSON.stringify(expectedClaim)) throw new Error('Claim changed after preview');
  const queue = join(directory, 'jobs');
  try { await mkdir(queue, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const info = await lstat(queue);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid queue directory');
  const job = { version: 1, queuedAt: new Date().toISOString(), claim: Object.fromEntries(fields.map(key => [key, claim[key]])) };
  const path = join(queue, `${digest}.json`);
  await writeFile(path, `${JSON.stringify(job, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { path, digest, queued: true, scope: 'Editable local metadata record only. Signature and authorization are not reverified, no agent or task ran, and policy or source may change.' };
}

/** Inspect queued local metadata against current claim and policy without mutation. */
export async function listAutomationJobs({ target }) {
  const { directory, policy, claims, claimErrors } = await loadInputs(target);
  const queue = join(directory, 'jobs');
  let entries;
  try { const info = await lstat(queue); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid queue'); entries = await readdir(queue, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return { jobs: [], claimErrors, complete: claimErrors === 0, scope: 'No local job records found; no task execution or delivery status is established.' }; throw error; }
  if (entries.length > 10000) throw new Error('Queue limit exceeded');
  const byDigest = new Map(claims.map(claim => [claim.digest, claim])), jobs = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/^[a-f0-9]{64}\.json$/.test(entry.name)) continue;
    const digest = entry.name.slice(0, 64);
    try {
      if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Invalid job file');
      const record = await readLocalJson(join(queue, entry.name), 16384);
      if (record?.version !== 1 || typeof record.queuedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.queuedAt) || record.claim?.digest !== digest) throw new Error('Invalid job record');
      const current = byDigest.get(digest);
      let status = 'claim-missing-or-invalid';
      if (current?.metadataAvailable) {
        if (fields.some(key => current[key] !== record.claim[key])) status = 'claim-changed';
        else status = allowed(current, policy) ? 'queued' : 'no-longer-allowlisted';
      }
      jobs.push({ digest, queuedAt: record.queuedAt, status });
    } catch { jobs.push({ digest, status: 'invalid-or-unreadable' }); }
  }
  return { jobs, claimErrors, complete: claimErrors === 0 && jobs.every(job => job.status === 'queued'), scope: 'Editable local records and current allowlist only; signatures, actual delivery, worker state and task execution are not verified. Files may change afterward.' };
}

/** Read one queue entry only when the current claim and policy still match it. */
export async function readAutomationJob({ target, digest }) {
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new TypeError('Invalid job digest');
  const { directory, policy, claims } = await loadInputs(target);
  const queue = join(directory, 'jobs'), info = await lstat(queue);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid queue');
  const record = await readLocalJson(join(queue, `${digest}.json`), 16384), claim = claims.find(item => item.digest === digest);
  if (record?.version !== 1 || typeof record.queuedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.queuedAt) || !claim?.metadataAvailable || fields.some(key => claim[key] !== record.claim?.[key]) || !allowed(claim, policy)) throw new Error('Job no longer matches claim or policy');
  return { queuedAt: record.queuedAt, claim: Object.fromEntries(fields.filter(key => claim[key] !== undefined).map(key => [key, claim[key]])) };
}

/** Preview or enqueue an explicitly selected batch; never executes jobs. */
export async function processAutomationEnqueueBatch({ target, digests, expectedDigest }) {
  if (typeof target !== 'string' || !target.trim() || !Array.isArray(digests) || !digests.length || digests.length > 20 || digests.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) || new Set(digests).size !== digests.length || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid enqueue batch');
  const { policy, claims, claimErrors } = await loadInputs(target);
  const existing = await listAutomationJobs({ target });
  const queued = new Set(existing.jobs.map(job => job.digest));
  const items = digests.map(digest => {
    const claim = claims.find(item => item.digest === digest);
    if (!claim?.metadataAvailable || !allowed(claim, policy)) return { digest, status: 'unavailable' };
    if (queued.has(digest)) return { digest, status: 'already-queued' };
    return { digest, status: 'ready', claim };
  });
  const complete = claimErrors === 0 && existing.claimErrors === 0 && items.every(item => item.status === 'ready');
  const previewDigest = createHash('sha256').update(JSON.stringify({ target: resolve(target), items, complete })).digest('hex');
  if (expectedDigest === undefined) return { items, complete, digest: previewDigest, scope: 'Read-only local metadata preview. Records are editable and signatures are not reverified.' };
  if (!complete) return { completed: false, reason: 'preflight-incomplete', items };
  if (previewDigest !== expectedDigest) return { completed: false, reason: 'preview-changed' };
  const results = [];
  for (const item of items) {
    try { const result = await enqueueAutomationClaim({ target, digest: item.digest, expectedClaim: item.claim }); results.push({ digest: item.digest, queued: result.queued }); }
    catch { results.push({ digest: item.digest, queued: false }); return { completed: false, reason: 'partial-or-changed', results, scope: 'Earlier queue records remain; inspect the queue before retrying.' }; }
  }
  return { completed: true, results, scope: 'Local metadata queued only; no event authentication, agent or job execution occurred.' };
}
