import { createHash } from 'node:crypto';
import { createGitHubClient, githubRepositoryPath } from './github.js';
import { createGitLabClient } from './gitlab.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, number, state, client }) {
  if (!['github', 'gitlab'].includes(config?.provider) || !Number.isSafeInteger(number) || number < 1 || !['open', 'closed'].includes(state)) throw new TypeError('Invalid issue state request');
  const github = config.provider === 'github';
  const issue = github ? await client.getIssue(number) : await client.getIssueMetadata(number);
  const current = github ? issue?.state : issue?.state === 'opened' ? 'open' : issue?.state;
  if ((github ? issue?.number : issue?.iid) !== number || !Number.isSafeInteger(issue?.id) || issue.id < 1 || (github && issue.pull_request) || !['open', 'closed'].includes(current) || typeof issue.updated_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(issue.updated_at)) throw new Error('Issue unavailable or mismatched');
  const identity = github ? githubRepositoryPath(config.owner, config.repository).toLowerCase() : config.project;
  const request = { provider: config.provider, identity, number, from: current, to: state };
  const target = { id: issue.id, updatedAt: issue.updated_at };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
export async function processIssueState({ config, number, state, token, expectedDigest }, { makeGitHub = createGitHubClient, makeGitLab = createGitLabClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  if (!['github', 'gitlab'].includes(config?.provider)) throw new TypeError('Unsupported tracker');
  const github = config.provider === 'github';
  const client = github ? makeGitHub({ owner: config.owner, repository: config.repository, token }) : makeGitLab({ project: config.project, token });
  const input = { config, number, state, client }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview. No state was changed.' };
  if (first.digest !== expectedDigest) return { updated: false, reason: 'preview-changed' };
  if (first.request.from === state) return { updated: false, reason: 'already-in-state' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { updated: false, reason: 'preview-changed' };
  const result = await client.updateIssueState({ number, state: github ? state : state === 'open' ? 'opened' : 'closed' });
  return { ...result, scope: 'Provider acknowledged the state update; concurrent changes after the check remain possible.' };
}
