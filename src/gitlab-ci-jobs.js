/** Inspect one GitLab pipeline's job metadata without fetching logs. */
export async function readGitLabPipelineJobs({ ci, pipelineId, maxPages = 10 }) {
  if (ci?.provider !== 'gitlab-ci' || !Number.isSafeInteger(pipelineId) || pipelineId < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10) throw new TypeError('Invalid pipeline request');
  const valid = value => value?.id === pipelineId && typeof value.sha === 'string' && /^[a-f0-9]{40,64}$/i.test(value.sha);
  const before = await ci.getPipeline(pipelineId); if (!valid(before)) throw new Error('Invalid pipeline');
  let page = 1, complete = false; const seen = new Set(), jobs = [];
  for (let count = 0; count < maxPages; count++) {
    const response = await ci.listPipelineJobs(pipelineId, { page });
    if (!Array.isArray(response?.values) || response.values.length > 100) throw new Error('Invalid pipeline jobs');
    for (const job of response.values) {
      if (!Number.isSafeInteger(job?.id) || job.id < 1 || seen.has(job.id) || job.pipeline?.id !== pipelineId || job.commit?.id !== before.sha || typeof job.name !== 'string' || typeof job.status !== 'string') throw new Error('Invalid pipeline job');
      seen.add(job.id); jobs.push({ id: job.id, name: job.name, stage: typeof job.stage === 'string' ? job.stage : null, status: job.status, failureReason: typeof job.failure_reason === 'string' ? job.failure_reason : null, allowFailure: typeof job.allow_failure === 'boolean' ? job.allow_failure : null });
    }
    if (response.nextPage !== null) {
      if (typeof response.nextPage !== 'string' || !/^[1-9][0-9]*$/.test(response.nextPage) || !Number.isSafeInteger(Number(response.nextPage)) || Number(response.nextPage) <= page) throw new Error('Invalid pipeline jobs continuation');
      page = Number(response.nextPage);
    } else if (response.values.length === 100) page++;
    else { complete = true; break; }
  }
  const after = await ci.getPipeline(pipelineId);
  if (!valid(after) || after.sha !== before.sha) throw new Error('Pipeline changed during inspection');
  return { provider: ci.provider, pipelineId, sha: before.sha, status: after.status ?? null, pipelineStatusChanged: before.status !== after.status || before.updated_at !== after.updated_at, jobs, complete, scope: 'Current pipeline job metadata only. Retried and downstream pipeline jobs, logs, root cause and required policy are not established.' };
}
