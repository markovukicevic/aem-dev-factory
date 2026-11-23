import { createServer } from 'node:http';
import { claimExternalWebhook } from './external-webhook-claim.js';
import { inspectGitLabWebhook } from './gitlab-webhook.js';
import { inspectBitbucketWebhook } from './bitbucket-webhook.js';

const limit = 1024 * 1024;
function reply(res, status, result) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(`${JSON.stringify(result)}\n`);
}

/** Start an explicit loopback-only GitLab or Bitbucket receiver, without executing jobs. */
export async function startExternalWebhookListener({ provider, port, secret, policy, directory }) {
  if (!['gitlab', 'bitbucket-cloud'].includes(provider) || !Number.isSafeInteger(port) || port < 0 || port > 65535 || typeof directory !== 'string' || !directory.trim() || !policy) throw new TypeError('Invalid listener options');
  const selected = provider === 'gitlab' ? (policy.gitlab ?? policy) : (policy.bitbucket ?? policy);
  if (provider === 'gitlab') inspectGitLabWebhook({ body: Buffer.from('{}'), signingToken: secret, id: 'startup', timestamp: String(Math.floor(Date.now() / 1000)), signature: '', event: 'Issue Hook', allowedProjects: selected.allowedProjects, allowedActors: selected.allowedActors });
  else inspectBitbucketWebhook({ body: Buffer.from('{}'), secret, signature: '', event: 'pullrequest:created', allowedRepositories: selected.allowedRepositories, allowedActors: selected.allowedActors });
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook') { reply(res, 404, { accepted: false }); return; }
    const length = req.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) { reply(res, 413, { accepted: false, reason: 'body-too-large' }); req.resume(); return; }
    const chunks = []; let size = 0;
    try {
      for await (const chunk of req) { size += chunk.length; if (size > limit) { reply(res, 413, { accepted: false, reason: 'body-too-large' }); req.resume(); return; } chunks.push(chunk); }
      const headers = provider === 'gitlab' ? { id: req.headers['webhook-id'], timestamp: req.headers['webhook-timestamp'], signature: req.headers['webhook-signature'], event: req.headers['x-gitlab-event'] } : { signature: req.headers['x-hub-signature'], event: req.headers['x-event-key'] };
      const result = await claimExternalWebhook({ provider, body: Buffer.concat(chunks, size), headers, policy: selected, secret, directory });
      if (result.claimed) reply(res, 202, { accepted: true, claimed: true });
      else if (result.reason === 'duplicate-claim') reply(res, 200, { accepted: false, reason: 'duplicate-claim' });
      else reply(res, ['invalid-signature', 'timestamp-outside-window'].includes(result.reason) ? 401 : 403, { accepted: false, reason: result.reason });
    } catch { reply(res, 400, { accepted: false, reason: 'invalid-or-unavailable' }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return server;
}
