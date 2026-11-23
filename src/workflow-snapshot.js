import { constants } from 'node:fs';
import { lstat, open, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { inspectTicketDirectory } from './ticket-status.js';
import { inspectWorkflowStatus } from './workflow-status.js';

async function hashArtifact(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > 1024 * 1024) throw new Error('Invalid artifact');
    const data = Buffer.alloc(1024 * 1024 + 1);
    let offset = 0;
    while (offset < data.length) {
      const { bytesRead } = await file.read(data, offset, data.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    if (offset > 1024 * 1024 || offset !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Artifact changed during inspection');
    return createHash('sha256').update(data.subarray(0, offset)).digest('hex');
  } finally { await file.close(); }
}

/** Capture known local artifact hashes, not source code or proof of execution. */
export async function collectWorkflowSnapshot({ path }) {
  const ticket = await inspectTicketDirectory(path);
  const canonical = await realpath(path);
  const artifacts = [];
  for (const item of ticket.files) {
    if (item.status !== 'present') { artifacts.push({ name: item.name, status: item.status, sha256: null }); continue; }
    try { artifacts.push({ name: item.name, status: 'present', sha256: await hashArtifact(join(canonical, item.name)) }); }
    catch { artifacts.push({ name: item.name, status: 'unreadable-or-changed', sha256: null }); }
  }
  const workflow = await inspectWorkflowStatus({ path });
  const final = await inspectTicketDirectory(path);
  const complete = artifacts.every(item => ['present', 'missing'].includes(item.status)) && ticket.plan?.digest === workflow.plan?.digest && ticket.plan?.digest === final.plan?.digest && ticket.files.length === final.files.length && ticket.files.every((item, index) => item.name === final.files[index].name && item.status === final.files[index].status);
  return { version: 1, specPath: canonical, capturedAt: new Date().toISOString(), phase: workflow.phase, artifacts, complete, scope: 'Editable local artifact snapshot only. Contents, checks, Git state and readiness are not verified; files may change during or after collection.' };
}


/** Save a new snapshot without overwriting an existing file. */
export async function saveWorkflowSnapshot({ path, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const snapshot = await collectWorkflowSnapshot({ path });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > 262144) throw new Error('Snapshot exceeds size limit');
  await writeFile(outputPath, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, phase: snapshot.phase, complete: snapshot.complete, scope: snapshot.scope };
}

/** Compare known local artifact hashes with an editable snapshot. */
export async function compareWorkflowSnapshot({ path, snapshotPath }) {
  const saved = JSON.parse((await readLimitedFile(snapshotPath, 262144)).toString('utf8'));
  const current = await collectWorkflowSnapshot({ path });
  if (!saved || saved.version !== 1 || saved.specPath !== current.specPath || typeof saved.complete !== 'boolean' || !Array.isArray(saved.artifacts) || saved.artifacts.length > 100) throw new Error('Invalid workflow snapshot');
  const validNames = new Set(current.artifacts.map(item => item.name)), old = new Map();
  for (const item of saved.artifacts) {
    if (!item || typeof item.name !== 'string' || !validNames.has(item.name) || old.has(item.name) || !['present', 'missing', 'unreadable', 'invalid-or-unreadable', 'unreadable-or-changed'].includes(item.status) || (item.status === 'present' ? typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) : item.sha256 !== null)) throw new Error('Invalid workflow snapshot artifact');
    old.set(item.name, item);
  }
  const changes = [];
  for (const item of current.artifacts) {
    const previous = old.get(item.name);
    if (!previous) changes.push({ name: item.name, change: 'newly-tracked' });
    else if (previous.status !== item.status) changes.push({ name: item.name, change: 'status-changed', before: previous.status, after: item.status });
    else if (item.status === 'present' && previous.sha256 !== item.sha256) changes.push({ name: item.name, change: 'content-changed' });
  }
  const comparisonComplete = saved.complete && current.complete;
  return { changes, previousPhase: typeof saved.phase === 'string' ? saved.phase : null, currentPhase: current.phase, comparisonComplete, consistent: comparisonComplete && changes.length === 0, scope: 'Editable local snapshot comparison only; source code, Git state, test results and readiness are not verified.' };
}
