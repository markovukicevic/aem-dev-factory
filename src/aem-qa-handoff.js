import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';

function text(value, limit) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new TypeError('Invalid handoff text');
  return value;
}

/** Validate the restricted, explicitly supplied handoff fields. */
export function parseAemQaEvidence(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.checks) || !input.checks.length || input.checks.length > 100 || !Array.isArray(input.limitations) || input.limitations.length > 100) throw new TypeError('Invalid QA handoff');
  return {
    component: text(input.component, 512), environment: text(input.environment, 512),
    revision: input.revision === undefined || input.revision === null ? null : text(input.revision, 512),
    checks: input.checks.map(item => {
      if (!item || !['passed', 'failed', 'not-run'].includes(item.result)) throw new TypeError('Invalid QA check');
      return { name: text(item.name, 512), result: item.result, evidence: text(item.evidence, 8192) };
    }),
    limitations: input.limitations.map(item => text(item, 8192)),
  };
}

/** Save explicitly supplied QA observations without claiming they were verified. */
export async function saveAemQaHandoff({ inputPath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  const input = JSON.parse((await readLimitedFile(inputPath, 1024 * 1024)).toString('utf8'));
  const evidence = parseAemQaEvidence(input);
  const json = JSON.stringify(evidence, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# AEM QA handoff\n\nSupplied observations follow. This record does not perform QA, verify the claims or establish live AEM behavior. Review the environment, evidence and limitations before use.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('QA handoff exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, checks: evidence.checks.length, scope: 'Supplied observations only; no QA or live verification was performed.' };
}


/** Summarize declared results from an editable handoff without verifying them. */
export async function inspectAemQaHandoff(path) {
  const report = (await readLimitedFile(path, 2 * 1024 * 1024)).toString('utf8');
  const match = /^# AEM QA handoff\n\nSupplied observations follow\. This record does not perform QA, verify the claims or establish live AEM behavior\. Review the environment, evidence and limitations before use\.\n\n(`{3,})json\n([\s\S]*?)\n\1\n$/.exec(report);
  if (!match) throw new Error('Invalid AEM QA handoff format');
  const evidence = parseAemQaEvidence(JSON.parse(match[2]));
  const counts = { passed: 0, failed: 0, 'not-run': 0 };
  for (const check of evidence.checks) counts[check.result]++;
  return { component: evidence.component, environment: evidence.environment, revision: evidence.revision, counts, limitations: evidence.limitations.length, scope: 'Declared results in an editable handoff only; checks, evidence and live AEM behavior are not verified.' };
}
