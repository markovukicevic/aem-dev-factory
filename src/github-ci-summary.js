/** Summarize only the check runs and classic statuses returned by GitHub. */
export function summarizeGitHubCi(checks, statuses) {
  if (!checks || !Number.isSafeInteger(checks.total_count) || checks.total_count < 0 || !Array.isArray(checks.check_runs) || checks.check_runs.length > checks.total_count || !statuses || !Number.isSafeInteger(statuses.total_count) || statuses.total_count < 0) throw new Error('Invalid GitHub CI response');
  const observations = [];
  if (statuses.total_count > 0) {
    const state = statuses.state;
    observations.push(state === 'success' ? 'success' : ['failure', 'error'].includes(state) ? 'failure' : state === 'pending' ? 'pending' : 'unknown');
  }
  for (const run of checks.check_runs) {
    if (!run || typeof run.status !== 'string') { observations.push('unknown'); continue; }
    if (run.status !== 'completed') { observations.push('pending'); continue; }
    observations.push(run.conclusion === 'success' ? 'success' : ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(run.conclusion) ? 'failure' : 'unknown');
  }
  const complete = checks.check_runs.length === checks.total_count;
  if (!complete) observations.push('unknown');
  const state = observations.includes('failure') ? 'failure' : observations.includes('pending') ? 'pending' : observations.length && observations.every(item => item === 'success') ? 'success' : 'unknown';
  return { state, complete, checkRunsReturned: checks.check_runs.length, checkRunsTotal: checks.total_count, classicStatusesTotal: statuses.total_count, scope: 'Observed results only; required branch protection checks are not evaluated.' };
}

export async function readGitHubCiSummary(ci, sha) {
  const [checks, statuses] = await Promise.all([ci.listCheckRuns(sha, { page: 1, perPage: 100 }), ci.getCommitStatus(sha)]);
  return summarizeGitHubCi(checks, statuses);
}
