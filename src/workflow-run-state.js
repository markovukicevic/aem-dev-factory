import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { inspectWorkflowStatus } from './workflow-status.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
async function directory(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Spec directory required');
  const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid spec directory');
  return realpath(path);
}
async function acquireLock(root) {
  const path = join(root, '.run-state.lock'); let handle;
  try { handle = await open(path, 'wx', 0o600); } catch (error) { if (error?.code === 'EEXIST') throw new Error('Run state is locked; inspect before recovery'); throw error; }
  return { path, handle, stat: await handle.stat() };
}
async function releaseLock(lock) {
  await lock.handle.close();
  try { const current = await lstat(lock.path); if (current.dev === lock.stat.dev && current.ino === lock.stat.ino) await unlink(lock.path); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || (value.version !== undefined && value.version !== 1) || value.skill !== 'agent-agent-all' || typeof value.ticket !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.ticket) || !iso(value.started) || !Number.isSafeInteger(value.last_phase_completed) || value.last_phase_completed < 0 || !Number.isSafeInteger(value.total_phases) || value.total_phases < 0 || value.total_phases > 50 || value.last_phase_completed > value.total_phases || (value.updated !== undefined && !iso(value.updated)) || (value.status !== undefined && !['active', 'phases-declared', 'closed'].includes(value.status))) throw new Error('Invalid run state');
  if (value.status === 'active' && value.total_phases > 0 && value.last_phase_completed >= value.total_phases) throw new Error('Invalid active run state');
  if (['phases-declared', 'closed'].includes(value.status) && (value.total_phases === 0 || value.last_phase_completed !== value.total_phases)) throw new Error('Invalid completed run state');
  return { version: value.version ?? null, skill: value.skill, ticket: value.ticket, started: value.started, updated: value.updated ?? null, last_phase_completed: value.last_phase_completed, total_phases: value.total_phases, status: value.status ?? (value.total_phases > 0 && value.last_phase_completed === value.total_phases ? 'phases-declared' : 'active') };
}
async function readState(root) {
  const path = join(root, 'run-state.json'), handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat(); if (!before.isFile() || before.size > 16384) throw new Error('Invalid run state file');
    const buffer = Buffer.alloc(before.size + 1); let used = 0;
    while (used < buffer.length) { const next = await handle.read(buffer, used, buffer.length - used, null); if (!next.bytesRead) break; used += next.bytesRead; }
    const after = await handle.stat();
    if (used !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Run state changed while reading');
    const bytes = buffer.subarray(0, used), original = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), state = validate(original);
    return { path, state, original, digest: hash(bytes), stat: before };
  } finally { await handle.close(); }
}
/** Start a new local run record; never replace an existing run. */
export async function initializeWorkflowRun({ path, ticket, totalPhases }, { now = () => new Date() } = {}) {
  const root = await directory(path);
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(ticket) || !Number.isSafeInteger(totalPhases) || totalPhases < 1 || totalPhases > 50) throw new TypeError('Invalid run metadata');
  const started = now().toISOString(), state = { version: 1, skill: 'agent-agent-all', ticket, started, updated: started, last_phase_completed: 0, total_phases: totalPhases, status: 'active' }, bytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`), file = join(root, 'run-state.json');
  const lock = await acquireLock(root);
  try { await writeFile(file, bytes, { flag: 'wx', mode: 0o600 }); } finally { await releaseLock(lock); }
  return { path: file, state, digest: hash(bytes), scope: 'Editable declared progress only; phases, source identity and work are not verified.' };
}
/** Read new or reference-style run state without inferring actual completion. */
export async function inspectWorkflowRun({ path }, { now = Date.now } = {}) {
  const root = await directory(path), record = await readState(root), workflow = await inspectWorkflowStatus({ path: root });
  const updated = record.state.updated ?? record.state.started, ageMs = now() - Date.parse(updated);
  return { path: record.path, state: record.state, digest: record.digest, age: ageMs < 0 ? 'future-clock' : ageMs >= 2 * 60 * 60 * 1000 ? 'older-than-two-hours' : 'under-two-hours', suggestedPhase: workflow.phase, scope: 'Editable declared progress and artifact-presence suggestion only. A timestamp or phase count does not prove a live process, completed work or readiness.' };
}
/** Advance, set an unknown legacy total, or close a fully declared run. */
export async function transitionWorkflowRun({ path, operation, expectedDigest, totalPhases }, { now = () => new Date() } = {}) {
  if (!['advance', 'set-total', 'close'].includes(operation) || typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid run transition');
  const root = await directory(path), lock = await acquireLock(root);
  let temp;
  try {
    const before = await readState(root);
    if (before.digest !== expectedDigest) return { updated: false, reason: 'state-changed' };
    const state = { ...before.original, ...before.state };
    if (operation === 'set-total') {
      if (state.status !== 'active' || state.total_phases !== 0 || state.last_phase_completed !== 0 || !Number.isSafeInteger(totalPhases) || totalPhases < 1 || totalPhases > 50) throw new Error('Cannot set total');
      state.total_phases = totalPhases;
    } else if (operation === 'advance') {
      if (state.status !== 'active' || state.total_phases < 1 || state.last_phase_completed >= state.total_phases) throw new Error('Cannot advance run');
      state.last_phase_completed++;
      if (state.last_phase_completed === state.total_phases) state.status = 'phases-declared';
    } else {
      if (state.status !== 'phases-declared') throw new Error('Cannot close run');
      state.status = 'closed';
    }
    state.version = 1; state.updated = now().toISOString();
    const bytes = Buffer.from(`${JSON.stringify(state, null, 2)}\n`); temp = join(root, `.run-state-${randomUUID()}.tmp`);
    const file = await open(temp, 'wx', before.stat.mode & 0o777);
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    const final = await readState(root);
    if (final.digest !== expectedDigest || final.stat.dev !== before.stat.dev || final.stat.ino !== before.stat.ino) return { updated: false, reason: 'state-changed' };
    await rename(temp, before.path); temp = null;
    return { updated: true, state: validate(state), digest: hash(bytes), scope: 'Declared local progress only. Cooperative locking does not prevent independent edits, and no phase evidence or process liveness was verified.' };
  } finally {
    try { if (temp) { try { await unlink(temp); } catch (error) { if (error?.code !== 'ENOENT') throw error; } } } finally { await releaseLock(lock); }
  }
}
