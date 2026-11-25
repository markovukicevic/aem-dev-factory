import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
      const step = /^Step\s+((?:[1-9][0-9]*(?:[a-z](?:[1-9][0-9]*)?)?|R[1-9][0-9]*[a-z]?)):\s+(.+)$/.exec(heading[2]);
      if (step) current = { level: heading[1].length };
      else if (current && heading[1].length <= current.level) current = null;
      continue;
    }
    if (current && /^\s*\*\*Status:\*\*\s*(pending|in-progress|done|blocked)\s*$/.test(line)) { lines[i] = '**Status:** <ignored>'; count++; }
  }
  if (count !== parsed.steps.length) throw new Error('Ambiguous plan statuses');
  return createHash('sha256').update(lines.join('\n'), 'utf8').digest('hex');
}

export async function readPlanReviewDigest(path) {
  const bytes = await readLimitedFile(path, 1024 * 1024), text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('Plan is not valid UTF-8');
  return planReviewDigest(text);
}
const contextFiles = ['raw-story.md', 'dor.md', 'explain.md', 'research.md'];

/** Read one bounded regular file without following its final symlink. */
async function readEvidenceFile(path, maxBytes = 1024 * 1024) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > maxBytes) throw new Error('Invalid evidence file');
    const bytes = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, null);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    const after = await file.stat();
    if (offset > maxBytes || offset !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Evidence changed');
    return bytes.subarray(0, offset);
  } finally { await file.close(); }
}

/** Fingerprint the local requirements context without exposing its contents. */
export async function readRequirementsContext(planPath) {
  const directory = dirname(planPath), hash = createHash('sha256');
  for (const name of contextFiles) {
    try {
      const bytes = await readEvidenceFile(join(directory, name));
      hash.update(name, 'utf8').update('\0').update(String(bytes.length), 'utf8').update('\0').update(bytes);
    } catch (error) { return { status: error?.code === 'ENOENT' ? 'missing' : 'unavailable', digest: null }; }
  }
  return { status: 'complete', digest: hash.digest('hex') };
}

/** Track identity presence and bytes, without asserting source authenticity. */
export async function readTicketIdentitySnapshot(planPath) {
  try {
    const bytes = await readEvidenceFile(join(dirname(planPath), 'source-identity.json'));
    return { status: 'present', digest: createHash('sha256').update(bytes).digest('hex') };
  } catch (error) { return { status: error?.code === 'ENOENT' ? 'missing' : 'unavailable', digest: null }; }
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
  const digest = await readPlanReviewDigest(planPath), context = await readRequirementsContext(planPath), identity = await readTicketIdentitySnapshot(planPath);
  const review = validateReview(JSON.parse((await readLimitedFile(inputPath, 1024 * 1024)).toString('utf8')));
  const contextAfter = await readRequirementsContext(planPath), identityAfter = await readTicketIdentitySnapshot(planPath);
  if (digest !== await readPlanReviewDigest(planPath) || context.status !== contextAfter.status || context.digest !== contextAfter.digest || identity.status !== identityAfter.status || identity.digest !== identityAfter.digest) throw new Error('Plan, requirements context or source identity changed while recording review');
  const record = { planDigest: digest, contextDigest: context.digest, identityStatus: identity.status, identityDigest: identity.digest, ...review };
  const json = JSON.stringify(record, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Plan review record\n\nSupplied review conclusions follow. This editable record does not verify the plan, requirements or review. Execution statuses and provenance verification are excluded from the plan digest.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Plan review exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, verdict: review.verdict, contextStatus: context.status, identityStatus: identity.status, scope: 'Supplied conclusions only; review and plan correctness are not verified.' };
}

/** Compare editable review conclusions against the current plan content. */
export async function checkPlanReview({ planPath, reportPath }) {
  const reportBytes = await readEvidenceFile(reportPath, 2 * 1024 * 1024), report = reportBytes.toString('utf8');
  if (!Buffer.from(report, 'utf8').equals(reportBytes)) throw new Error('Review is not valid UTF-8');
  const reviewDigest = createHash('sha256').update(reportBytes).digest('hex');
  const match = /^# Plan review record\n\nSupplied review conclusions follow\. This editable record does not verify the plan, requirements or review\. Execution statuses and provenance verification are excluded from the plan digest\.\n\n(`{3,})json\n([\s\S]*?)\n\1\n$/.exec(report);
  if (!match) throw new Error('Unsupported plan review format');
  const saved = JSON.parse(match[2]), review = validateReview(saved);
  if (typeof saved.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(saved.planDigest)) throw new Error('Invalid plan review digest');
  if (saved.contextDigest !== undefined && saved.contextDigest !== null && (typeof saved.contextDigest !== 'string' || !/^[a-f0-9]{64}$/.test(saved.contextDigest))) throw new Error('Invalid requirements context digest');
  const legacyIdentity = saved.identityStatus === undefined && saved.identityDigest === undefined;
  if (!legacyIdentity && (!['present', 'missing', 'unavailable'].includes(saved.identityStatus) || (saved.identityStatus === 'present' ? typeof saved.identityDigest !== 'string' || !/^[a-f0-9]{64}$/.test(saved.identityDigest) : saved.identityDigest !== null))) throw new Error('Invalid source identity record');
  const currentDigest = await readPlanReviewDigest(planPath), context = await readRequirementsContext(planPath), identity = await readTicketIdentitySnapshot(planPath);
  const contextMatches = saved.contextDigest == null || context.status === 'unavailable' ? null : context.status === 'missing' ? false : saved.contextDigest === context.digest;
  const identityMatches = legacyIdentity || saved.identityStatus === 'unavailable' || identity.status === 'unavailable' ? null : saved.identityStatus !== identity.status ? false : identity.status === 'missing' ? true : saved.identityDigest === identity.digest;
  return { verdict: review.verdict, planContentDigest: currentDigest, reviewDigest, planMatches: saved.planDigest === currentDigest, contextMatches, contextStatus: context.status, identityMatches, identityStatus: identity.status, findings: review.findings.length, unresolved: review.unresolved.length, scope: 'Editable supplied review record only; matching local files do not establish source authenticity, that the review occurred or that requirements are satisfied. Files may change afterward.' };
}
