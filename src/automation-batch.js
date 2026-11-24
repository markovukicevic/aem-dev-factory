import { createHash } from 'node:crypto';
import { processAutomationJob } from './automation-job-run.js';
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
/** Preview or explicitly execute a selected ordered batch of local queue records. */
export async function processAutomationBatch({ target, claimDigests, command, store, bitbucketToken, expectedDigest }, { processJob = processAutomationJob } = {}) {
  if (!Array.isArray(claimDigests) || !claimDigests.length || claimDigests.length > 20 || claimDigests.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) || new Set(claimDigests).size !== claimDigests.length || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid automation batch');
  const jobs = [];
  for (const claimDigest of claimDigests) {
    try { const result = await processJob({ target, claimDigest, command, store, bitbucketToken }); if (!result?.preview || !/^[a-f0-9]{64}$/.test(result.digest ?? '')) throw new Error('Invalid job preview'); jobs.push({ claimDigest, status: 'ready', preview: result.preview, digest: result.digest }); }
    catch { jobs.push({ claimDigest, status: 'unavailable' }); }
  }
  const complete = jobs.every(item => item.status === 'ready'), previewDigest = hash(JSON.stringify({ jobs }));
  if (expectedDigest === undefined) return { jobs, complete, digest: previewDigest, scope: 'Read-only previews of explicitly selected jobs. Inspect the full command and event context; local records do not authenticate events.' };
  if (!complete) return { completed: false, reason: 'preflight-incomplete', jobs };
  if (previewDigest !== expectedDigest) return { completed: false, reason: 'preview-changed' };
  const results = [];
  for (const job of jobs) {
    try {
      const result = await processJob({ target, claimDigest: job.claimDigest, command, store, bitbucketToken, expectedDigest: job.digest });
      results.push({ claimDigest: job.claimDigest, ...result });
      if (!result.started || result.status !== 'process-succeeded') return { completed: false, reason: 'partial-or-failed', results, scope: 'Earlier runs and records remain; inspect results before retrying.' };
    } catch { results.push({ claimDigest: job.claimDigest, status: 'unavailable-or-changed' }); return { completed: false, reason: 'partial-or-failed', results, scope: 'Earlier runs and records remain; inspect results before retrying.' }; }
  }
  return { completed: true, results, scope: 'All selected local processes returned success. This does not verify work correctness, process descendants, external effects or event authenticity.' };
}
