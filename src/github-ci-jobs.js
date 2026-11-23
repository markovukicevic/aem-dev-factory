/** Inspect jobs from one GitHub Actions run without fetching logs. */
export async function readGitHubRunJobs({ ci, runId, maxPages = 10 }) {
  if (ci?.provider !== 'github-actions' || !Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10) throw new TypeError('Invalid workflow run request');
  const validRun = run => run?.id === runId && typeof run.head_sha === 'string' && /^[a-f0-9]{40,64}$/i.test(run.head_sha) && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0;
  const before = await ci.getWorkflowRun(runId);
  if (!validRun(before)) throw new Error('Invalid workflow run');
  const jobs = [], seen = new Set(); let total = null, complete = false;
  for (let page = 1; page <= maxPages; page++) {
    const response = await ci.listWorkflowRunJobs(runId, { page, perPage: 100 });
    if (!Number.isSafeInteger(response?.total_count) || response.total_count < 0 || !Array.isArray(response.jobs) || response.jobs.length > 100 || (total !== null && response.total_count !== total)) throw new Error('Inconsistent workflow job list');
    total = response.total_count;
    for (const job of response.jobs) {
      if (!Number.isSafeInteger(job?.id) || job.id < 1 || job.run_id !== runId || job.head_sha !== before.head_sha || seen.has(job.id) || typeof job.name !== 'string' || typeof job.status !== 'string' || !Array.isArray(job.steps) || job.steps.length > 1000) throw new Error('Invalid workflow job');
      seen.add(job.id);
      const steps = job.steps.map(step => {
        if (!Number.isSafeInteger(step?.number) || step.number < 1 || typeof step.name !== 'string' || typeof step.status !== 'string') throw new Error('Invalid workflow step');
        return { number: step.number, name: step.name, status: step.status, conclusion: typeof step.conclusion === 'string' ? step.conclusion : null };
      });
      jobs.push({ id: job.id, name: job.name, status: job.status, conclusion: typeof job.conclusion === 'string' ? job.conclusion : null, steps });
    }
    if (jobs.length > total) throw new Error('Inconsistent workflow job count');
    if (jobs.length === total) { complete = true; break; }
    if (response.jobs.length < 100) throw new Error('Incomplete workflow job page');
  }
  const after = await ci.getWorkflowRun(runId);
  if (!validRun(after) || after.head_sha !== before.head_sha || after.run_attempt !== before.run_attempt) throw new Error('Workflow run changed during inspection');
  return { provider: ci.provider, runId, attempt: before.run_attempt, head: before.head_sha, status: after.status ?? null, conclusion: after.conclusion ?? null, runStatusChanged: before.status !== after.status || before.conclusion !== after.conclusion || before.updated_at !== after.updated_at, jobs, total, complete, scope: 'Job and step metadata only; logs, root cause, branch policy and future changes are not established.' };
}
