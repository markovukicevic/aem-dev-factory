import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { checkTestEvidence } from './test-evidence.js';
import { loadReadinessConfig } from './config.js';
import { readinessConfigDigest } from './configured-readiness.js';
import { resolveBaseBranch } from './base-branch.js';
import { inspectPlanReadiness } from './inspect-readiness.js';

const digestFile = async path => createHash('sha256').update(await readLimitedFile(path, 262144)).digest('hex');

/** Compare a user-selected editable test record without executing the test command. */
export async function inspectSavedTestReadiness({ cwd, configPath, planPath, evidencePath }) {
  const digest = await digestFile(evidencePath);
  const first = await checkTestEvidence({ cwd, configPath, planPath, evidencePath });
  const config = await loadReadinessConfig(configPath), configDigest = readinessConfigDigest(config);
  const base = await resolveBaseBranch({ cwd, configuredBase: config.scm.baseBranch });
  const result = await inspectPlanReadiness({ cwd, planPath, testsPassed: first.consistent, base });
  const last = await checkTestEvidence({ cwd, configPath, planPath, evidencePath });
  const stable = first.consistent && last.consistent && digest === await digestFile(evidencePath) && configDigest === readinessConfigDigest(await loadReadinessConfig(configPath));
  result.readiness.configDigest = configDigest;
  if (!stable) {
    result.readiness.checks.testsPassed = false;
    result.ready = false;
    result.blockers.push('Saved test evidence is stale, failed or changed during inspection.');
  }
  result.evidenceDigest = digest;
  result.warnings.push('Tests were not run in this invocation; the selected local record is editable and can be forged.');
  return result;
}

/** Recheck that the same selected record still matches the local plan and Git state. */
export async function recheckSavedTestEvidence({ cwd, configPath, planPath, evidencePath, expectedDigest }) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) throw new TypeError('Evidence digest required');
  const before = await digestFile(evidencePath);
  const check = await checkTestEvidence({ cwd, configPath, planPath, evidencePath });
  const after = await digestFile(evidencePath);
  return before === expectedDigest && after === expectedDigest && check.consistent;
}
