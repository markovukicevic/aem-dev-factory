import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { projectAutomationDirectory, validateAutomationPolicy } from './automation-local.js';
import { inspectGitHubWebhook } from './github-webhook.js';
import { claimGitHubWebhook } from './webhook-claim.js';
import { enqueueAutomationClaim, readAutomationJob } from './automation-queue.js';
import { processAutomationJob, normalizeAutomationCommand } from './automation-job-run.js';
const limit = 1024 * 1024;
async function currentPolicy(target) {
  const directory = await projectAutomationDirectory(target, false);
  const policy = validateAutomationPolicy(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(join(directory, 'policy.json'), 262144))));
  if (!policy.allowedRepositories || !policy.allowedActors) throw new Error('GitHub automation policy is required');
  return { directory, policy };
}
function response(res, code, value) { if (!res.headersSent && !res.destroyed) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(`${JSON.stringify(value)}\n`); } }

/** Explicit loopback worker for one fixed command and signed GitHub comment events. */
export async function startGitHubAutomationWorker({ target, command, store, port, secret, environment = process.env }, { runJob = processAutomationJob } = {}) {
  if (typeof target !== 'string' || !target.trim() || typeof store !== 'string' || !store.trim() || !Number.isSafeInteger(port) || port < 0 || port > 65535 || typeof secret !== 'string' || !secret || secret.length > 4096 || !environment || typeof environment !== 'object' || Array.isArray(environment)) throw new TypeError('Invalid worker options');
  const task = normalizeAutomationCommand(command);
  if (task.contextFile !== undefined) throw new TypeError('Event-specific context is not supported by this worker');
  const root = await realpath(target), storeInfo = await lstat(store);
  if (!storeInfo.isDirectory() || storeInfo.isSymbolicLink()) throw new Error('Invalid execution store');
  const stateRoot = await realpath(store), rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Execution store must be outside the project');
  await currentPolicy(root);
  let busy = false;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook') { response(res, 404, { accepted: false }); return; }
    if (busy) { response(res, 503, { accepted: false, reason: 'worker-busy' }); req.resume(); return; }
    busy = true;
    let launched = false;
    try {
      const length = req.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) { response(res, 413, { accepted: false }); req.resume(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > limit) { response(res, 413, { accepted: false }); req.resume(); return; } chunks.push(chunk); }
      const body = Buffer.concat(chunks, size), { directory, policy } = await currentPolicy(root);
      const input = { body, signature: req.headers['x-hub-signature-256'], secret, event: req.headers['x-github-event'], deliveryId: req.headers['x-github-delivery'], allowedRepositories: policy.allowedRepositories, allowedActors: policy.allowedActors };
      const inspected = inspectGitHubWebhook(input);
      if (!inspected.accepted || input.event !== 'issue_comment' || !['issue-comment', 'pull-request-comment'].includes(inspected.kind)) { response(res, inspected.reason === 'invalid-signature' ? 401 : 403, { accepted: false, reason: inspected.reason ?? 'unsupported-event' }); return; }
      const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      if (!Number.isSafeInteger(payload.comment?.id) || payload.comment.id < 1 || typeof payload.comment?.user?.login !== 'string' || payload.comment.user.login.toLowerCase() !== inspected.actor.toLowerCase()) { response(res, 403, { accepted: false, reason: 'comment-author-mismatch' }); return; }
      const claimDigest = createHash('sha256').update(body).digest('hex'), claimed = await claimGitHubWebhook(input, { directory: join(directory, 'claims') });
      if (!claimed.claimed) { response(res, claimed.reason === 'duplicate-payload' ? 200 : 403, { accepted: false, reason: claimed.reason }); return; }
      await enqueueAutomationClaim({ target: root, digest: claimDigest });
      const readBoundJob = async args => {
        const job = await readAutomationJob(args), claim = job.claim;
        if (claim.digest !== claimDigest || claim.deliveryId !== inspected.deliveryId || claim.repository !== inspected.repository || claim.actor !== inspected.actor || claim.kind !== inspected.kind || claim.number !== inspected.number || claim.action !== inspected.action || (claim.provider !== undefined && claim.provider !== 'github')) throw new Error('Queued event changed');
        return job;
      };
      launched = true;
      response(res, 202, { accepted: true, queued: true, claimDigest, scope: 'Accepted locally; execution result is reported separately.' });
      void (async () => {
        let result;
        try {
          const input = { target: root, claimDigest, command: task, store: stateRoot };
          const dependencies = { readJob: readBoundJob, environment };
          const plan = await runJob(input, dependencies);
          if (!plan?.preview || !/^[a-f0-9]{64}$/.test(plan.digest ?? '')) throw new Error('Job preview unavailable');
          result = await runJob({ ...input, expectedDigest: plan.digest }, dependencies);
          server.emit('automation-result', { claimDigest, started: result.started === true, status: typeof result.status === 'string' ? result.status : result.reason ?? 'not-started' });
        } catch { server.emit('automation-result', { claimDigest, started: false, status: 'unavailable-or-failed' }); }
        finally { busy = false; }
      })();
    } catch { response(res, 400, { accepted: false, reason: 'invalid-or-unavailable' }); }
    finally { if (!launched) busy = false; }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return server;
}
