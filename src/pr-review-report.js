import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';

const categories = ['bug', 'security', 'accessibility', 'performance', 'regression', 'test', 'other'];
const priorities = ['P0', 'P1', 'P2', 'P3'];
function plain(value, max, multiline = false) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/ : /[\u0000-\u001f]/).test(value)) throw new TypeError('Invalid report text');
  return value;
}
const escape = value => value.replace(/([\\`*_{}\[\]()#+.!|<>-])/g, '\\$1');

/** Render supplied review evidence; this function does not perform a review. */
export function renderReviewReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid review report');
  const repository = plain(input.repository, 512);
  if (!Number.isSafeInteger(input.pullRequest) || input.pullRequest < 1 || typeof input.head !== 'string' || !/^[a-f0-9]{40,64}$/i.test(input.head)) throw new TypeError('PR number and full head commit are required');
  if (!Array.isArray(input.findings) || input.findings.length > 1000 || !Array.isArray(input.checks) || input.checks.length > 500 || !Array.isArray(input.limitations) || input.limitations.length > 500) throw new TypeError('Invalid review evidence collections');
  const findings = input.findings.map(item => {
    if (!item || !priorities.includes(item.priority) || !categories.includes(item.category) || !Number.isSafeInteger(item.line) || item.line < 1) throw new TypeError('Invalid review finding');
    const file = plain(item.file, 1024);
    if (file.startsWith('/') || file.startsWith('\\') || file.split(/[\\/]/).some(part => part === '..' || part === '')) throw new TypeError('Finding path must be repository-relative');
    return { priority: item.priority, category: item.category, file, line: item.line, title: plain(item.title, 300), body: plain(item.body, 16384, true) };
  });
  const checks = input.checks.map(item => {
    if (!item || !['passed', 'failed', 'not-run'].includes(item.result)) throw new TypeError('Invalid review check');
    return { name: plain(item.name, 500), result: item.result, details: item.details === undefined ? null : plain(item.details, 8192, true) };
  });
  const limitations = input.limitations.map(item => plain(item, 8192, true));
  const lines = ['# Pull request review report', '', 'This report presents supplied review evidence. It does not independently verify findings, file paths, test results or the current PR revision.', '', `- Repository: ${escape(repository)}`, `- Pull request: #${input.pullRequest}`, `- Reviewed head: ${input.head}`, '', '## Findings', ''];
  if (!findings.length) lines.push('No findings were supplied.', '');
  for (const category of categories) {
    const group = findings.filter(item => item.category === category);
    if (!group.length) continue;
    lines.push(`### ${category}`, '');
    for (const item of group) lines.push(`#### [${item.priority}] ${escape(item.title)}`, '', `Location: ${escape(item.file)}:${item.line}`, '', escape(item.body), '');
  }
  lines.push('## Checks', '');
  if (!checks.length) lines.push('No checks were supplied.', '');
  for (const item of checks) lines.push(`- ${escape(item.name)}: ${item.result}${item.details ? ` — ${escape(item.details)}` : ''}`);
  lines.push('', '## Limitations', '');
  if (!limitations.length) lines.push('No limitations were supplied.', '');
  else for (const item of limitations) lines.push(`- ${escape(item)}`);
  const report = `${lines.join('\n').trimEnd()}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Report exceeds size limit');
  return { report, findingCount: findings.length, checkCount: checks.length };
}

export async function saveReviewReport({ inputPath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  const input = JSON.parse((await readLimitedFile(inputPath, 2 * 1024 * 1024)).toString('utf8'));
  const { report, findingCount, checkCount } = renderReviewReport(input);
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, findingCount, checkCount, scope: 'Supplied review evidence only; no review or publication was performed.' };
}
