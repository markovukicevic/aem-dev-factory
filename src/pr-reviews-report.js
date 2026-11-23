import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { renderReviewReport } from './pr-review-report.js';

/** Assemble supplied reviews into one local report without claiming a review occurred. */
export async function saveReviewReports({ inputPath, outputPath }) {
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(inputPath, 2 * 1024 * 1024)));
  if (!input || !Array.isArray(input.reviews) || input.reviews.length < 1 || input.reviews.length > 20) throw new TypeError('Expected 1-20 supplied reviews');
  const seen = new Set(), sections = [];
  let findingCount = 0;
  for (const item of input.reviews) {
    const rendered = renderReviewReport(item);
    const key = JSON.stringify([item.repository, item.pullRequest]);
    if (seen.has(key)) throw new Error('Duplicate pull request report');
    seen.add(key); findingCount += rendered.findingCount;
    sections.push(rendered.report.replace(/^(#{1,4}) /gm, '#$1 ').trimEnd());
  }
  const report = `# Pull request reviews\n\nThis bundle contains supplied findings and checks; it does not independently verify reviews, current PR revisions or outcomes.\n\n${sections.join('\n\n')}\n`;
  if (Buffer.byteLength(report, 'utf8') > 4 * 1024 * 1024) throw new Error('Review bundle exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, reviews: sections.length, findingCount, scope: 'Supplied reports only; no review, remote lookup or publication was performed.' };
}
