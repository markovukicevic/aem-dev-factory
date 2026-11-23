import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createGitHubClient } from './github.js';
import { createGitLabClient } from './gitlab.js';
import { createBitbucketClient } from './bitbucket.js';
import { createAdoScm } from './ado-scm.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const hash = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value);
function targetState(provider, pr, number) {
  let head, base, state;
  if (provider === 'github') { if (pr?.number !== number) throw new Error('Mismatched PR'); head = pr.head?.sha; base = pr.base?.sha; state = pr.state; }
  else if (provider === 'gitlab') { if (pr?.iid !== number) throw new Error('Mismatched MR'); head = pr.diff_refs?.head_sha; base = pr.diff_refs?.base_sha; state = pr.state; }
  else if (provider === 'bitbucket-cloud') { if (pr?.id !== number) throw new Error('Mismatched PR'); head = pr.source?.commit?.hash; base = pr.destination?.commit?.hash; state = pr.state; }
  else { if (pr?.pullRequestId !== number) throw new Error('Mismatched PR'); head = pr.lastMergeSourceCommit?.commitId; base = pr.lastMergeTargetCommit?.commitId; state = pr.status; }
  if (!hash(head) || !hash(base) || typeof state !== 'string' || !state || state.length > 64) throw new Error('PR revision metadata unavailable');
  return { head, base, state, revisionMeaning: provider === 'ado' ? 'last-merge-commits-not-current-heads' : 'observed-pr-commits' };
}
function make(config, token, factories) {
  if (config?.provider === 'github') return factories.github({ owner: config.owner, repository: config.repository, token });
  if (config?.provider === 'gitlab') return factories.gitlab({ project: config.project, token });
  if (config?.provider === 'bitbucket-cloud') return factories.bitbucket({ workspace: config.workspace, repository: config.repository, token });
  if (config?.provider === 'ado') return factories.ado({ organization: config.organization, project: config.project, repository: config.repository, token });
  throw new TypeError('Unsupported SCM provider');
}
function identity(config) {
  if (config.provider === 'github') return { owner: config.owner, repository: config.repository };
  if (config.provider === 'gitlab') return { project: config.project };
  if (config.provider === 'bitbucket-cloud') return { workspace: config.workspace, repository: config.repository };
  return { organization: config.organization, project: config.project, repository: config.repository };
}
async function prepare({ config, number, bodyPath, client }) {
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError('Invalid PR number');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const target = targetState(config.provider, await client.getPullRequest(number), number);
  const request = { provider: config.provider, repository: identity(config), number, body };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
export async function processScmComment({ config, number, bodyPath, token, expectedDigest }, { factories = { github: createGitHubClient, gitlab: createGitLabClient, bitbucket: createBitbucketClient, ado: createAdoScm } } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = make(config, token, factories), input = { config, number, bodyPath, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview. Nothing was sent; Azure last merge commits do not establish current heads.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const result = config.provider === 'github' ? await client.createIssueComment({ number, body: final.request.body }) : await client.createPullRequestComment({ number, body: final.request.body });
  return { ...result, scope: 'One provider comment request returned an identifier; inspect the discussion. State may change after the final check.' };
}
