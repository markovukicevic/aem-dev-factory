import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { processAutomationJob } from './automation-job-run.js';
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
/** Preview or explicitly execute a selected ordered batch of local queue records. */
export async function processAutomationBatch({ target, claimDigests, command, store, bitbucketToken, expectedDigest }, { processJob = processAutomationJob } = {}) {
  if (!Array.isArray(claimDigests) || !claimDigests.length || claimDigests.length > 20 || !command || typeof command !== 'object' || Array.isArray(command) || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid automation batch');
  const selected = claimDigests.map(value => {
    if (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) return { claimDigest: value, command };
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['digest', 'contextFile'].includes(key)) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest) || typeof value.contextFile !== 'string' || !isAbsolute(value.contextFile) || Object.hasOwn(command, 'contextFile')) throw new TypeError('Invalid automation batch entry');
    return { claimDigest: value.digest, command: { ...command, contextFile: value.contextFile } };
  });
  if (new Set(selected.map(item => item.claimDigest)).size !== selected.length) throw new TypeError('Duplicate automation job');
  const jobs = [];
  for (const item of selected) {
    try { const result = await processJob({ target, claimDigest: item.claimDigest, command: item.command, store, bitbucketToken }); if (!result?.preview || !/^[a-f0-9]{64}$/.test(result.digest ?? '')) throw new Error('Invalid job preview'); jobs.push({ claimDigest: item.claimDigest, status: 'ready', preview: result.preview, digest: result.digest }); }
    catch { jobs.push({ claimDigest: item.claimDigest, status: 'unavailable' }); }
  }
  const complete = jobs.every(item => item.status === 'ready'), previewDigest = hash(JSON.stringify({ jobs }));
  if (expectedDigest === undefined) return { jobs, complete, digest: previewDigest, scope: 'Read-only previews of explicitly selected jobs. Inspect the full command and event context; local records do not authenticate events.' };
  if (!complete) return { completed: false, reason: 'preflight-incomplete', jobs };
  if (previewDigest !== expectedDigest) return { completed: false, reason: 'preview-changed' };
  const results = [];
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index], item = selected[index];
    try {
      const result = await processJob({ target, claimDigest: job.claimDigest, command: item.command, store, bitbucketToken, expectedDigest: job.digest });
      results.push({ claimDigest: job.claimDigest, ...result });
      if (!result.started || result.status !== 'process-succeeded') return { completed: false, reason: 'partial-or-failed', results, scope: 'Earlier runs and records remain; inspect results before retrying.' };
    } catch { results.push({ claimDigest: job.claimDigest, status: 'unavailable-or-changed' }); return { completed: false, reason: 'partial-or-failed', results, scope: 'Earlier runs and records remain; inspect results before retrying.' }; }
  }
  return { completed: true, results, scope: 'All selected local processes returned success. This does not verify work correctness, process descendants, external effects or event authenticity.' };
}
