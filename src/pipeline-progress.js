import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { inspectTicketDirectory } from './ticket-status.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const states = ['pending', 'in_progress', 'done', 'failed', 'skipped', 'blocked'];
function cell(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('Invalid progress text');
  return value.trim().replaceAll('|', '∣');
}
async function directory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid spec directory');
  return path;
}
async function readProgress(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > 262144) throw new Error('Invalid progress file');
    const data = Buffer.alloc(262145); let offset = 0;
    while (offset < data.length) { const part = await file.read(data, offset, data.length - offset, null); if (!part.bytesRead) break; offset += part.bytesRead; }
    const after = await file.stat();
    if (offset > 262144 || offset !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Progress changed while reading');
    const bytes = data.subarray(0, offset), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (!/^# Pipeline Progress — #\S+$/.test(lines[0]) || lines[1] !== '' || lines[2] !== '| Phase | Status | Note |' || !/^\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|$/.test(lines[3])) throw new Error('Unsupported progress format');
    const rows = [], seen = new Set();
    for (const line of lines.slice(4)) {
      if (!line) continue;
      const match = /^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/.exec(line);
      if (!match || !states.includes(match[2].trim())) throw new Error('Invalid progress row');
      const phase = cell(match[1], 256), status = match[2].trim(), note = cell(match[3], 2048);
      if (seen.has(phase)) throw new Error('Repeated progress phase');
      seen.add(phase); rows.push({ phase, status, note });
    }
    return { bytes, info: before, heading: lines[0], rows, digest: digest(bytes) };
  } finally { await file.close(); }
}
function render(heading, rows) {
  return `${heading}\n\n| Phase | Status | Note |\n|---|---|---|\n${rows.map(row => `| ${row.phase} | ${row.status} | ${row.note} |`).join('\n')}${rows.length ? '\n' : ''}`;
}
/** Initialize the shared reference-style phase table without replacing a previous run. */
export async function initializePipelineProgress({ path }) {
  await directory(path);
  const ticket = await inspectTicketDirectory(path), id = ticket.identity?.id ?? basename(path).match(/^[0-9]+/)?.[0] ?? 'unknown';
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) throw new Error('Ticket identity required');
  const file = join(path, 'dev-all-progress.md'), bytes = Buffer.from(render(`# Pipeline Progress — #${id}`, []));
  await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  return { path: file, digest: digest(bytes), rows: [], scope: 'Editable declared progress only; actual work and checks are not proven.' };
}
/** Inspect a compatible reference-style phase table. */
export async function inspectPipelineProgress({ path }) {
  await directory(path);
  const file = join(path, 'dev-all-progress.md'), record = await readProgress(file);
  return { path: file, digest: record.digest, rows: record.rows, scope: 'Editable declared progress only; actual work and checks are not proven.' };
}
/** Update one phase without losing other rows, guarded by a content digest and lock. */
export async function updatePipelineProgress({ path, input, expectedDigest }) {
  await directory(path);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['phase', 'status', 'note'].includes(key)) || !states.includes(input.status) || !/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) throw new TypeError('Invalid progress update');
  const phase = cell(input.phase, 256), note = cell(input.note ?? '—', 2048), file = join(path, 'dev-all-progress.md'), lockPath = `${file}.lock`;
  const lock = await open(lockPath, 'wx', 0o600), lockInfo = await lock.stat();
  let temporary;
  try {
    const before = await readProgress(file);
    if (before.digest !== expectedDigest) return { updated: false, reason: 'progress-changed' };
    const rows = before.rows.map(row => row.phase === phase ? { phase, status: input.status, note } : row);
    if (!rows.some(row => row.phase === phase)) rows.push({ phase, status: input.status, note });
    if (rows.length > 200) throw new Error('Progress row limit exceeded');
    const output = Buffer.from(render(before.heading, rows));
    if (output.length > 262144) throw new Error('Progress exceeds size limit');
    temporary = join(path, `.dev-all-progress-${randomUUID()}.tmp`);
    const temp = await open(temporary, 'wx', before.info.mode & 0o777);
    try { await temp.writeFile(output); await temp.sync(); } finally { await temp.close(); }
    const last = await readProgress(file);
    if (last.digest !== expectedDigest || last.info.dev !== before.info.dev || last.info.ino !== before.info.ino) return { updated: false, reason: 'progress-changed' };
    await rename(temporary, file); temporary = undefined;
    return { updated: true, path: file, digest: digest(output), rows, scope: 'Declared progress only; a matching editable record is not proof of completed work.' };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close();
    try { const current = await lstat(lockPath); if (current.dev === lockInfo.dev && current.ino === lockInfo.ino) await unlink(lockPath); } catch { /* Inspect interrupted locks manually. */ }
  }
}
