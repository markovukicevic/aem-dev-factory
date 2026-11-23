import { isIP } from 'node:net';
/** Validate an explicitly reviewed HTTPS redirect without exposing its signed query. */
export function safeLogRedirect(value) {
  if (typeof value !== 'string' || value.length > 8192) throw new Error('Invalid log redirect');
  let url; try { url = new URL(value); } catch { throw new Error('Invalid log redirect'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || isIP(host) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) throw new Error('Unsupported log redirect');
  return url;
}
export async function readLimitedLogResponse(response) {
  if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('Log download unavailable');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid log stream'); size += value.byteLength; if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Log exceeds size limit'); } chunks.push(Buffer.from(value)); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
/** Follow only the caller-validated URL, without credentials or further redirects. */
export async function downloadRedirectedLog(url, fetchImpl) {
  const response = await fetchImpl(url.href, { method: 'GET', headers: { Accept: 'text/plain' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  return readLimitedLogResponse(response);
}
