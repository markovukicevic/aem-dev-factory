import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createGitHubClient, githubRepositoryPath } from './github.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, number, event, bodyPath, client }) {
  if (config?.provider !== 'github' || !Number.isSafeInteger(number) || number < 1 || !['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) throw new TypeError('Invalid review request');
  const repositoryPath = githubRepositoryPath(config.owner, config.repository);
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid review body');
  const pr = await client.getPullRequest(number);
  if (pr?.number !== number || pr.state !== 'open' || !/^[a-f0-9]{40,64}$/i.test(pr.head?.sha ?? '') || !/^[a-f0-9]{40,64}$/i.test(pr.base?.sha ?? '')) throw new Error('Pull request unavailable or not open');
  const request = { repository: `${config.owner}/${config.repository}`, number, event, commit: pr.head.sha, body }, target = { base: pr.base.sha, state: pr.state };
  return { request, target, digest: digest(JSON.stringify({ repositoryPath: repositoryPath.toLowerCase(), request, target })) };
}
export async function processGitHubReview({ config, number, event, bodyPath, token, expectedDigest }, { makeClient = createGitHubClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid review digest');
  const client = makeClient({ owner: config?.owner, repository: config?.repository, token }), input = { config, number, event, bodyPath, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview. No review was submitted; this does not establish review quality or approval policy.' };
  if (first.digest !== expectedDigest) return { submitted: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { submitted: false, reason: 'preview-changed' };
  const result = await client.submitPullRequestReview({ number, event, commit: final.request.commit, body: final.request.body });
  return { ...result, scope: 'One GitHub review request returned an identifier; inspect the pull request. The branch may change after the final check.' };
}
