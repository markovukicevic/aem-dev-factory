/** Recheck evidence after remote duplicate lookup and immediately before a PR write. */
export async function checkBeforePullRequestWrite({ refresh, configDigest, publishedReader, cwd, planPath, configPath, head, base, commit, expectedPlan, expectedConfig }) {
  const result = await refresh({ cwd, planPath, testsPassed: true, base });
  if (!result.ready || result.readiness.branch.head !== head || result.readiness.branch.base !== base || result.readiness.branch.commit !== commit || result.readiness.planDigest !== expectedPlan) return { ready: false, blockers: [...result.blockers, 'Plan or Git state changed before PR creation.'], warnings: result.warnings };
  if (await configDigest(configPath) !== expectedConfig) return { ready: false, blockers: ['Readiness configuration changed before PR creation.'], warnings: result.warnings };
  const published = await publishedReader({ cwd, head });
  if (!published.published || published.commit !== commit) return { ready: false, blockers: ['Published branch changed before PR creation.'], warnings: result.warnings };
  return { ready: true, readiness: result.readiness, warnings: result.warnings };
}
