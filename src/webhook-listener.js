import { createServer } from 'node:http';
import { inspectGitHubWebhook } from './github-webhook.js';
import { claimGitHubWebhook } from './webhook-claim.js';

const limit = 1024 * 1024;
const dummyId = '00000000-0000-0000-0000-000000000000';
function reply(res, status, result) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(`${JSON.stringify(result)}\n`);
}

/** Start an explicit loopback-only receiver; it records claims but never executes tasks. */
export async function startLocalGitHubWebhookListener({ port, secret, policy, directory }) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535 || typeof directory !== 'string' || !directory.trim()) throw new TypeError('Invalid listener options');
  inspectGitHubWebhook({ body: Buffer.from('{}'), signature: '', secret, event: 'issues', deliveryId: dummyId, allowedRepositories: policy?.allowedRepositories, allowedActors: policy?.allowedActors });
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook') { reply(res, 404, { accepted: false }); return; }
    const length = req.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) { reply(res, 413, { accepted: false, reason: 'body-too-large' }); req.resume(); return; }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) { reply(res, 413, { accepted: false, reason: 'body-too-large' }); req.resume(); return; }
        chunks.push(chunk);
      }
      const result = await claimGitHubWebhook({ body: Buffer.concat(chunks, size), signature: req.headers['x-hub-signature-256'], secret, event: req.headers['x-github-event'], deliveryId: req.headers['x-github-delivery'], allowedRepositories: policy.allowedRepositories, allowedActors: policy.allowedActors }, { directory });
      if (result.claimed) reply(res, 202, { accepted: true, claimed: true });
      else if (result.reason === 'duplicate-payload') reply(res, 200, { accepted: false, reason: 'duplicate-payload' });
      else reply(res, result.reason === 'invalid-signature' ? 401 : 403, { accepted: false, reason: result.reason });
    } catch { reply(res, 400, { accepted: false, reason: 'invalid-or-unavailable' }); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 40;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return server;
}
