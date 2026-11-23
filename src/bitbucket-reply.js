import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createBitbucketClient } from './bitbucket.js';

const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
function revisions(pr, number) {
  const head = pr?.source?.commit?.hash, base = pr?.destination?.commit?.hash;
  if (pr?.id !== number || !/^[a-f0-9]{40,64}$/i.test(head ?? '') || !/^[a-f0-9]{40,64}$/i.test(base ?? '')) throw new Error('Pull request revisions unavailable');
  return { head, base };
}
async function prepare({ number, commentId, bodyPath, config, client }) {
  if (config?.provider !== 'bitbucket-cloud' || !Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(commentId) || commentId < 1) throw new TypeError('Invalid Bitbucket reply request');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const before = revisions(await client.getPullRequest(number), number);
  const comment = await client.getPullRequestComment(number, commentId);
  if (comment?.id !== commentId || comment.deleted === true || typeof comment.content?.raw !== 'string' || Buffer.byteLength(comment.content.raw, 'utf8') > 262144 || typeof comment.updated_on !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(comment.updated_on)) throw new Error('Comment unavailable or unsupported');
  const after = revisions(await client.getPullRequest(number), number);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Pull request changed during inspection');
  const target = { ...before, commentId, updatedAt: comment.updated_on, commentDigest: digest(comment.content.raw) };
  const request = { workspace: config.workspace, repository: config.repository, number, commentId, body };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
export async function processBitbucketReply({ number, commentId, bodyPath, config, token, expectedDigest }, { makeClient = createBitbucketClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ workspace: config?.workspace, repository: config?.repository, token });
  const input = { number, commentId, bodyPath, config, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview of one reply. Nothing was sent; target state may change.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const sent = await client.replyPullRequestComment({ number, commentId, body: final.request.body });
  return { ...sent, scope: 'One Bitbucket comment request returned an identifier; inspect the discussion. Target state can change after the final check.' };
}
