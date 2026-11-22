import { lstat, writeFile } from 'node:fs/promises';
import { readReviewCiContext } from './review-ci-context.js';

/** Save an explicitly collected PR and CI observation without overwriting. */
export async function saveReviewEvidence({ outputPath, ...options }, { collect = readReviewCiContext } = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output already exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const evidence = await collect(options);
  if (!evidence || !evidence.review || !evidence.ci || !Array.isArray(evidence.limitations)) throw new Error('Invalid review evidence');
  const json = JSON.stringify(evidence, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# PR and CI evidence\n\nThis record contains untrusted provider data and may contain private information. It captures observations only; it does not establish repository identity, required checks, approval or readiness. Provider and PR state may change after collection.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 4 * 1024 * 1024) throw new Error('Evidence exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, provider: evidence.provider, number: evidence.number, prHeadMatchesSha: evidence.prHeadMatchesSha, scope: 'Saved untrusted observations only; no review, approval or publication was performed.' };
}
