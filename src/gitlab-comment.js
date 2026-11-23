import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createGitLabClient } from './gitlab.js';

const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const timestamp = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value);
function revisions(mr, number) {
  const refs = mr?.diff_refs;
  if (mr?.iid !== number || !sha(refs?.head_sha) || !sha(refs?.base_sha) || !sha(refs?.start_sha)) throw new Error('Merge request revisions unavailable');
  return { head: refs.head_sha, base: refs.base_sha, start: refs.start_sha };
}
function requireConfig(config) {
  if (config?.provider !== 'gitlab') throw new TypeError('GitLab provider required');
}
async function readBody(path) {
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(path, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  return body;
}
function threadState(discussion, discussionId) {
  if (discussion?.id !== discussionId || discussion.individual_note !== false || !Array.isArray(discussion.notes) || !discussion.notes.length || discussion.notes.length > 1000) throw new Error('Discussion unavailable or unsupported');
  const notes = discussion.notes.map(note => {
    if (!Number.isSafeInteger(note?.id) || note.id < 1 || typeof note.body !== 'string' || Buffer.byteLength(note.body, 'utf8') > 262144 || !timestamp(note.updated_at)) throw new Error('Invalid discussion note');
    return { id: note.id, body: note.body, updatedAt: note.updated_at, resolved: note.resolved ?? null, system: note.system ?? null };
  });
  return { discussionId, noteCount: notes.length, discussionDigest: digest(JSON.stringify(notes)) };
}
async function prepare({ kind, number, discussionId, bodyPath, config, client }) {
  requireConfig(config);
  if (!['issue-comment', 'review-reply'].includes(kind) || !Number.isSafeInteger(number) || number < 1 || (kind === 'review-reply' && (typeof discussionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(discussionId)))) throw new TypeError('Invalid comment request');
  const body = await readBody(bodyPath);
  let target;
  if (kind === 'issue-comment') {
    const issue = await client.getIssueMetadata(number);
    if (issue?.iid !== number || !Number.isSafeInteger(issue.id) || issue.id < 1 || !timestamp(issue.updated_at)) throw new Error('Issue unavailable or mismatched');
    target = { issueId: issue.id, updatedAt: issue.updated_at };
  } else {
    const before = revisions(await client.getPullRequest(number), number);
    const discussion = threadState(await client.getMergeRequestDiscussion(number, discussionId), discussionId);
    const after = revisions(await client.getPullRequest(number), number);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Merge request changed during inspection');
    target = { ...before, ...discussion };
  }
  const request = { kind, project: config.project, number, ...(kind === 'review-reply' ? { discussionId } : {}), body };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
export async function readGitLabDiscussions({ config, number, token }, { makeClient = createGitLabClient } = {}) {
  requireConfig(config);
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError('Invalid merge request');
  const client = makeClient({ project: config.project, token });
  const before = revisions(await client.getPullRequest(number), number);
  const discussions = await client.getMergeRequestDiscussions(number);
  const after = revisions(await client.getPullRequest(number), number);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Merge request changed during inspection');
  return { provider: 'gitlab', project: config.project, number, revisions: before, discussions, scope: 'Discussion pages were read; conversations can change during inspection.' };
}
export async function processGitLabComment({ kind, number, discussionId, bodyPath, config, token, expectedDigest }, { makeClient = createGitLabClient } = {}) {
  requireConfig(config);
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ project: config.project, token });
  const input = { kind, number, discussionId, bodyPath, config, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview of one note. Nothing was sent; target state may change.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const sent = kind === 'issue-comment' ? await client.createIssueNote({ number, body: final.request.body }) : await client.replyMergeRequestDiscussion({ number, discussionId, body: final.request.body });
  return { ...sent, scope: 'One GitLab note request returned an identifier; inspect the discussion. Target state can change after the final check.' };
}
