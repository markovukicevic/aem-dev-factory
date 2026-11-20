import { loadReadinessConfig } from './config.js';
import { resolveBaseBranch } from './base-branch.js';
import { inspectPlanWithTests } from './inspect-readiness.js';

/** Run an explicitly requested readiness check using the project's configuration. */
export async function inspectConfiguredReadiness({ cwd, configPath, planPath }, dependencies = {}) {
  const config = await (dependencies.loadConfig ?? loadReadinessConfig)(configPath);
  const base = await (dependencies.resolveBase ?? resolveBaseBranch)({ cwd, configuredBase: config.scm.baseBranch });
  return (dependencies.inspect ?? inspectPlanWithTests)({ cwd, planPath, base, testCommand: config.test });
}
