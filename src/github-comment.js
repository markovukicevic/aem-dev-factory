import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createGitHubClient, githubRepositoryPath } from './github.js';
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function readBody(path) {
  const data = await readLimitedFile(path, 65536), body = new TextDecoder('utf-8', { fatal: true }).decode(data);
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  return body;
}
async function prepare({ kind, number, commentId, bodyPath, config, client }) {
  if (!['issue-comment', 'review-reply'].includes(kind) || !Number.isSafeInteger(number) || number < 1 || (kind === 'review-reply' && (!Number.isSafeInteger(commentId) || commentId < 1)) || config?.provider !== 'github') throw new TypeError('Invalid GitHub comment request');
  const repositoryPath = githubRepositoryPath(config.owner, config.repository), body = await readBody(bodyPath);
  let target;
  if (kind === 'issue-comment') {
    const issue = await client.getIssue(number);
    if (!issue || issue.number !== number || !Number.isSafeInteger(issue.id) || issue.id < 1 || issue.pull_request || !timestamp(issue.updated_at)) throw new Error('GitHub issue unavailable or mismatched');
    target = { issueId: issue.id, updatedAt: issue.updated_at };
  } else {
    const pr = await client.getPullRequest(number), comment = await client.getReviewComment(commentId);
    if (!pr || pr.number !== number || !/^[a-f0-9]{40,64}$/i.test(pr.head?.sha ?? '') || !/^[a-f0-9]{40,64}$/i.test(pr.base?.sha ?? '') || !comment || comment.id !== commentId || comment.in_reply_to_id != null || !timestamp(comment.updated_at) || typeof comment.body !== 'string' || Buffer.byteLength(comment.body, 'utf8') > 262144) throw new Error('Review target unavailable or unsupported');
    let url;
    try { url = new URL(comment.pull_request_url); } catch { throw new Error('Invalid review comment origin'); }
    if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.port || url.username || url.password || url.search || url.hash || url.pathname.toLowerCase() !== `${repositoryPath}/pulls/${number}`.toLowerCase()) throw new Error('Review comment does not belong to selected PR');
    const after = await client.getPullRequest(number);
    if (after?.number !== number || after.head?.sha !== pr.head.sha || after.base?.sha !== pr.base.sha) throw new Error('Pull request changed during inspection');
    target = { head: pr.head.sha, base: pr.base.sha, commentId, updatedAt: comment.updated_at, commentDigest: digest(comment.body) };
  }
  const request = { kind, repository: `${config.owner}/${config.repository}`, number, ...(kind === 'review-reply' ? { commentId } : {}), body };
  return { request, target, previewDigest: digest(JSON.stringify({ repositoryPath: repositoryPath.toLowerCase(), request, target })) };
}

/** Preview or explicitly send one reviewed GitHub comment without retrying writes. */
export async function processGitHubComment({ kind, number, commentId, bodyPath, config, token, expectedDigest }, { makeClient = createGitHubClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ owner: config?.owner, repository: config?.repository, token });
  const first = await prepare({ kind, number, commentId, bodyPath, config, client });
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.previewDigest, scope: 'Read-only preview of one message. Nothing was sent; target state may change.' };
  if (first.previewDigest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare({ kind, number, commentId, bodyPath, config, client });
  if (final.previewDigest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const sent = kind === 'issue-comment' ? await client.createIssueComment({ number, body: final.request.body }) : await client.replyReviewComment({ number, commentId, body: final.request.body });
  return { ...sent, scope: 'One GitHub comment request returned an identifier; inspect the actual discussion. Target state can change after the final check.' };
}
