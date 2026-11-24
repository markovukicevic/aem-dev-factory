import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
function webhookUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new TypeError('Slack webhook is required');
  let url; try { url = new URL(value); } catch { throw new TypeError('Invalid Slack webhook'); }
  if (url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(url.pathname)) throw new TypeError('Invalid Slack webhook');
  return url.href;
}
async function prepare({ destination, bodyPath, webhook }) {
  if (typeof destination !== 'string' || !destination.trim() || destination !== destination.trim() || destination.length > 100 || /[\u0000-\u001f\u007f]/.test(destination)) throw new TypeError('A destination label is required');
  const url = webhookUrl(webhook), text = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 12000));
  if (!text.trim() || text.length > 3000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError('Invalid notification body');
  const preview = { provider: 'slack', destinationLabel: destination, text };
  return { url, preview, digest: hash(JSON.stringify({ preview, webhookDigest: hash(url) })) };
}
/** Preview or explicitly send one Slack message without retries or secret output. */
export async function processSlackNotification({ destination, bodyPath, webhook, expectedDigest }, { fetchImpl = globalThis.fetch } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid notification digest');
  const input = { destination, bodyPath, webhook }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only preview. The destination label is user-supplied; the webhook channel is not independently verified.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const response = await fetchImpl(final.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: final.preview.text }), redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (response.status !== 200 || response.redirected || !response.body?.getReader) throw new Error('Slack response unclear; inspect the channel before retrying');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid Slack response'); size += value.byteLength; if (size > 256) { await reader.cancel(); throw new Error('Slack response unclear; inspect the channel before retrying'); } chunks.push(Buffer.from(value)); } } finally { reader.releaseLock(); }
  if (Buffer.concat(chunks, size).toString('utf8').trim() !== 'ok') throw new Error('Slack response unclear; inspect the channel before retrying');
  return { sent: true, scope: 'Slack acknowledged one message without a message ID; inspect the configured channel. The destination label was not verified.' };
}
