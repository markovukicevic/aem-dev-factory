import { constants } from 'node:fs';
import { lstat, open, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
const maxBytes = 5 * 1024 * 1024;
const validId = id => typeof id === 'string' && /^[1-9][0-9]{0,30}$/.test(id);

async function validateDirectory(directory) {
  if (typeof directory !== 'string' || !directory.trim()) throw new TypeError('Attachment directory is required');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Attachment directory is unsafe');
}

/** Hash a bounded regular attachment without following its final symlink. */
async function inspectAttachment(directory, id) {
  const file = await open(join(directory, `${id}.bin`), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > maxBytes) throw new Error('Invalid attachment');
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    if (offset > maxBytes || before.size !== offset || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Attachment changed during inspection');
    return { id, size: offset, sha256: createHash('sha256').update(buffer.subarray(0, offset)).digest('hex') };
  } finally { await file.close(); }
}

/** Create a new local hash manifest; it is not evidence of Jira provenance. */
export async function saveAttachmentManifest({ directory, outputPath, ids, source, expectedHashes }) {
  if (typeof outputPath !== 'string' || !outputPath.trim() || !Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length) throw new TypeError('Invalid attachment manifest request');
  await validateDirectory(directory);
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (expectedHashes !== undefined && (!Array.isArray(expectedHashes) || expectedHashes.length !== ids.length || expectedHashes.some((item, index) => !item || item.id !== ids[index] || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)))) throw new TypeError('Invalid expected attachment hashes');
  const files = [];
  for (const [index, id] of ids.entries()) {
    const file = await inspectAttachment(directory, id);
    if (expectedHashes && file.sha256 !== expectedHashes[index].sha256) throw new Error('Attachment differs from downloaded bytes');
    files.push(file);
  }
  if (source !== undefined && (!source || source.provider !== 'jira' || typeof source.site !== 'string' || !/^https:\/\/[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(source.site) || typeof source.issue !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(source.issue))) throw new TypeError('Invalid attachment source');
  const manifest = { version: 1, ...(source ? { source: { provider: source.provider, site: source.site, issue: source.issue } } : {}), files, scope: 'Local bytes and supplied source only; source authenticity and content safety are not verified.' };
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, files: files.length, scope: manifest.scope };
}

/** Recheck local bytes against an editable manifest without contacting Jira. */
export async function checkAttachmentManifest({ directory, manifestPath }) {
  await validateDirectory(directory);
  const manifest = JSON.parse((await readLimitedFile(manifestPath, 262144)).toString('utf8'));
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 50) throw new Error('Invalid attachment manifest');
  const ids = new Set();
  for (const item of manifest.files) {
    if (!item || !validId(item.id) || ids.has(item.id) || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > maxBytes || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid attachment manifest entry');
    ids.add(item.id);
  }
  const files = [];
  for (const item of manifest.files) {
    try {
      const current = await inspectAttachment(directory, item.id);
      files.push({ id: item.id, status: current.size === item.size && current.sha256 === item.sha256 ? 'match' : 'changed' });
    } catch (error) { files.push({ id: item.id, status: error?.code === 'ENOENT' ? 'missing' : 'unsafe-or-unreadable' }); }
  }
  return { files, consistent: files.every(file => file.status === 'match'), scope: 'Local byte comparison against an editable manifest; Jira provenance, content safety and later changes are not verified.' };
}
