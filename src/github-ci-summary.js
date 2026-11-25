/** Summarize only the check runs and classic statuses returned by GitHub. */
export function summarizeGitHubCi(checks, statuses) {
  if (!checks || !Number.isSafeInteger(checks.total_count) || checks.total_count < 0 || !Array.isArray(checks.check_runs) || checks.check_runs.length > checks.total_count || !statuses || !Number.isSafeInteger(statuses.total_count) || statuses.total_count < 0) throw new Error('Invalid GitHub CI response');
  const observations = [];
  const checkResults = [];
  if (statuses.total_count > 0) {
    const state = statuses.state;
    observations.push(state === 'success' ? 'success' : ['failure', 'error'].includes(state) ? 'failure' : state === 'pending' ? 'pending' : 'unknown');
  }
  for (const run of checks.check_runs) {
    let state;
    if (!run || typeof run.status !== 'string') state = 'unknown';
    else if (run.status !== 'completed') state = 'pending';
    else state = run.conclusion === 'success' ? 'success' : ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(run.conclusion) ? 'failure' : 'unknown';
    observations.push(state);
    checkResults.push({ name: typeof run?.name === 'string' ? run.name : null, status: typeof run?.status === 'string' ? run.status : null, conclusion: typeof run?.conclusion === 'string' ? run.conclusion : null, state });
  }
  const classic = Array.isArray(statuses.statuses) ? statuses.statuses : [];
  if (classic.length > statuses.total_count || classic.length > 1000) throw new Error('Invalid GitHub classic statuses');
  const classicResults = classic.map(item => ({
    name: typeof item?.context === 'string' && item.context.trim() && item.context === item.context.trim() && item.context.length <= 512 && !/[\u0000-\u001f\u007f]/.test(item.context) ? item.context : null,
    state: item?.state === 'success' ? 'success' : ['failure', 'error'].includes(item?.state) ? 'failure' : item?.state === 'pending' ? 'pending' : 'unknown',
  }));
  const classicComplete = classic.length === statuses.total_count && classicResults.every(item => item.name !== null);
  const complete = checks.check_runs.length === checks.total_count;
  if (!complete) observations.push('unknown');
  const state = observations.includes('failure') ? 'failure' : observations.includes('pending') ? 'pending' : observations.length && observations.every(item => item === 'success') ? 'success' : 'unknown';
  return { state, complete, checkRunsReturned: checks.check_runs.length, checkRunsTotal: checks.total_count, classicStatusesTotal: statuses.total_count, classicStatus: statuses.total_count > 0 ? statuses.state ?? null : null, classicComplete, classicResults, checkResults, scope: 'Observed results only; required branch protection checks are not evaluated.' };
}

export async function readGitHubCiSummary(ci, sha) {
  const [first, statusPage] = await Promise.all([ci.listCheckRuns(sha, { page: 1, perPage: 100 }), ci.getCommitStatus(sha, { page: 1, perPage: 100 })]);
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
  if (!statusPage || !Number.isSafeInteger(statusPage.total_count) || statusPage.total_count < 0 || (statusPage.statuses !== undefined && (!Array.isArray(statusPage.statuses) || statusPage.statuses.length > 100 || statusPage.statuses.length > statusPage.total_count))) throw new Error('Invalid GitHub combined status response');
  if (statusPage.sha !== undefined && (typeof statusPage.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(statusPage.sha) || !statusPage.sha.toLowerCase().startsWith(sha.toLowerCase()))) throw new Error('GitHub status commit does not match');
  const statuses = { ...statusPage, ...(Array.isArray(statusPage.statuses) ? { statuses: [...statusPage.statuses] } : {}) };
  if (Array.isArray(statuses.statuses) && statuses.statuses.length < statuses.total_count && statuses.statuses.length === 100) {
    const seenContexts = new Set();
    const addContexts = items => {
      for (const item of items) {
        if (typeof item?.context !== 'string' || !item.context || seenContexts.has(item.context)) throw new Error('Invalid or repeated GitHub status context');
        seenContexts.add(item.context);
      }
    };
    addContexts(statuses.statuses);
    for (let page = 2; page <= 10 && statuses.statuses.length < statuses.total_count; page++) {
      const next = await ci.getCommitStatus(sha, { page, perPage: 100 });
      if (!next || next.total_count !== statuses.total_count || next.state !== statuses.state || (statusPage.sha !== undefined && next.sha !== statusPage.sha) || !Array.isArray(next.statuses) || !next.statuses.length || next.statuses.length > 100 || statuses.statuses.length + next.statuses.length > statuses.total_count) throw new Error('Inconsistent GitHub status pages');
      addContexts(next.statuses);
      statuses.statuses.push(...next.statuses);
      if (statuses.statuses.length < statuses.total_count && next.statuses.length !== 100) throw new Error('Incomplete GitHub status page');
    }
  }
  return summarizeGitHubCi(checks, statuses);
}
