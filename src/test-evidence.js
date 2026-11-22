import { lstat, writeFile } from 'node:fs/promises';
import { inspectConfiguredReadiness, readReadinessConfigDigest } from './configured-readiness.js';
import { readLimitedFile } from './read-limited.js';
import { readPlanStatus } from './plan-status.js';
import { readGitState } from './git-state.js';

/** Run configured tests and save their bounded evidence, without marking a plan verified. */
export async function saveTestEvidence({ cwd, configPath, planPath, outputPath }, { inspect = inspectConfiguredReadiness } = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output file already exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const result = await inspect({ cwd, configPath, planPath });
  if (!result?.readiness?.checks || !result.readiness.branch || !result.testResult || !Array.isArray(result.blockers)) throw new Error('Invalid test evidence');
  const passed = result.testResult.passed === true && result.readiness.checks.testsPassed === true && result.readiness.checks.workingTreeClean === true;
  const evidence = {
    testPassed: passed,
    testProcessPassed: result.testResult.passed === true,
    exitCode: Number.isInteger(result.testResult.exitCode) ? result.testResult.exitCode : null,
    branch: result.readiness.branch.head ?? null,
    commit: result.readiness.branch.commit ?? null,
    planDigest: result.readiness.planDigest ?? null,
    configDigest: result.readiness.configDigest ?? null,
    readinessBlockers: result.blockers,
    scope: 'Configured test command and local consistency only; other checks, human review and final verification are not established.',
  };
  const json = JSON.stringify(evidence, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Automated test evidence\n\nThis record does not verify the full implementation or replace a human review. Test output is not retained.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 262144) throw new Error('Evidence exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, testPassed: passed, scope: evidence.scope };
}

/** Compare an editable evidence record with current local inputs without running tests. */
export async function checkTestEvidence({ cwd, configPath, planPath, evidencePath }) {
  const report = (await readLimitedFile(evidencePath, 262144)).toString('utf8');
  const match = /^# Automated test evidence\n\nThis record does not verify the full implementation or replace a human review\. Test output is not retained\.\n\n(`{3,})json\n([\s\S]*?)\n\1\n$/.exec(report);
  if (!match) throw new Error('Invalid test evidence format');
  const evidence = JSON.parse(match[2]);
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
      typeof evidence.testPassed !== 'boolean' || typeof evidence.testProcessPassed !== 'boolean' ||
      !(Number.isInteger(evidence.exitCode) || evidence.exitCode === null) ||
      typeof evidence.branch !== 'string' || !evidence.branch ||
      typeof evidence.commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(evidence.commit) ||
      typeof evidence.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.planDigest) ||
      typeof evidence.configDigest !== 'string' || !/^[a-f0-9]{64}$/.test(evidence.configDigest) ||
      !Array.isArray(evidence.readinessBlockers) || !evidence.readinessBlockers.every(item => typeof item === 'string')) {
    throw new Error('Invalid test evidence fields');
  }
  const [plan, configDigest, git] = await Promise.all([
    readPlanStatus(planPath), readReadinessConfigDigest(configPath), readGitState(cwd),
  ]);
  const checks = {
    recordedPass: evidence.testPassed && evidence.testProcessPassed && evidence.exitCode === 0,
    planMatches: evidence.planDigest === plan.digest,
    configMatches: evidence.configDigest === configDigest,
    branchMatches: evidence.branch === git.head,
    commitMatches: evidence.commit === git.commit,
    workingTreeClean: git.workingTreeClean,
  };
  return {
    consistent: Object.values(checks).every(Boolean), checks,
    scope: 'Local comparison only. This editable record can be forged; it does not prove tests ran or establish review or overall readiness.',
  };
}
