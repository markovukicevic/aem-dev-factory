import { createHash } from 'node:crypto';
import { lstat, writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { parseImplementationPlan } from './plan-parser.js';

/** Hash plan content while ignoring only declared execution statuses and provenance verification. */
export function planReviewDigest(markdown) {
  if (typeof markdown !== 'string' || markdown.includes('<!--') || markdown.includes('-->')) throw new Error('Plan comments require manual inspection');
  const parsed = parseImplementationPlan(markdown);
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  if (parsed.provenance) {
    let end = -1;
    for (let i = 1; i < lines.length; i++) if (lines[i] === '---') { end = i; break; }
    if (end < 0) throw new Error('Invalid plan provenance');
    let replaced = 0;
    for (let i = 1; i < end; i++) {
      const next = lines[i].replace(/^(  verified:\s*)(true|false)(\s*(?:#.*)?)$/, '$1<ignored>$3');
      if (next !== lines[i]) { lines[i] = next; replaced++; }
    }
    if (replaced !== 1) throw new Error('Ambiguous plan provenance');
    start = end + 1;
  }
  let current = null, fenced = false, fenceChar, fenceLength, count = 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!fenced) { fenced = true; fenceChar = fence[1][0]; fenceLength = fence[1].length; }
      else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength) fenced = false;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const step = /^Step\s+(\d+):\s+(.+)$/.exec(heading[2]);
      if (step) current = { level: heading[1].length };
      else if (current && heading[1].length <= current.level) current = null;
      continue;
    }
    if (current && /^\s*\*\*Status:\*\*\s*(pending|in-progress|done|blocked)\s*$/.test(line)) { lines[i] = '**Status:** <ignored>'; count++; }
  }
  if (count !== parsed.steps.length) throw new Error('Ambiguous plan statuses');
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

async function readDigest(path) {
  const bytes = await readLimitedFile(path, 1024 * 1024), text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('Plan is not valid UTF-8');
  return planReviewDigest(text);
}
function cleanText(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new TypeError('Invalid plan review text');
  return value;
}
function validateReview(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !['ready', 'needs-changes', 'blocked'].includes(input.verdict) || !Array.isArray(input.findings) || input.findings.length > 100 || !Array.isArray(input.unresolved) || input.unresolved.length > 100) throw new TypeError('Invalid plan review');
  if (input.verdict === 'ready' && input.unresolved.length) throw new TypeError('A ready review cannot list unresolved decisions');
  return { verdict: input.verdict, summary: cleanText(input.summary, 8192), findings: input.findings.map(value => cleanText(value, 8192)), unresolved: input.unresolved.map(value => cleanText(value, 8192)) };
}

/** Record supplied review conclusions against the current plan content. */
export async function savePlanReview({ planPath, inputPath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const digest = await readDigest(planPath);
  const review = validateReview(JSON.parse((await readLimitedFile(inputPath, 1024 * 1024)).toString('utf8')));
  if (digest !== await readDigest(planPath)) throw new Error('Plan changed while recording review');
  const record = { planDigest: digest, ...review };
  const json = JSON.stringify(record, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Plan review record\n\nSupplied review conclusions follow. This editable record does not verify the plan, requirements or review. Execution statuses and provenance verification are excluded from the plan digest.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Plan review exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, verdict: review.verdict, scope: 'Supplied conclusions only; review and plan correctness are not verified.' };
}

/** Compare editable review conclusions against the current plan content. */
export async function checkPlanReview({ planPath, reportPath }) {
  const report = (await readLimitedFile(reportPath, 2 * 1024 * 1024)).toString('utf8');
  const match = /^# Plan review record\n\nSupplied review conclusions follow\. This editable record does not verify the plan, requirements or review\. Execution statuses and provenance verification are excluded from the plan digest\.\n\n(`{3,})json\n([\s\S]*?)\n\1\n$/.exec(report);
  if (!match) throw new Error('Unsupported plan review format');
  const saved = JSON.parse(match[2]), review = validateReview(saved);
  if (typeof saved.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(saved.planDigest)) throw new Error('Invalid plan review digest');
  const currentDigest = await readDigest(planPath);
  return { verdict: review.verdict, planMatches: saved.planDigest === currentDigest, findings: review.findings.length, unresolved: review.unresolved.length, scope: 'Editable supplied review record only; matching content does not establish that the review occurred or that requirements are satisfied.' };
}
