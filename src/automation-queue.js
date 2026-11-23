import { lstat, mkdir, open, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
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
const fields = ['digest', 'deliveryId', 'claimedAt', 'repository', 'actor', 'kind', 'number', 'action', 'provider', 'eventHeader', 'bodyDigest'];
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
export async function enqueueAutomationClaim({ target, digest }) {
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new TypeError('A full claim digest is required');
  const { directory, policy, claims } = await loadInputs(target);
  const claim = claims.find(item => item.digest === digest);
  if (!claim?.metadataAvailable || !allowed(claim, policy)) throw new Error('Claim unavailable or not currently allowlisted');
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
