import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { parseImplementationPlan } from './plan-parser.js';
import { isCorrectiveForStep } from './plan-step-id.js';

const hash = value => createHash('sha256').update(value).digest('hex');
function field(value, max) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('Invalid corrective step field');
  return value;
}
function proposal(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['title', 'files', 'what', 'why', 'check'].includes(key)) || !Array.isArray(input.files) || !input.files.length || input.files.length > 30) throw new TypeError('Invalid corrective step');
  return { title: field(input.title, 240), files: input.files.map(value => field(value, 1024)), what: field(input.what, 4000), why: field(input.why, 4000), check: field(input.check, 2000) };
}
function buildPlan(text, parent, data) {
  if (text.includes('<!--') || text.includes('-->')) throw new Error('Plan comments require manual editing');
  const plan = parseImplementationPlan(text), index = plan.steps.findIndex(step => step.number === parent);
  if (index < 0 || plan.steps[index].status !== 'blocked' || plan.steps.some(step => step.status === 'in-progress')) throw new Error('A blocked parent without active steps is required');
  const first = `${parent}h`, second = `${parent}h2`;
  const previous = plan.steps.find(step => step.number === first), existingSecond = plan.steps.some(step => step.number === second);
  if (existingSecond || (previous && !['done', 'blocked'].includes(previous.status))) throw new Error('Healing cycle unavailable');
  const id = previous ? second : first;
  const blocked = plan.steps.filter(step => step.status === 'blocked');
  if (blocked.some(step => step.number !== parent && !isCorrectiveForStep(step.number, parent))) throw new Error('An unrelated step is blocked');
  const lines = text.split('\n');
  let inFence = false, fenceChar, fenceLength, found = false, level = 0, insert = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, ''), fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) { if (!inFence) { inFence = true; fenceChar = fence[1][0]; fenceLength = fence[1].length; } else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength) inFence = false; continue; }
    if (inFence) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!heading) continue;
    const step = /^Step\s+((?:[1-9][0-9]*(?:[a-z](?:[1-9][0-9]*)?)?|R[1-9][0-9]*[a-z]?)):\s+/.exec(heading[2]);
    if (!found && step?.[1] === String(parent)) { found = true; level = heading[1].length; continue; }
    if (found && heading[1].length <= level) {
      if (step && isCorrectiveForStep(step[1], parent)) continue;
      insert = i; break;
    }
  }
  if (!found || inFence) throw new Error('Cannot locate blocked step');
  const section = [`### Step ${id}: Heal — ${data.title}`, '**Status:** pending', `**Files:** ${data.files.join(', ')}`, `**What:** ${data.what}`, `**Why:** ${data.why}`, `**Test:** ${data.check}`, ''];
  lines.splice(insert, 0, ...section);
  if (plan.provenance?.verified === true) {
    let end = -1;
    for (let i = 1; i < lines.length; i++) if (lines[i].replace(/\r$/, '') === '---') { end = i; break; }
    if (end < 0) throw new Error('Invalid provenance');
    let edits = 0;
    for (let i = 1; i < end; i++) { const next = lines[i].replace(/^(  verified:\s*)true(\s*(?:#.*)?\r?)$/, '$1false$2'); if (next !== lines[i]) { lines[i] = next; edits++; } }
    if (edits !== 1) throw new Error('Invalid verification field');
  }
  const updated = lines.join('\n'), parsed = parseImplementationPlan(updated);
  if (!parsed.steps.some(step => step.number === id && step.status === 'pending') || parsed.provenance?.verified === true) throw new Error('Corrective plan is invalid');
  return { id, updated, section: section.join('\n') };
}

/** Preview or insert one user-supplied reference-style healing step and retain the prior plan. */
export async function processPlanHeal({ path, parent, inputPath, expectedDigest }) {
  if (!Number.isSafeInteger(parent) || parent < 1 || (expectedDigest !== undefined && !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid healing request');
  const dir = await lstat(path);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Invalid spec directory');
  const planPath = join(path, 'implement.md'), info = await lstat(planPath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid plan');
  const bytes = await readLimitedFile(planPath, 1024 * 1024), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const input = proposal(JSON.parse((await readLimitedFile(inputPath, 262144)).toString('utf8'))), candidate = buildPlan(text, parent, input);
  if (Buffer.byteLength(candidate.updated) > 1024 * 1024) throw new Error('Plan exceeds size limit');
  const oldDigest = hash(bytes), digest = hash(JSON.stringify({ oldDigest, parent, input, id: candidate.id }));
  const result = { added: false, parent, step: candidate.id, proposedSection: candidate.section, oldDigest, digest, scope: 'Supplied corrective proposal only; it does not diagnose, implement or verify a fix. The changed plan requires a new review.' };
  if (expectedDigest === undefined) return result;
  if (expectedDigest !== digest) return { ...result, reason: 'preview-changed' };
  const lockPath = `${planPath}.lock`, lock = await open(lockPath, 'wx', 0o600), lockStat = await lock.stat();
  let temporary;
  try {
    const currentInfo = await lstat(planPath), current = await readLimitedFile(planPath, 1024 * 1024);
    if (!currentInfo.isFile() || currentInfo.isSymbolicLink() || currentInfo.dev !== info.dev || currentInfo.ino !== info.ino || !current.equals(bytes)) return { ...result, reason: 'plan-changed' };
    const history = join(path, 'plan-history');
    try { await mkdir(history, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const historyInfo = await lstat(history);
    if (!historyInfo.isDirectory() || historyInfo.isSymbolicLink()) throw new Error('Invalid plan history');
    const backupPath = join(history, `${oldDigest}.md`);
    try { await writeFile(backupPath, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; const old = await lstat(backupPath); if (!old.isFile() || old.isSymbolicLink() || hash(await readLimitedFile(backupPath, 1024 * 1024)) !== oldDigest) throw error; }
    temporary = join(path, `.implement-${randomUUID()}.tmp`);
    const output = await open(temporary, 'wx', info.mode & 0o777);
    try { await output.writeFile(candidate.updated, 'utf8'); await output.sync(); } finally { await output.close(); }
    const lastInfo = await lstat(planPath), last = await readLimitedFile(planPath, 1024 * 1024);
    if (!lastInfo.isFile() || lastInfo.isSymbolicLink() || lastInfo.dev !== info.dev || lastInfo.ino !== info.ino || !last.equals(bytes)) return { ...result, reason: 'plan-changed', backupPath };
    await rename(temporary, planPath); temporary = undefined;
    return { ...result, added: true, backupPath, planDigest: hash(candidate.updated) };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await lock.close();
    try { const currentLock = await lstat(lockPath); if (currentLock.dev === lockStat.dev && currentLock.ino === lockStat.ino) await unlink(lockPath); } catch { /* Inspect interrupted locks manually. */ }
  }
}
