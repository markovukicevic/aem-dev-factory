import { lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { listAutomationJobs } from './automation-queue.js';
import { inspectAutomationExecution } from './automation-job-run.js';

/** Summarize a bounded page of editable queue and execution records. */
export async function inspectAutomationQueueStatus({ target, store, offset = 0 }, { listJobs = listAutomationJobs, inspectExecution = inspectAutomationExecution } = {}) {
  if (typeof target !== 'string' || !target.trim() || typeof store !== 'string' || !store.trim() || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) throw new TypeError('Invalid queue status request');
  const root = await realpath(target), info = await lstat(store);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid execution store');
  const stateRoot = await realpath(store), rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Execution store must be outside the project');
  const queue = await listJobs({ target: root }), items = [];
  for (const job of queue.jobs.slice(offset, offset + 25)) {
    let execution;
    let entry;
    try { entry = await lstat(join(stateRoot, `${job.digest}.json`)); }
    catch (error) { execution = { status: error?.code === 'ENOENT' ? 'no-record-observed' : 'unavailable-or-invalid' }; }
    if (entry) {
      try {
        if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Invalid execution entry');
        const observed = await inspectExecution({ target: root, claimDigest: job.digest, store: stateRoot });
        execution = { status: observed.status, startedAt: observed.startedAt, finishedAt: observed.finishedAt, exitCode: observed.exitCode, contextObservation: observed.contextObservation };
      } catch { execution = { status: 'unavailable-or-invalid' }; }
    }
    items.push({ digest: job.digest, queueStatus: job.status, queuedAt: job.queuedAt ?? null, execution });
  }
  const nextOffset = offset + items.length < queue.jobs.length ? offset + items.length : null;
  return { items, offset, nextOffset, totalJobs: queue.jobs.length, queueComplete: queue.complete, claimErrors: queue.claimErrors, pageReadable: items.every(item => item.execution.status !== 'unavailable-or-invalid'), scope: 'Separate observations of editable local records. No execution record does not prove a job never ran; running does not prove liveness. No event authentication, provider status or work correctness is established.' };
}
