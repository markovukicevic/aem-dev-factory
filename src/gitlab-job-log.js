import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
/** Save a specific job trace after checking its pipeline and commit, without overwriting. */
export async function saveGitLabJobLog({ ci, pipelineId, jobId, outputPath }) {
  if (ci?.provider !== 'gitlab-ci' || ![pipelineId, jobId].every(value => Number.isSafeInteger(value) && value > 0) || typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Invalid job log request');
  const pipeline = await ci.getPipeline(pipelineId), job = await ci.getJob(jobId);
  if (pipeline?.id !== pipelineId || typeof pipeline.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(pipeline.sha) || job?.id !== jobId || job.pipeline?.id !== pipelineId || job.commit?.id !== pipeline.sha) throw new Error('Job and pipeline do not match');
  const data = await ci.getJobTrace(jobId);
  if (!Buffer.isBuffer(data) || data.length > 5 * 1024 * 1024) throw new Error('Invalid job trace');
  const after = await ci.getJob(jobId);
  if (after?.id !== jobId || after.pipeline?.id !== pipelineId || after.commit?.id !== pipeline.sha) throw new Error('Job changed during trace collection');
  await writeFile(outputPath, data, { flag: 'wx', mode: 0o600 });
  return { path: outputPath, pipelineId, jobId, sha: pipeline.sha, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), status: typeof after.status === 'string' ? after.status : null, statusChanged: job.status !== after.status, scope: 'One downloaded trace; logs may contain sensitive or untrusted text, may be incomplete while the job runs, and do not establish root cause.' };
}
