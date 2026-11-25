import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';

async function learningRoot(cwd, create) {
  const root = await realpath(cwd);
  let path = root;
  for (const name of ['.ai', 'learning', 'raw']) {
    path = join(path, name);
    if (create) { try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; } }
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid learning directory');
  }
  return path;
}
function validate(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['ticket', 'step', 'error_type', 'fix_description', 'result'].includes(key)) || typeof entry.ticket !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(entry.ticket) || !(Number.isSafeInteger(entry.step) && entry.step > 0) && !(typeof entry.step === 'string' && /^(?:[1-9][0-9]*[a-z]|R[1-9][0-9]*)$/.test(entry.step)) || typeof entry.error_type !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.error_type) || entry.error_type.length > 80 || typeof entry.fix_description !== 'string' || !entry.fix_description.trim() || entry.fix_description.length > 2000 || /[\u0000-\u001f\u007f]/.test(entry.fix_description) || !['success', 'failed'].includes(entry.result)) throw new TypeError('Invalid fix observation');
  return { ticket: entry.ticket, step: entry.step, error_type: entry.error_type, fix_description: entry.fix_description.trim(), result: entry.result };
}

/** Append one supplied fix observation in the reference project's JSONL format. */
export async function recordFixObservation({ cwd, inputPath }, { now = () => new Date() } = {}) {
  const input = JSON.parse((await readLimitedFile(inputPath, 16384)).toString('utf8'));
  const record = { timestamp: now().toISOString(), ...validate(input) };
  const data = Buffer.from(`${JSON.stringify(record)}\n`);
  const root = await learningRoot(cwd, true), path = join(root, 'fixes.jsonl');
  const file = await open(path, constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size + data.length > 2 * 1024 * 1024) throw new Error('Fix history unavailable or full');
    if (info.size) { const last = Buffer.alloc(1); const check = await file.read(last, 0, 1, info.size - 1); if (check.bytesRead !== 1 || last[0] !== 10) throw new Error('Incomplete fix history; inspect before appending'); }
    const written = await file.write(data, 0, data.length, null);
    if (written.bytesWritten !== data.length) throw new Error('Partial append; inspect fix history before retrying');
    await file.sync();
  } finally { await file.close(); }
  return { path, recorded: true, scope: 'Supplied local observation only; no fix or result is independently verified. Inspect history before retrying an unclear append.' };
}

/** Group reference-style fix observations and identify repeated successful patterns. */
export async function summarizeFixPatterns({ cwd }) {
  let root;
  try { root = await learningRoot(cwd, false); } catch (error) { if (error?.code === 'ENOENT') return { patterns: [], invalid: 0, complete: true, history: 'missing', scope: 'No local fix history found.' }; throw error; }
  let raw;
  try {
    const path = join(root, 'fixes.jsonl'), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid fix history');
    raw = (await readLimitedFile(path, 2 * 1024 * 1024)).toString('utf8');
  } catch (error) { if (error?.code === 'ENOENT') return { patterns: [], invalid: 0, complete: true, history: 'missing', scope: 'No local fix history found.' }; throw error; }
  const groups = new Map(), lines = raw.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let invalid = 0;
  for (const line of lines) {
    try {
      const value = JSON.parse(line), { timestamp, ...fields } = value;
      if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid timestamp');
      const item = validate(fields), key = JSON.stringify([item.error_type, item.fix_description]);
      if (!groups.has(key)) groups.set(key, { errorType: item.error_type, fixDescription: item.fix_description, successes: 0, failures: 0, tickets: new Set() });
      const group = groups.get(key); group[item.result === 'success' ? 'successes' : 'failures']++; group.tickets.add(item.ticket);
    } catch { invalid++; }
  }
  const patterns = [...groups.values()].map(group => ({ ...group, tickets: [...group.tickets].sort(), eligible: invalid === 0 && group.successes >= 3 && group.failures === 0 })).sort((a, b) => b.successes - a.successes || a.errorType.localeCompare(b.errorType));
  return { patterns, invalid, complete: invalid === 0, history: 'present', scope: 'Editable supplied observations grouped by error type and fix description. The reference threshold is three successes and no failures; observations and future applicability are not independently verified.' };
}
