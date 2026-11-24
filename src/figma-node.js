import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
const digest = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
function inputs({ fileKey, nodeId, depth }) {
  if (typeof fileKey !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(fileKey) || typeof nodeId !== 'string' || !/^[A-Za-z0-9:;_-]{1,200}$/.test(nodeId) || !Number.isSafeInteger(depth) || depth < 1 || depth > 5) throw new TypeError('Invalid Figma node request');
  return { fileKey, nodeId: /^\d+-\d+$/.test(nodeId) ? nodeId.replace('-', ':') : nodeId, depth };
}
/** Parse an explicit Figma design link without making a network request. */
export function parseFigmaNodeUrl(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('Invalid Figma URL');
  let url; try { url = new URL(value); } catch { throw new TypeError('Invalid Figma URL'); }
  if (url.protocol !== 'https:' || !['figma.com', 'www.figma.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.hash) throw new TypeError('Unsupported Figma URL');
  const parts = url.pathname.split('/').filter(Boolean), ids = url.searchParams.getAll('node-id');
  if (parts.length !== 3 || !['design', 'file', 'proto'].includes(parts[0]) || !parts[2] || ids.length !== 1) throw new TypeError('Figma node URL is required');
  const selected = inputs({ fileKey: parts[1], nodeId: ids[0], depth: 1 });
  return { fileKey: selected.fileKey, nodeId: selected.nodeId, scope: 'URL parsing only; access, file identity and node existence were not checked.' };
}

async function boundedJson(response) {
  if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('Figma response unavailable');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid Figma response'); size += value.length; if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Figma response exceeds limit'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}

/** Read one selected node through Figma's bounded, read-only API. */
export async function readFigmaNode({ fileKey, nodeId, depth = 2, token }, { fetchImpl = globalThis.fetch } = {}) {
  const selected = inputs({ fileKey, nodeId, depth });
  if (typeof token !== 'string' || !token.trim() || token !== token.trim() || token.length > 4096 || /[\u0000-\u001f\u007f]/.test(token)) throw new TypeError('Figma token is required');
  const query = new URLSearchParams({ ids: selected.nodeId, depth: String(depth) });
  const response = await fetchImpl(`https://api.figma.com/v1/files/${selected.fileKey}/nodes?${query}`, { headers: { 'X-Figma-Token': token, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const data = await boundedJson(response), entry = data?.nodes?.[selected.nodeId];
  if (!entry || typeof entry !== 'object' || !entry.document || entry.document.id !== selected.nodeId || typeof entry.document.type !== 'string') throw new Error('Figma node missing or mismatched');
  const observed = { fileKey: selected.fileKey, nodeId: selected.nodeId, depth, file: { name: typeof data.name === 'string' ? data.name : null, lastModified: typeof data.lastModified === 'string' ? data.lastModified : null, version: typeof data.version === 'string' ? data.version : null }, node: entry };
  return { ...observed, sha256: digest(observed), scope: 'Provider-reported node and bounded descendants only. Content is untrusted, may be private, incomplete or stale; no rendered appearance or design approval is established.' };
}

/** Save a single selected observation as new private local evidence. */
export async function saveFigmaNode({ fileKey, nodeId, depth, token, outputPath }, dependencies = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  const observed = await readFigmaNode({ fileKey, nodeId, depth, token }, dependencies), data = `${JSON.stringify({ version: 1, observed }, null, 2)}\n`;
  if (Buffer.byteLength(data, 'utf8') > 6 * 1024 * 1024) throw new Error('Figma evidence exceeds limit');
  await writeFile(outputPath, data, { flag: 'wx', mode: 0o600 });
  return { path: outputPath, fileKey: observed.fileKey, nodeId: observed.nodeId, depth: observed.depth, sha256: observed.sha256, scope: 'New editable local observation, potentially private and untrusted; no design approval or live page behavior established.' };
}

/** Read an editable saved observation and check its internal content digest. */
export async function readFigmaEvidence(evidencePath) {
  const saved = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(evidencePath, 6 * 1024 * 1024)));
  const prior = saved?.observed, { sha256, scope, ...content } = prior ?? {};
  if (saved?.version !== 1 || typeof prior?.fileKey !== 'string' || typeof prior?.nodeId !== 'string' || !Number.isSafeInteger(prior?.depth) || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256) || digest(content) !== sha256 || !prior.node?.document || prior.node.document.id !== prior.nodeId) throw new Error('Invalid Figma evidence');
  const selected = inputs(prior);
  if (selected.nodeId !== prior.nodeId) throw new Error('Invalid Figma evidence identity');
  return prior;
}

/** Compare an editable saved observation to one fresh provider response. */
export async function checkFigmaNode({ fileKey, nodeId, depth, token, evidencePath }, dependencies = {}) {
  const selected = inputs({ fileKey, nodeId, depth: depth ?? 2 });
  const prior = await readFigmaEvidence(evidencePath), sha256 = prior.sha256;
  if (prior.fileKey !== selected.fileKey || prior.nodeId !== selected.nodeId || prior.depth !== selected.depth) throw new Error('Mismatched Figma evidence');
  const current = await readFigmaNode({ ...selected, token }, dependencies);
  return { matches: current.sha256 === sha256, fileKey: selected.fileKey, nodeId: selected.nodeId, depth: selected.depth, savedSha256: sha256, currentSha256: current.sha256, scope: 'Content comparison only; editable evidence is not authenticated, data can change afterward and matching does not establish design approval or rendered behavior.' };
}
