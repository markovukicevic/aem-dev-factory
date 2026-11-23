import { constants } from 'node:fs';
import { lstat, open, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { inspectTicketDirectory } from './ticket-status.js';
import { inspectWorkflowStatus } from './workflow-status.js';
import { readGitState } from './git-state.js';

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
export async function collectWorkflowSnapshot({ path, repo }) {
  let gitBefore = null, repoPath = null;
  if (repo !== undefined) {
    if (typeof repo !== 'string' || !repo.trim()) throw new TypeError('Invalid repository path');
    const info = await lstat(repo);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Repository must be a local directory');
    repoPath = await realpath(repo);
    gitBefore = await readGitState(repoPath);
  }
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
  let git = null;
  if (gitBefore) {
    const after = await readGitState(repoPath);
    git = { path: repoPath, head: gitBefore.head, commit: gitBefore.commit, workingTreeClean: gitBefore.workingTreeClean, stable: gitBefore.head === after.head && gitBefore.commit === after.commit && gitBefore.workingTreeClean === after.workingTreeClean };
  }
  return { version: 1, specPath: canonical, capturedAt: new Date().toISOString(), phase: workflow.phase, artifacts, complete, git, scope: 'Editable local artifact snapshot and optional Git metadata only. Dirty worktree contents, checks and readiness are not verified; files may change during or after collection.' };
}


/** Save a new snapshot without overwriting an existing file. */
export async function saveWorkflowSnapshot({ path, outputPath, repo }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const snapshot = await collectWorkflowSnapshot({ path, repo });
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > 262144) throw new Error('Snapshot exceeds size limit');
  await writeFile(outputPath, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, phase: snapshot.phase, complete: snapshot.complete, gitComparable: snapshot.git ? snapshot.git.stable && snapshot.git.workingTreeClean : null, scope: snapshot.scope };
}

/** Compare known local artifact hashes with an editable snapshot. */
export async function compareWorkflowSnapshot({ path, snapshotPath, repo }) {
  const saved = JSON.parse((await readLimitedFile(snapshotPath, 262144)).toString('utf8'));
  if (saved?.git !== undefined && saved.git !== null && (!saved.git || typeof saved.git !== 'object' || typeof saved.git.path !== 'string' || typeof saved.git.head !== 'string' || !saved.git.head || typeof saved.git.commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(saved.git.commit) || typeof saved.git.workingTreeClean !== 'boolean' || typeof saved.git.stable !== 'boolean')) throw new Error('Invalid snapshot Git state');
  if (repo !== undefined && (!saved?.git || await realpath(repo) !== saved.git.path)) throw new Error('Repository does not match the snapshot');
  const current = await collectWorkflowSnapshot({ path, repo });
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
  let gitComparison = saved.git ? 'not-checked' : 'not-requested';
  if (saved.git && current.git) {
    if (!saved.git.stable || !current.git.stable || !saved.git.workingTreeClean || !current.git.workingTreeClean) gitComparison = 'unknown';
    else gitComparison = saved.git.head === current.git.head && saved.git.commit === current.git.commit ? 'match' : 'changed';
  }
  return { changes, previousPhase: typeof saved.phase === 'string' ? saved.phase : null, currentPhase: current.phase, comparisonComplete, gitComparison, consistent: comparisonComplete && changes.length === 0 && ['match', 'not-requested'].includes(gitComparison), scope: 'Editable local snapshot comparison only. Dirty worktree contents, tests and readiness are not verified; Git state may change after inspection.' };
}
