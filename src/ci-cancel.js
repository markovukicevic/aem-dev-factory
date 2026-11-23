import { createHash } from 'node:crypto';
import { createGitHubClient, githubRepositoryPath } from './github.js';
import { createGitLabClient } from './gitlab.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, id, client }) {
  if (!Number.isSafeInteger(id) || id < 1 || !['github-actions', 'gitlab-ci'].includes(config?.provider)) throw new TypeError('Invalid cancel request');
  const github = config.provider === 'github-actions', run = await (github ? client.getWorkflowRun(id) : client.getPipeline(id));
  const commit = github ? run?.head_sha : run?.sha;
  const statuses = github ? ['queued', 'in_progress', 'waiting', 'requested', 'pending'] : ['created', 'waiting_for_resource', 'preparing', 'pending', 'running', 'scheduled', 'manual'];
  if (run?.id !== id || !/^[a-f0-9]{40,64}$/i.test(commit ?? '') || !statuses.includes(run.status) || (github && (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1))) throw new Error('Run unavailable or not in supported active state');
  const identity = github ? githubRepositoryPath(config.owner, config.repository).toLowerCase() : config.project;
  const preview = { provider: config.provider, identity, id, commit, status: run.status, ...(github ? { attempt: run.run_attempt } : {}) };
  return { preview, digest: digest(JSON.stringify(preview)) };
}
export async function processCiCancel({ config, id, token, expectedDigest }, { makeGitHub = createGitHubClient, makeGitLab = createGitLabClient } = {}) {
  if (!['github-actions', 'gitlab-ci'].includes(config?.provider) || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid cancel request');
  const github = config.provider === 'github-actions', client = github ? makeGitHub({ owner: config.owner, repository: config.repository, token }) : makeGitLab({ project: config.project, token });
  const input = { config, id, client }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only preview. Cancellation can interrupt deployments and does not undo prior side effects.' };
  if (first.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const result = github ? await client.cancelWorkflowRun(id) : await client.cancelPipeline(id);
  return { ...result, scope: 'One cancellation request was acknowledged, not verified complete. Inspect the provider before retrying an unclear result.' };
}
