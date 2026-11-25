import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { inspectWorkflowRun } from './workflow-run-state.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function contextDirectory(project, create) {
  const root = await realpath(project);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error('Invalid project');
  let path = root;
  for (const name of ['.ai', 'run-context']) {
    path = join(path, name);
    if (create) { try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; } }
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid orchestration context directory');
  }
  return { root, directory: path, flag: join(path, 'orchestrating.flag') };
}
async function readFlag(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > 16384) throw new Error('Invalid orchestration marker');
    const bytes = Buffer.alloc(16385); let offset = 0;
    while (offset < bytes.length) { const part = await file.read(bytes, offset, bytes.length - offset, null); if (!part.bytesRead) break; offset += part.bytesRead; }
    const after = await file.stat();
    if (offset > 16384 || offset !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.size !== after.size) throw new Error('Orchestration marker changed');
    const content = bytes.subarray(0, offset);
    let record = null;
    if (offset) {
      record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
      if (record?.version !== 1 || record.skill !== 'agent-agent-all' || typeof record.ticket !== 'string' || typeof record.spec !== 'string' || typeof record.started !== 'string' || !Number.isFinite(Date.parse(record.started))) throw new Error('Invalid orchestration marker');
    }
    return { record, digest: sha(content), stat: before };
  } finally { await file.close(); }
}
/** Create a marker compatible with the reference workflow without replacing an existing one. */
export async function startOrchestrationContext({ project, spec }) {
  const context = await contextDirectory(project, true), specPath = await realpath(spec);
  if (!specPath.startsWith(`${join(context.root, '.ai', 'specs')}${sep}`)) throw new Error('Spec must be inside this project');
  const run = await inspectWorkflowRun({ path: specPath });
  if (run.state.status !== 'active') throw new Error('An active declared run is required');
  const record = { version: 1, skill: 'agent-agent-all', ticket: run.state.ticket, spec: specPath, started: run.state.started };
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`), file = await open(context.flag, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  return { path: context.flag, ticket: record.ticket, digest: sha(bytes), scope: 'Local orchestration marker only; it does not prove that an agent is running or phases completed.' };
}
/** Inspect the original flag's age and recognize a legacy empty marker. */
export async function inspectOrchestrationContext({ project }, { now = Date.now } = {}) {
  let context;
  try { context = await contextDirectory(project, false); } catch (error) { if (error?.code === 'ENOENT') return { status: 'missing', scope: 'No local marker found.' }; throw error; }
  let marker;
  try { marker = await readFlag(context.flag); } catch (error) { if (error?.code === 'ENOENT') return { status: 'missing', scope: 'No local marker found.' }; throw error; }
  const ageMs = now() - marker.stat.mtimeMs;
  const age = ageMs < 0 ? 'future-clock' : ageMs >= 2 * 60 * 60 * 1000 ? 'older-than-two-hours' : 'under-two-hours';
  return { status: 'present', format: marker.record ? 'factory' : 'legacy-empty', age, ticket: marker.record?.ticket ?? null, digest: marker.digest, scope: 'Marker presence and modification time only; neither proves process liveness, authorization or completed work.' };
}
/** Refresh or close only the unchanged marker tied to the same declared run. */
export async function updateOrchestrationContext({ project, spec, operation, expectedDigest }) {
  if (!['heartbeat', 'close'].includes(operation) || !/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) throw new TypeError('Invalid context update');
  const context = await contextDirectory(project, false), specPath = await realpath(spec), marker = await readFlag(context.flag);
  if (!marker.record || marker.digest !== expectedDigest || marker.record.spec !== specPath || !specPath.startsWith(`${join(context.root, '.ai', 'specs')}${sep}`)) return { updated: false, reason: 'marker-or-spec-mismatch' };
  const run = await inspectWorkflowRun({ path: specPath });
  if (run.state.ticket !== marker.record.ticket || run.state.started !== marker.record.started) return { updated: false, reason: 'run-changed' };
  const latest = await readFlag(context.flag);
  if (latest.digest !== expectedDigest || latest.stat.dev !== marker.stat.dev || latest.stat.ino !== marker.stat.ino || latest.stat.mtimeMs !== marker.stat.mtimeMs || latest.stat.ctimeMs !== marker.stat.ctimeMs) return { updated: false, reason: 'marker-changed' };
  if (operation === 'heartbeat') {
    const file = await open(context.flag, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const stat = await file.stat(); if (stat.dev !== marker.stat.dev || stat.ino !== marker.stat.ino) return { updated: false, reason: 'marker-changed' }; const time = new Date(); await file.utimes(time, time); }
    finally { await file.close(); }
  } else await unlink(context.flag);
  return { updated: true, operation, scope: 'Local marker updated; concurrent non-cooperating changes may still race. The marker is not proof of process liveness.' };
}
