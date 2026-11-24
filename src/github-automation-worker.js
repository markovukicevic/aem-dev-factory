import { createServer } from 'node:http';
import { lstat, realpath, open } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { verifyGitLabWebhookSignature } from './gitlab-webhook.js';
import { inspectWorkerDelivery, loadWorkerPolicy } from './worker-delivery.js';
import { claimExternalWebhook } from './external-webhook-claim.js';
import { claimGitHubWebhook } from './webhook-claim.js';
import { enqueueAutomationClaim, readAutomationJob } from './automation-queue.js';
import { processAutomationJob, normalizeAutomationCommand } from './automation-job-run.js';
import { workerCommentKey } from './worker-comment.js';
import { verifyWorkerTriggerComment } from './worker-comment-fresh.js';
import { inspectGitHubAppAuth, issueGitHubAppToken, revokeInstallationToken } from './github-app-exec.js';
const limit = 1024 * 1024;
async function reserveComment(store, provider, repository, commentId, claimDigest) {
  if (typeof repository !== 'string' || !repository || !Number.isSafeInteger(commentId) || commentId < 1) throw new Error('Invalid comment identity');
  const identity = workerCommentKey({ provider, repository, commentId }), path = join(store, `${identity}.comment.json`);
  let file;
  try { file = await open(path, 'wx', 0o600); } catch (error) { if (error?.code === 'EEXIST') return false; throw error; }
  try { await file.writeFile(`${JSON.stringify({ version: 1, provider, repository, commentId, claimDigest, reservedAt: new Date().toISOString() }, null, 2)}\n`); await file.sync(); } finally { await file.close(); }
  return true;
}
function response(res, code, value) { if (!res.headersSent && !res.destroyed) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(`${JSON.stringify(value)}\n`); } }

/** Explicit loopback worker for one fixed command and signed comment events. */
export async function startAutomationWorker({ provider, target, command, store, port, secret, environment = process.env, appAuth }, { runJob = processAutomationJob, verifyComment = verifyWorkerTriggerComment, issueToken = issueGitHubAppToken, revokeToken = revokeInstallationToken } = {}) {
  if (!['github', 'gitlab', 'bitbucket-cloud'].includes(provider) || typeof target !== 'string' || !target.trim() || typeof store !== 'string' || !store.trim() || !Number.isSafeInteger(port) || port < 0 || port > 65535 || typeof secret !== 'string' || !secret || secret.length > 4096 || !environment || typeof environment !== 'object' || Array.isArray(environment)) throw new TypeError('Invalid worker options');
  const task = normalizeAutomationCommand(command);
  const tokenName = provider === 'github' ? 'GITHUB_TOKEN' : provider === 'gitlab' ? 'GITLAB_TOKEN' : 'BITBUCKET_TOKEN';
  if (appAuth !== undefined && provider !== 'github') throw new TypeError('GitHub App authentication requires GitHub');
  if (appAuth === undefined && (typeof environment[tokenName] !== 'string' || !environment[tokenName].trim())) throw new TypeError('Provider API token is required');
  const childEnvironment = { ...environment };
  for (const key of ['GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET', 'GITLAB_WEBHOOK_SIGNING_TOKEN', 'BITBUCKET_WEBHOOK_SECRET', 'ADO_WEBHOOK_PASSWORD', 'ADO_WEBHOOK_AUTHORIZATION']) delete childEnvironment[key];
  if (task.contextFile !== undefined) throw new TypeError('Event-specific context is not supported by this worker');
  const root = await realpath(target), storeInfo = await lstat(store);
  if (!storeInfo.isDirectory() || storeInfo.isSymbolicLink()) throw new Error('Invalid execution store');
  const stateRoot = await realpath(store), rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Execution store must be outside the project');
  let app = null, fixedAppAuth = null;
  if (appAuth !== undefined) {
    app = inspectGitHubAppAuth(appAuth).app;
    fixedAppAuth = { config: { ...app, permissions: { ...app.permissions } }, privateKey: appAuth.privateKey };
    const appTarget = await lstat(app.target);
    if (!appTarget.isDirectory() || appTarget.isSymbolicLink() || await realpath(app.target) !== root) throw new Error('GitHub App target does not match worker');
  }
  await loadWorkerPolicy(root, provider);
  if (provider === 'gitlab') verifyGitLabWebhookSignature({ body: Buffer.from('{}'), signingToken: secret, id: 'startup', timestamp: String(Math.floor(Date.now() / 1000)), signature: '' });
  let busy = false;
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') { response(res, 200, { service: 'aem-dev-flow-max-automation-worker', version: 1, provider, busy }); return; }
    if (req.method !== 'POST' || req.url !== '/webhook') { response(res, 404, { accepted: false }); return; }
    if (busy) { response(res, 503, { accepted: false, reason: 'worker-busy' }); req.resume(); return; }
    busy = true;
    let launched = false;
    try {
      const length = req.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) { response(res, 413, { accepted: false }); req.resume(); return; }
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > limit) { response(res, 413, { accepted: false }); req.resume(); return; } chunks.push(chunk); }
      const body = Buffer.concat(chunks, size), { directory, policy } = await loadWorkerPolicy(root, provider);
      const headers = provider === 'github' ? { signature: req.headers['x-hub-signature-256'], event: req.headers['x-github-event'], deliveryId: req.headers['x-github-delivery'] } : provider === 'gitlab' ? { id: req.headers['webhook-id'], timestamp: req.headers['webhook-timestamp'], signature: req.headers['webhook-signature'], event: req.headers['x-gitlab-event'] } : { signature: req.headers['x-hub-signature'], event: req.headers['x-event-key'] };
      const checked = inspectWorkerDelivery({ provider, body, headers, policy, secret });
      if (!checked.accepted) { response(res, ['invalid-signature', 'timestamp-outside-window'].includes(checked.reason) ? 401 : 403, checked); return; }
      const { claimDigest, expected } = checked;
      if (app && `${app.owner}/${app.repository}`.toLowerCase() !== expected.repository.toLowerCase()) { response(res, 403, { accepted: false, reason: 'app-repository-mismatch' }); return; }
      const claimed = provider === 'github' ? await claimGitHubWebhook({ body, signature: headers.signature, secret, event: headers.event, deliveryId: headers.deliveryId, allowedRepositories: policy.allowedRepositories, allowedActors: policy.allowedActors }, { directory: join(directory, 'claims') }) : await claimExternalWebhook({ provider, body, headers, policy: provider === 'gitlab' ? policy.gitlab : policy.bitbucket, secret, directory: join(directory, 'claims') });
      if (!claimed.claimed) { response(res, ['duplicate-payload', 'duplicate-claim'].includes(claimed.reason) ? 200 : 403, { accepted: false, reason: claimed.reason }); return; }
      if (provider !== 'github' && claimed.digest !== claimDigest) throw new Error('Claim identity changed');
      if (!await reserveComment(stateRoot, provider, expected.repository, expected.commentId, claimDigest)) { response(res, 200, { accepted: false, reason: 'duplicate-comment' }); return; }
      await enqueueAutomationClaim({ target: root, digest: claimDigest });
      const readBoundJob = async args => {
        const job = await readAutomationJob(args), claim = job.claim;
        if (claim.digest !== claimDigest || Object.entries(expected).some(([key, value]) => (key === 'provider' ? claim.provider ?? 'github' : claim[key]) !== value)) throw new Error('Queued event changed');
        return job;
      };
      launched = true;
      response(res, 202, { accepted: true, queued: true, claimDigest, scope: 'Accepted locally; execution result is reported separately.' });
      void (async () => {
        let outcome = { started: false, status: 'unavailable-or-failed' }, lease = null, tokenRevocation = null, appAttempted = false;
        try {
          const input = { target: root, claimDigest, command: task, store: stateRoot, ...(provider === 'bitbucket-cloud' ? { bitbucketToken: environment.BITBUCKET_TOKEN } : {}) };
          const provisional = { readJob: readBoundJob, environment: childEnvironment };
          const plan = await runJob(input, provisional);
          if (!plan?.preview || !/^[a-f0-9]{64}$/.test(plan.digest ?? '')) throw new Error('Job preview unavailable');
          if (fixedAppAuth) {
            appAttempted = true;
            const issued = await issueToken(fixedAppAuth);
            if (!issued?.issued) { outcome = { started: false, status: 'app-token-unavailable', tokenRevocation: issued?.tokenRevocation ?? 'unknown', tokenExpiresAt: issued?.expiresAt ?? null }; return; }
            lease = issued;
          }
          const workerEnvironment = lease ? { ...childEnvironment, GITHUB_TOKEN: lease.token } : childEnvironment;
          let comment;
          try { comment = await verifyComment({ target: root, claim: expected, environment: workerEnvironment }); } catch { comment = null; }
          if (comment?.matches !== true) { outcome = { started: false, status: 'comment-changed-or-unavailable' }; return; }
          const result = await runJob({ ...input, expectedDigest: plan.digest }, { readJob: readBoundJob, environment: workerEnvironment });
          outcome = { started: result.started === true, status: typeof result.status === 'string' ? result.status : result.reason ?? 'not-started' };
        } catch { outcome = { started: false, status: 'unavailable-or-failed' }; }
        finally {
          if (lease) { try { tokenRevocation = await revokeToken(lease.token); } catch { tokenRevocation = 'unconfirmed'; } }
          if (appAttempted && !lease && outcome.tokenRevocation === undefined) outcome.tokenRevocation = 'unknown';
          try { server.emit('automation-result', { claimDigest, ...outcome, ...(lease ? { tokenRevocation, tokenExpiresAt: lease.expiresAt } : {}) }); } catch { /* Reporting must not leave the worker busy. */ }
          busy = false;
        }
      })();
    } catch { response(res, 400, { accepted: false, reason: 'invalid-or-unavailable' }); }
    finally { if (!launched) busy = false; }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return server;
}

export async function startGitHubAutomationWorker(options, dependencies) { return startAutomationWorker({ ...options, provider: 'github' }, dependencies); }
export async function startGitLabAutomationWorker(options, dependencies) { return startAutomationWorker({ ...options, provider: 'gitlab' }, dependencies); }
export async function startBitbucketAutomationWorker(options, dependencies) { return startAutomationWorker({ ...options, provider: 'bitbucket-cloud' }, dependencies); }
export async function startGitHubAppAutomationWorker(options, dependencies) { return startAutomationWorker({ ...options, provider: 'github' }, dependencies); }
