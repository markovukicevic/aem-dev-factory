import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';

/** Read reference-style numbered and corrective step labels without loading step bodies into output. */
export function parseReferencePlanMetadata(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('Plan must be text');
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let fenced = false, fenceChar, fenceLength, inComment = false, frontmatter = false, current = null;
  const steps = [], ids = new Set();
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (i === 0 && line === '---') { frontmatter = true; continue; }
    if (frontmatter) { if (line === '---') frontmatter = false; continue; }
    while (line.includes('<!--') || inComment) {
      if (inComment) { const end = line.indexOf('-->'); if (end < 0) { line = ''; break; } line = line.slice(end + 3); inComment = false; }
      else { const start = line.indexOf('<!--'), end = line.indexOf('-->', start + 4); if (end < 0) { line = line.slice(0, start); inComment = true; break; } line = line.slice(0, start) + line.slice(end + 3); }
    }
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!fenced) { fenced = true; fenceChar = fence[1][0]; fenceLength = fence[1].length; }
      else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength) fenced = false;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const step = /^Step\s+((?:[1-9][0-9]*[a-z]?|R[1-9][0-9]*)):\s+(.+)$/.exec(heading[2]);
      if (step) {
        if (step[1].length > 32 || ids.has(step[1]) || step[2].length > 1024 || /[\u0000-\u001f\u007f]/.test(step[2])) throw new Error('Invalid or duplicate plan step');
        current = { id: step[1], title: step[2], status: null, level: heading[1].length };
        ids.add(step[1]); steps.push(current);
      } else {
        if (/^Step\b/i.test(heading[2])) throw new Error('Unsupported plan step');
        if (current && heading[1].length <= current.level) current = null;
      }
      continue;
    }
    if (current && /^\s*\*\*Status:\*\*/.test(line)) {
      const status = /^\s*\*\*Status:\*\*\s*(pending|in-progress|done|blocked)\s*$/.exec(line);
      if (!status || current.status !== null) throw new Error('Invalid or duplicate step status');
      current.status = status[1];
    }
  }
  if (frontmatter || fenced || inComment || !steps.length || steps.some(step => !step.status)) throw new Error('Incomplete plan metadata');
  const counts = { pending: 0, 'in-progress': 0, done: 0, blocked: 0 };
  for (const step of steps) counts[step.status]++;
  const native = steps.every(step => /^[1-9][0-9]*$/.test(step.id) && Number.isSafeInteger(Number(step.id)));
  const next = counts.blocked || counts['in-progress'] ? null : steps.find(step => step.status === 'pending')?.id ?? null;
  return { total: steps.length, counts, steps: steps.map(({ id, title, status }) => ({ id, title, status })), next, executionSupport: native ? 'numbered-labels-only' : 'corrective-steps-require-manual-inspection', scope: 'Declared plan metadata only. Corrective labels are readable but are not yet executable by the current workflow; statuses do not prove work or checks.' };
}

export async function readReferencePlanMetadata(path) {
  const directory = await lstat(path);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const plan = join(path, 'implement.md'), info = await lstat(plan);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid plan');
  const bytes = await readLimitedFile(plan, 1024 * 1024);
  return parseReferencePlanMetadata(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
