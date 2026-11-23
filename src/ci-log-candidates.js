import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
/** Find diagnostic candidate line numbers without copying log content into output. */
export async function inspectCiLogCandidates({ path }) {
  const bytes = await readLimitedFile(path, 5 * 1024 * 1024), text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0')) throw new Error('Binary logs are not supported');
  const lines = text.split(/\r?\n/);
  if (lines.length > 200000) throw new Error('Log line limit exceeded');
  const expressions = [ ['error', /\b(?:error|fatal)\b/i], ['failure', /\b(?:failed|failure|failing)\b/i], ['exception', /\b(?:exception|traceback)\b/i], ['warning', /\bwarning\b/i] ];
  const counts = Object.fromEntries(expressions.map(([name]) => [name, 0])), candidates = []; let longLines = 0, matchingLines = 0;
  lines.forEach((line, index) => {
    if (line.length > 32768) { longLines++; return; }
    const clean = line.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
    const categories = expressions.filter(([, pattern]) => pattern.test(clean)).map(([name]) => name);
    if (!categories.length) return;
    matchingLines++;
    for (const category of categories) counts[category]++;
    if (candidates.length < 1000) candidates.push({ line: index + 1, categories });
  });
  return { path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, lines: lines.length, counts, candidates, candidateListTruncated: matchingLines > candidates.length, skippedLongLines: longLines, scope: 'Heuristic keyword locations only; false positives, omissions, sensitive content, root cause and actual command results require inspection of the original log.' };
}

/** Compare keyword counts in two explicit logs without printing their content. */
export async function compareCiLogCandidates({ beforePath, afterPath }) {
  const [before, after] = await Promise.all([inspectCiLogCandidates({ path: beforePath }), inspectCiLogCandidates({ path: afterPath })]);
  const categories = Object.keys(before.counts).map(category => ({ category, before: before.counts[category], after: after.counts[category], difference: after.counts[category] - before.counts[category] }));
  return { before: { path: before.path, sha256: before.sha256, lines: before.lines, skippedLongLines: before.skippedLongLines }, after: { path: after.path, sha256: after.sha256, lines: after.lines, skippedLongLines: after.skippedLongLines }, categories, scope: 'Heuristic keyword-count comparison only; different jobs or log formats may not be comparable, and fewer matches do not establish success or root cause.' };
}
