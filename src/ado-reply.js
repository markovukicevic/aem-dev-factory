import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createAdoScm } from './ado-scm.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
function pullState(pr, number) {
  const source = pr?.lastMergeSourceCommit?.commitId, target = pr?.lastMergeTargetCommit?.commitId;
  if (pr?.pullRequestId !== number || !/^[a-f0-9]{40,64}$/i.test(source ?? '') || !/^[a-f0-9]{40,64}$/i.test(target ?? '')) throw new Error('Pull request merge revisions unavailable');
  return { lastMergeSource: source, lastMergeTarget: target };
}
async function prepare({ number, threadId, commentId, bodyPath, config, client }) {
  if (config?.provider !== 'ado' || ![number, threadId].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647) || !Number.isSafeInteger(commentId) || commentId < 1 || commentId > 32767) throw new TypeError('Invalid Azure reply request');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const before = pullState(await client.getPullRequest(number), number);
  const thread = await client.getPullRequestThread(number, threadId);
  if (thread?.id !== threadId || thread.isDeleted === true || !Array.isArray(thread.comments) || !thread.comments.length || thread.comments.length > 500) throw new Error('Thread unavailable or unsupported');
  const notes = thread.comments.map(note => {
    if (!Number.isSafeInteger(note?.id) || note.id < 1 || (note.content != null && (typeof note.content !== 'string' || Buffer.byteLength(note.content, 'utf8') > 262144))) throw new Error('Invalid thread comment');
    return { id: note.id, parentCommentId: note.parentCommentId ?? null, content: note.content ?? null, isDeleted: note.isDeleted ?? false, lastUpdatedDate: note.lastUpdatedDate ?? null, commentType: note.commentType ?? null };
  });
  if (!notes.some(note => note.id === commentId && !note.isDeleted && note.content !== null && note.commentType === 'text')) throw new Error('Parent comment unavailable');
  const after = pullState(await client.getPullRequest(number), number);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Pull request changed during inspection');
  const target = { ...before, threadId, commentId, status: thread.status ?? null, threadDigest: digest(JSON.stringify(notes)) };
  const request = { organization: config.organization, project: config.project, repository: config.repository, number, threadId, commentId, body };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
export async function processAdoReply({ number, threadId, commentId, bodyPath, config, token, expectedDigest }, { makeClient = createAdoScm } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ organization: config?.organization, project: config?.project, repository: config?.repository, token });
  const input = { number, threadId, commentId, bodyPath, config, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview. Nothing was sent; last merge commits do not establish current branch heads.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const sent = await client.replyPullRequestThread({ number, threadId, commentId, body: final.request.body });
  return { ...sent, scope: 'One Azure comment request returned an identifier; inspect the thread. Target state can change after the final check.' };
}
