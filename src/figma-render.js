import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

function validate({ fileKey, nodeId, scale, version, token }) {
  if (typeof fileKey !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(fileKey) || typeof nodeId !== 'string' || !/^[A-Za-z0-9:;_-]{1,200}$/.test(nodeId) || ![1, 2].includes(scale) || typeof version !== 'string' || (version !== 'latest' && !/^[A-Za-z0-9._-]{1,128}$/.test(version)) || typeof token !== 'string' || !token.trim() || token !== token.trim() || token.length > 4096 || /[\u0000-\u001f\u007f]/.test(token)) throw new TypeError('Invalid Figma render request');
  return { fileKey, nodeId: /^\d+-\d+$/.test(nodeId) ? nodeId.replace('-', ':') : nodeId, scale, version };
}
async function bytes(response, limit) {
  if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('Figma render response unavailable');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid response body'); size += value.length; if (size > limit) { await reader.cancel(); throw new Error('Response exceeds limit'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
async function prepare(input, fetchImpl) {
  const selected = validate(input), query = new URLSearchParams({ ids: selected.nodeId, scale: String(selected.scale), format: 'png', ...(selected.version === 'latest' ? {} : { version: selected.version }) });
  const response = await fetchImpl(`https://api.figma.com/v1/images/${selected.fileKey}?${query}`, { headers: { 'X-Figma-Token': input.token, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(response, 1024 * 1024)));
  let url; try { url = new URL(data?.images?.[selected.nodeId]); } catch { throw new Error('Figma render unavailable'); }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 's3-alpha-sig.figma.com' || url.username || url.password || url.port || url.hash) throw new Error('Unsupported Figma render host');
  const preview = { ...selected, host: url.hostname.toLowerCase(), format: 'png' }, digest = createHash('sha256').update(JSON.stringify(preview)).digest('hex');
  return { preview, digest, url: url.href };
}
/** Preview a render destination or save one explicitly selected PNG. */
export async function processFigmaRender({ fileKey, nodeId, scale, version, token, expectedDigest, outputPath }, { fetchImpl = globalThis.fetch } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest) || typeof outputPath !== 'string' || !outputPath.toLowerCase().endsWith('.png'))) throw new TypeError('Invalid render save request');
  const selected = await prepare({ fileKey, nodeId, scale, version, token }, fetchImpl);
  if (expectedDigest === undefined) return { preview: selected.preview, digest: selected.digest, scope: 'Render host and parameters only; the temporary image URL is not shown. Latest may change and rendered content has not been inspected.' };
  if (selected.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  const response = await fetchImpl(selected.url, { headers: { Accept: 'image/png' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!/^image\/png(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error('Unexpected image type');
  const data = await bytes(response, 8 * 1024 * 1024);
  if (data.length < 33 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || data.readUInt32BE(8) !== 13 || data.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG header');
  const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16_000_000) throw new Error('PNG dimensions exceed limit');
  await writeFile(outputPath, data, { flag: 'wx', mode: 0o600 });
  return { saved: true, path: outputPath, ...selected.preview, width, height, sha256: createHash('sha256').update(data).digest('hex'), scope: 'Saved provider render. PNG header checked but full decoding, authenticity, approval, visual correctness and correspondence to later snapshots are not established.' };
}
