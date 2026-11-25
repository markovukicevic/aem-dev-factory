import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { parseImplementationPlan } from './plan-parser.js';
import { isPlanStepId, normalizePlanStepId, canRunCorrectiveStep } from './plan-step-id.js';
import { readLimitedFile } from './read-limited.js';

const transitions = { pending: ['in-progress'], 'in-progress': ['done', 'blocked'], blocked: ['pending'], done: [] };
const digest = text => createHash('sha256').update(text, 'utf8').digest('hex');

/** Prepare a restricted one-step status change without altering unrelated plan text. */
export function transitionPlanText({ text, step, from, to }) {
  if (typeof text !== 'string' || text.includes('<!--') || text.includes('-->')) throw new Error('Plan comments require manual editing');
  if (!isPlanStepId(step) || !Object.hasOwn(transitions, from) || !transitions[from].includes(to)) throw new TypeError('Invalid status transition');
  const parsed = parseImplementationPlan(text);
  const target = parsed.steps.find(item => item.number === step);
  if (!target || target.status !== from) throw new Error('Step status does not match');
  if (to === 'in-progress') {
    const blocked = parsed.steps.filter(item => item.status === 'blocked'), targetIndex = parsed.steps.indexOf(target);
    const repairsBlockedParent = canRunCorrectiveStep(parsed.steps, step);
    const earlierPending = parsed.steps.slice(0, targetIndex).some(item => item.status === 'pending');
    if (parsed.steps.some(item => item.status === 'in-progress') || earlierPending || (blocked.length && !repairsBlockedParent)) throw new Error('Another step blocks execution or is earlier in the plan');
  }
  const lines = text.split('\n');
  let inFence = false;
  let fenceChar, fenceLength, current = null, edits = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) { inFence = true; fenceChar = fence[1][0]; fenceLength = fence[1].length; }
      else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength) inFence = false;
      continue;
    }
    if (inFence) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const match = /^Step\s+((?:[1-9][0-9]*(?:[a-z](?:[1-9][0-9]*)?)?|R[1-9][0-9]*[a-z]?)):\s+(.+)$/.exec(heading[2]);
      if (match) current = { number: normalizePlanStepId(match[1]), level: heading[1].length };
      else if (current && heading[1].length <= current.level) current = null;
      continue;
    }
    if (current?.number === step) {
      const status = /^(\s*\*\*Status:\*\*\s*)(pending|in-progress|done|blocked)(\s*)$/.exec(line);
      if (status) { lines[i] = `${status[1]}${to}${status[3]}${lines[i].endsWith('\r') ? '\r' : ''}`; edits++; }
    }
  }
  if (edits !== 1) throw new Error('Ambiguous step status');
  if (parsed.provenance?.verified === true) {
    let end = -1;
    for (let i = 1; i < lines.length; i++) if (lines[i].replace(/\r$/, '') === '---') { end = i; break; }
    if (end < 0) throw new Error('Invalid provenance');
    let changed = 0;
    for (let i = 1; i < end; i++) {
      const replaced = lines[i].replace(/^(  verified:\s*)true(\s*(?:#.*)?\r?)$/, '$1false$2');
      if (replaced !== lines[i]) { lines[i] = replaced; changed++; }
    }
    if (changed !== 1) throw new Error('Ambiguous verification field');
  }
  const output = lines.join('\n');
  const after = parseImplementationPlan(output);
  if (after.steps.find(item => item.number === step)?.status !== to || after.provenance?.verified === true) throw new Error('Updated plan did not validate');
  return output;
}

/** Require a matching digest and coordinate cooperating writers using an exclusive lock. */
export async function transitionPlanFile({ path, step, from, to, expectedDigest }) {
  if (typeof path !== 'string' || !path.trim() || typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Plan path and expected digest are required');
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, 'wx', 0o600);
  const lockIdentity = await lock.stat();
  let temp;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink()) throw new Error('Plan must be a regular file');
    const bytes = await readLimitedFile(path, 1024 * 1024);
    const text = bytes.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(bytes) || digest(text) !== expectedDigest) throw new Error('Plan changed or is not valid UTF-8');
    const updated = transitionPlanText({ text, step, from, to });
    if (Buffer.byteLength(updated, 'utf8') > 1024 * 1024) throw new Error('Updated plan exceeds size limit');
    temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
    const output = await open(temp, 'wx', before.mode & 0o777);
    let tempIdentity;
    try { await output.writeFile(updated, 'utf8'); await output.chmod(before.mode & 0o777); await output.sync(); tempIdentity = await output.stat(); } finally { await output.close(); }
    const tempInfo = await lstat(temp);
    if (!tempInfo.isFile() || tempInfo.isSymbolicLink() || tempInfo.dev !== tempIdentity.dev || tempInfo.ino !== tempIdentity.ino) throw new Error('Temporary plan changed during update');
    const last = await lstat(path);
    const current = await readLimitedFile(path, 1024 * 1024);
    if (!last.isFile() || last.isSymbolicLink() || last.dev !== before.dev || last.ino !== before.ino || !current.equals(bytes)) throw new Error('Plan changed during update');
    await rename(temp, path);
    temp = null;
    return { path, step, from, to, digest: digest(updated), verification: 'not established' };
  } finally {
    if (temp) await unlink(temp).catch(() => {});
    await lock.close();
    try { const currentLock = await lstat(lockPath); if (currentLock.dev === lockIdentity.dev && currentLock.ino === lockIdentity.ino) await unlink(lockPath); } catch { /* Lock may have been removed by another process. */ }
  }
}
