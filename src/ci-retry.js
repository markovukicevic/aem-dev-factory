import { createHash } from 'node:crypto';
import { createGitHubClient, githubRepositoryPath } from './github.js';
import { createGitLabClient } from './gitlab.js';
import { readGitHubRunJobs } from './github-ci-jobs.js';
import { readGitLabPipelineJobs } from './gitlab-ci-jobs.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, id, client }) {
  if (!Number.isSafeInteger(id) || id < 1 || !['github-actions', 'gitlab-ci'].includes(config?.provider)) throw new TypeError('Invalid CI retry request');
  const github = config.provider === 'github-actions';
  const result = github ? await readGitHubRunJobs({ ci: { ...client, provider: config.provider }, runId: id }) : await readGitLabPipelineJobs({ ci: { ...client, provider: config.provider }, pipelineId: id });
  if (!result.complete || (github ? result.runStatusChanged : result.pipelineStatusChanged)) throw new Error('CI job state is incomplete or changed');
  if (github ? result.status !== 'completed' || !['failure', 'cancelled', 'timed_out', 'action_required'].includes(result.conclusion) : !['failed', 'canceled'].includes(result.status)) throw new Error('Run is not in a supported failed state');
  const failed = result.jobs.filter(job => github ? ['failure', 'cancelled', 'timed_out', 'action_required'].includes(job.conclusion) : ['failed', 'canceled'].includes(job.status)).map(job => ({ id: job.id, name: job.name, status: github ? job.conclusion : job.status }));
  if (!failed.length) throw new Error('No retryable jobs observed');
  const identity = github ? githubRepositoryPath(config.owner, config.repository).toLowerCase() : config.project;
  const preview = { provider: config.provider, identity, id, commit: github ? result.head : result.sha, status: result.status, ...(github ? { attempt: result.attempt, conclusion: result.conclusion } : {}), failed };
  return { preview, digest: digest(JSON.stringify(preview)) };
}
/** Preview or explicitly request one provider retry without automatic retries. */
export async function processCiRetry({ config, id, token, expectedDigest }, { makeGitHub = createGitHubClient, makeGitLab = createGitLabClient } = {}) {
  if (!['github-actions', 'gitlab-ci'].includes(config?.provider) || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid CI retry request');
  const github = config.provider === 'github-actions', client = github ? makeGitHub({ owner: config.owner, repository: config.repository, token }) : makeGitLab({ project: config.project, token });
  const input = { config, id, client }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only preview. Retry may run dependent jobs and deployment-capable steps; inspect pipeline configuration.' };
  if (first.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const result = github ? await client.retryFailedWorkflowJobs(id) : await client.retryPipeline(id);
  return { ...result, scope: 'One retry request was acknowledged, not completed; inspect the provider before retrying an unclear result.' };
}
