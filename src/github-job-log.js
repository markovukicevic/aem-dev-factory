import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { writeFile } from 'node:fs/promises';
import { createGitHubClient, githubRepositoryPath } from './github.js';
const digest = value => createHash('sha256').update(value).digest('hex');
function safeRedirect(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid log redirect');
  let url; try { url = new URL(value); } catch { throw new Error('Invalid log redirect'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || isIP(host) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) throw new Error('Unsupported log redirect');
  return url;
}
async function prepare({ config, runId, jobId, client }) {
  if (config?.provider !== 'github-actions' || ![runId, jobId].every(value => Number.isSafeInteger(value) && value > 0)) throw new TypeError('Invalid job log request');
  const repo = githubRepositoryPath(config.owner, config.repository).toLowerCase(), run = await client.getWorkflowRun(runId), job = await client.getWorkflowJob(jobId);
  if (run?.id !== runId || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 || !/^[a-f0-9]{40,64}$/i.test(run.head_sha ?? '') || job?.id !== jobId || job.run_id !== runId || job.head_sha !== run.head_sha) throw new Error('Job does not match selected run');
  const url = safeRedirect(await client.getWorkflowJobLogRedirect(jobId));
  const preview = { repository: `${config.owner}/${config.repository}`, runId, jobId, attempt: run.run_attempt, head: run.head_sha, redirectHost: url.hostname.toLowerCase() };
  return { preview, url, digest: digest(JSON.stringify({ repo, preview })) };
}
async function download(url, fetchImpl) {
  const response = await fetchImpl(url.href, { method: 'GET', headers: { Accept: 'text/plain' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.body?.getReader) throw new Error('Log download unavailable');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid log stream'); size += value.byteLength; if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Log exceeds size limit'); } chunks.push(Buffer.from(value)); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
/** Preview a host, then download a selected job log without forwarding GitHub credentials. */
export async function processGitHubJobLog({ config, runId, jobId, token, outputPath, expectedDigest }, { makeClient = createGitHubClient, fetchImpl = globalThis.fetch } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest) || typeof outputPath !== 'string' || !outputPath.trim())) throw new TypeError('Invalid log download request');
  const client = makeClient({ owner: config?.owner, repository: config?.repository, token }), input = { config, runId, jobId, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only redirect preview; no log was downloaded. Inspect the destination host before an explicit save.' };
  if (first.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  const bytes = await download(final.url, fetchImpl), after = await client.getWorkflowRun(runId);
  if (after?.id !== runId || after.head_sha !== final.preview.head || after.run_attempt !== final.preview.attempt) throw new Error('Run changed during log download');
  await writeFile(outputPath, bytes, { flag: 'wx', mode: 0o600 });
  return { saved: true, path: outputPath, runId, jobId, bytes: bytes.length, sha256: digest(bytes), redirectHost: final.preview.redirectHost, scope: 'One downloaded job log; it may contain sensitive or untrusted text and may be incomplete while the run is active.' };
}
