import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createBitbucketClient } from './bitbucket.js';
import { safeLogRedirect, readLimitedLogResponse, downloadRedirectedLog } from './ci-log-redirect.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(value);
async function prepare({ config, pipelineId, stepId, client }) {
  if (config?.provider !== 'bitbucket-pipelines' || !uuid(pipelineId) || !uuid(stepId)) throw new TypeError('Invalid step log request');
  const pipeline = await client.getPipeline(pipelineId), step = await client.getPipelineStep(pipelineId, stepId);
  if (!uuid(pipeline?.uuid) || pipeline.uuid.toLowerCase() !== pipelineId.toLowerCase() || !uuid(step?.uuid) || step.uuid.toLowerCase() !== stepId.toLowerCase() || !/^[a-f0-9]{40,64}$/i.test(pipeline.target?.commit?.hash ?? '')) throw new Error('Pipeline or step mismatch');
  const response = await client.getPipelineStepLogResponse(pipelineId, stepId);
  if (response.redirected) throw new Error('Unexpected followed redirect');
  let url = null, mode;
  if (response.status === 307) { url = safeLogRedirect(response.headers?.get?.('location')); mode = 'redirect'; }
  else if (response.status === 200) mode = 'direct';
  else throw new Error('Step log unavailable');
  await response.body?.cancel?.();
  const preview = { workspace: config.workspace, repository: config.repository, pipelineId, stepId, commit: pipeline.target.commit.hash, mode, host: url?.hostname.toLowerCase() ?? 'api.bitbucket.org' };
  return { preview, digest: hash(JSON.stringify(preview)) };
}
/** Preview and explicitly save one Bitbucket step log without forwarding tokens to redirects. */
export async function processBitbucketStepLog({ config, pipelineId, stepId, token, outputPath, expectedDigest }, { makeClient = createBitbucketClient, fetchImpl = globalThis.fetch } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest) || typeof outputPath !== 'string' || !outputPath.trim())) throw new TypeError('Invalid log download request');
  const client = makeClient({ workspace: config?.workspace, repository: config?.repository, token }), input = { config, pipelineId, stepId, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only log host preview; no log was saved. Review the host before an explicit save.' };
  if (first.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  const response = await client.getPipelineStepLogResponse(pipelineId, stepId); let bytes;
  if (response.redirected) throw new Error('Unexpected followed redirect');
  if (final.preview.mode === 'redirect' && response.status === 307) {
    const url = safeLogRedirect(response.headers?.get?.('location'));
    if (url.hostname.toLowerCase() !== final.preview.host) { await response.body?.cancel?.(); return { saved: false, reason: 'redirect-host-changed' }; }
    await response.body?.cancel?.(); bytes = await downloadRedirectedLog(url, fetchImpl);
  } else if (final.preview.mode === 'direct' && response.status === 200) bytes = await readLimitedLogResponse(response);
  else { await response.body?.cancel?.(); return { saved: false, reason: 'response-mode-changed' }; }
  const after = await client.getPipeline(pipelineId);
  if (!uuid(after?.uuid) || after.uuid.toLowerCase() !== pipelineId.toLowerCase() || after.target?.commit?.hash !== final.preview.commit) throw new Error('Pipeline changed during log download');
  await writeFile(outputPath, bytes, { flag: 'wx', mode: 0o600 });
  return { saved: true, path: outputPath, pipelineId, stepId, bytes: bytes.length, sha256: hash(bytes), host: final.preview.host, scope: 'One selected step log; it may contain sensitive or untrusted text and may be incomplete while the pipeline is active.' };
}
