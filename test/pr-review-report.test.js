import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReviewReport, saveReviewReport } from '../src/pr-review-report.js';
const input = { repository: 'team/site', pullRequest: 7, head: 'a'.repeat(40), findings: [{ priority: 'P1', category: 'bug', file: 'src/app.js', line: 12, title: 'Missing check', body: 'If the request fails, data is lost.' }], checks: [{ name: 'unit tests', result: 'passed' }], limitations: ['Integration tests were not run.'] };

test('formats supplied findings and checks without claiming independent verification', () => {
  const result = renderReviewReport(input);
  assert.equal(result.findingCount, 1);
  assert.match(result.report, /\[P1\] Missing check/);
  assert.match(result.report, /src\/app\\\.js:12/);
  assert.match(result.report, /does not independently verify/);
  const empty = renderReviewReport({ ...input, findings: [], checks: [], limitations: [] });
  assert.match(empty.report, /No findings were supplied/);
  assert.throws(() => renderReviewReport({ ...input, findings: [{ ...input.findings[0], file: '../outside' }] }), /repository-relative/);
});
