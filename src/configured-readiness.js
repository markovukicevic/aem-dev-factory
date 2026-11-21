import { createHash } from 'node:crypto';
import { loadReadinessConfig } from './config.js';
import { resolveBaseBranch } from './base-branch.js';
import { inspectPlanWithTests } from './inspect-readiness.js';

/** Hash only the normalized settings that control readiness. */
export function readinessConfigDigest(config) {
  return createHash('sha256').update(JSON.stringify(config), 'utf8').digest('hex');
}

export async function readReadinessConfigDigest(path) {
  return readinessConfigDigest(await loadReadinessConfig(path));
}

/** Run tests with explicit settings and reject changed settings around the run. */
export async function inspectConfiguredReadiness({ cwd, configPath, planPath }, dependencies = {}) {
  const load = dependencies.loadConfig ?? loadReadinessConfig;
  const config = await load(configPath);
  const digest = readinessConfigDigest(config);
  const base = await (dependencies.resolveBase ?? resolveBaseBranch)({ cwd, configuredBase: config.scm.baseBranch });
  const result = await (dependencies.inspect ?? inspectPlanWithTests)({ cwd, planPath, base, testCommand: config.test });
  const refreshed = await load(configPath);
  result.readiness.configDigest = digest;
  if (digest !== readinessConfigDigest(refreshed)) {
    result.readiness.checks.testsPassed = false;
    result.blockers.push('The readiness configuration changed around the test run.');
    result.ready = false;
  }
  return result;
}
