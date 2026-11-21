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
  const [first, statuses] = await Promise.all([ci.listCheckRuns(sha, { page: 1, perPage: 100 }), ci.getCommitStatus(sha)]);
  if (!first || !Number.isSafeInteger(first.total_count) || first.total_count < 0 || !Array.isArray(first.check_runs) || first.check_runs.length > 100 || first.check_runs.length > first.total_count) throw new Error('Invalid GitHub check runs response');
  const checks = { total_count: first.total_count, check_runs: [...first.check_runs] };
  const seen = new Set();
  function addIds(runs) {
    for (const run of runs) {
      if (!Number.isSafeInteger(run?.id) || run.id < 1 || seen.has(run.id)) throw new Error('Invalid or repeated GitHub check run');
      seen.add(run.id);
    }
  }
  // IDs let us fail closed if pagination shifts while results are being read.
  if (checks.total_count > checks.check_runs.length) {
    addIds(checks.check_runs);
    if (checks.check_runs.length !== 100) throw new Error('Incomplete GitHub check runs page');
    for (let page = 2; page <= 10 && checks.check_runs.length < checks.total_count; page++) {
      const next = await ci.listCheckRuns(sha, { page, perPage: 100 });
      if (!next || next.total_count !== checks.total_count || !Array.isArray(next.check_runs) || next.check_runs.length === 0 || next.check_runs.length > 100 || checks.check_runs.length + next.check_runs.length > checks.total_count) throw new Error('Inconsistent GitHub check runs pages');
      addIds(next.check_runs);
      checks.check_runs.push(...next.check_runs);
      if (checks.check_runs.length < checks.total_count && next.check_runs.length !== 100) throw new Error('Incomplete GitHub check runs page');
    }
  }
  return summarizeGitHubCi(checks, statuses);
}
