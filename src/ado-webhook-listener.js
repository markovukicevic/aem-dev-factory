import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectAdoWebhook } from './ado-webhook.js';

/** Claim a saved Azure delivery in a separate, explicitly selected local directory. */
export async function claimAdoWebhook({ body, authorization, username, password, policy, directory }) {
  if (typeof directory !== 'string' || !directory.trim() || !policy) throw new TypeError('Invalid claim options');
  const result = inspectAdoWebhook({ body, authorization, username, password, allowedRepositories: policy.allowedRepositories, allowedAuthors: policy.allowedAuthors });
  if (!result.accepted) return result;
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid claim directory');
  const digest = createHash('sha256').update(body).digest('hex'), path = join(directory, `${digest}.ado.json`);
  let file;
  try { file = await open(path, 'wx', 0o600); } catch (error) { if (error?.code === 'EEXIST') return { accepted: false, reason: 'duplicate-body', digest }; throw error; }
  try { const record = { version: 1, provider: 'ado', digest, eventId: result.eventId, repository: result.repository, author: result.author, number: result.number, kind: result.kind, action: result.action, claimedAt: new Date().toISOString() }; await file.writeFile(`${JSON.stringify(record, null, 2)}\n`); await file.sync(); } finally { await file.close(); }
  return { accepted: true, claimed: true, digest, scope: 'Separate local record only. Basic credentials do not sign the body or prevent replay; no queue or task execution occurred.' };
}

/** Start an explicit local receiver; it cannot be reached directly from Azure. */
export async function startAdoWebhookListener({ port, username, password, policy, directory }) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535 || typeof directory !== 'string' || !directory.trim() || !policy) throw new TypeError('Invalid listener options');
  inspectAdoWebhook({ body: Buffer.from('{}'), authorization: '', username, password, allowedRepositories: policy.allowedRepositories, allowedAuthors: policy.allowedAuthors });
  const info = await lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid claim directory');
  const reply = (res, code, data) => { if (!res.headersSent && !res.destroyed) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(`${JSON.stringify(data)}\n`); } };
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook') { reply(res, 404, { accepted: false }); return; }
    const limit = 1024 * 1024, length = req.headers['content-length'];
    if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > limit)) { reply(res, 413, { accepted: false }); req.resume(); return; }
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > limit) { reply(res, 413, { accepted: false }); req.resume(); return; } chunks.push(chunk); }
      const result = await claimAdoWebhook({ body: Buffer.concat(chunks, size), authorization: req.headers.authorization ?? '', username, password, policy, directory });
      if (result.claimed) reply(res, 202, { accepted: true, claimed: true, digest: result.digest });
      else if (result.reason === 'duplicate-body') reply(res, 200, { accepted: false, reason: result.reason });
      else reply(res, result.reason === 'credentials-mismatch' ? 401 : 403, { accepted: false, reason: result.reason });
    } catch { reply(res, 400, { accepted: false, reason: 'invalid-or-unavailable' }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
  return server;
}
