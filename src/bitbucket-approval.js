import { createHash } from 'node:crypto';
import { createBitbucketClient } from './bitbucket.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, number, reviewedSha, client }) {
  if (config?.provider !== 'bitbucket-cloud' || !Number.isSafeInteger(number) || number < 1 || typeof reviewedSha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(reviewedSha)) throw new TypeError('Invalid Bitbucket approval request');
  const pr = await client.getPullRequest(number), head = pr?.source?.commit?.hash, base = pr?.destination?.commit?.hash;
  if (pr?.id !== number || pr.state !== 'OPEN' || !/^[a-f0-9]{40,64}$/i.test(head ?? '') || !/^[a-f0-9]{40,64}$/i.test(base ?? '') || head.toLowerCase() !== reviewedSha.toLowerCase()) throw new Error('PR or reviewed revision unavailable');
  const preview = { workspace: config.workspace, repository: config.repository, number, reviewedSha: head, base, state: pr.state };
  return { preview, digest: digest(JSON.stringify(preview)) };
}
/** Preview or explicitly request approval; Bitbucket does not atomically bind the commit. */
export async function processBitbucketApproval({ config, number, reviewedSha, token, expectedDigest }, { makeClient = createBitbucketClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid approval digest');
  const client = makeClient({ workspace: config?.workspace, repository: config?.repository, token }), input = { config, number, reviewedSha, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only preview. The Bitbucket approval API does not atomically bind the reviewed commit; review and branch policy are not established.' };
  if (first.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const result = await client.approvePullRequest(number);
  let revisionMatches = null;
  try { const after = await client.getPullRequest(number); if (after?.id === number && typeof after.source?.commit?.hash === 'string' && typeof after.destination?.commit?.hash === 'string') revisionMatches = after.state === final.preview.state && after.source.commit.hash === final.preview.reviewedSha && after.destination.commit.hash === final.preview.base; } catch { /* Approval may have succeeded even when the post-check is unavailable. */ }
  return { ...result, revisionMatches, scope: 'Bitbucket acknowledged approval; inspect the PR. A matching post-check cannot rule out changes during the request or establish policy satisfaction.' };
}
