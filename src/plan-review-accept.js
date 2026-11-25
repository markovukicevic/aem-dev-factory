import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { checkPlanReview } from './plan-review.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function regular(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Review file is not regular');
  return readLimitedFile(path, 2 * 1024 * 1024);
}

/** Replace an old plan review with an explicitly reviewed current record, preserving the old one. */
export async function processPlanReviewAccept({ path, stagedPath, expectedDigest }) {
  if (expectedDigest !== undefined && !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid preview digest');
  const dir = await lstat(path);
  if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Invalid spec directory');
  const root = await realpath(path), reportPath = join(root, 'validation-report.md'), planPath = join(root, 'implement.md');
  if (await realpath(stagedPath) === await realpath(reportPath)) throw new Error('Staged review must be separate');
  const [oldBytes, stagedBytes] = await Promise.all([regular(reportPath), regular(stagedPath)]);
  const review = await checkPlanReview({ planPath, reportPath: stagedPath });
  if (!review.planMatches || review.contextMatches !== true || review.identityMatches !== true || review.reviewDigest !== hash(stagedBytes)) throw new Error('Staged review is not bound to current context');
  const oldDigest = hash(oldBytes), stagedDigest = hash(stagedBytes);
  const digest = hash(JSON.stringify({ root, stagedPath: await realpath(stagedPath), oldDigest, stagedDigest, planContentDigest: review.planContentDigest }));
  const result = { accepted: false, changed: oldDigest !== stagedDigest, oldDigest, stagedDigest, verdict: review.verdict, digest, scope: 'Editable supplied review and current local context only. Matching records do not prove review or implementation correctness; no checks or remote writes occur.' };
  if (expectedDigest === undefined) return result;
  if (digest !== expectedDigest || !result.changed) return { ...result, reason: digest !== expectedDigest ? 'preview-changed' : 'no-change' };
  const lock = join(root, '.review-accept.lock'), history = join(root, 'review-history');
  await mkdir(lock);
  let temporary;
  try {
    try { await mkdir(history, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const info = await lstat(history);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid review history directory');
    const backupPath = join(history, `${oldDigest}.md`);
    try { await writeFile(backupPath, oldBytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error?.code !== 'EEXIST' || hash(await regular(backupPath)) !== oldDigest) throw error; }
    temporary = join(root, `.validation-report-${randomBytes(12).toString('hex')}.tmp`);
    await writeFile(temporary, stagedBytes, { flag: 'wx', mode: 0o600 });
    const again = await checkPlanReview({ planPath, reportPath: stagedPath });
    if (hash(await regular(reportPath)) !== oldDigest || hash(await regular(stagedPath)) !== stagedDigest || again.reviewDigest !== stagedDigest || again.planContentDigest !== review.planContentDigest || !again.planMatches || again.contextMatches !== true || again.identityMatches !== true) return { ...result, reason: 'review-or-context-changed', backupPath };
    await rename(temporary, reportPath); temporary = undefined;
    return { ...result, accepted: true, backupPath };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await rmdir(lock);
  }
}
