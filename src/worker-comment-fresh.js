import { createHash } from 'node:crypto';
import { readBitbucketOrigin } from './bitbucket-origin.js';

async function getJson(url, headers, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('Provider response unavailable');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid response'); size += value.length; if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Response too large'); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
function token(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('Provider token required');
  return value;
}

/** Compare a signed triggering comment with a current provider observation. */
export async function verifyWorkerTriggerComment({ target, claim, environment }, { fetchImpl = globalThis.fetch, readOrigin = readBitbucketOrigin } = {}) {
  if (!claim || !['github', 'gitlab', 'bitbucket-cloud'].includes(claim.provider) || typeof claim.repository !== 'string' || typeof claim.actor !== 'string' || !Number.isSafeInteger(claim.number) || claim.number < 1 || !Number.isSafeInteger(claim.commentId) || claim.commentId < 1 || typeof claim.commentBodyDigest !== 'string' || !/^[a-f0-9]{64}$/.test(claim.commentBodyDigest)) throw new TypeError('Invalid triggering comment');
  let current, body, author;
  if (claim.provider === 'github') {
    const parts = claim.repository.split('/');
    if (parts.length !== 2 || parts.some(item => !/^[A-Za-z0-9_.-]+$/.test(item) || ['.', '..'].includes(item))) throw new Error('Invalid GitHub repository');
    const path = `/repos/${parts.map(encodeURIComponent).join('/')}`;
    current = await getJson(`https://api.github.com${path}/issues/comments/${claim.commentId}`, { Authorization: `Bearer ${token(environment?.GITHUB_TOKEN)}`, 'X-GitHub-Api-Version': '2022-11-28' }, fetchImpl);
    let issue; try { issue = new URL(current?.issue_url); } catch { throw new Error('Invalid issue identity'); }
    if (issue.origin !== 'https://api.github.com' || issue.username || issue.password || issue.search || issue.hash || issue.pathname.toLowerCase() !== `${path}/issues/${claim.number}`.toLowerCase()) throw new Error('Comment belongs to another issue');
    body = current.body; author = current.user?.login;
  } else if (claim.provider === 'gitlab') {
    if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(claim.repository) || !['issue-comment', 'pull-request-comment'].includes(claim.kind)) throw new Error('Invalid GitLab comment');
    const type = claim.kind === 'issue-comment' ? 'issues' : 'merge_requests';
    current = await getJson(`https://gitlab.com/api/v4/projects/${encodeURIComponent(claim.repository)}/${type}/${claim.number}/notes/${claim.commentId}`, { 'PRIVATE-TOKEN': token(environment?.GITLAB_TOKEN) }, fetchImpl);
    if (current.system !== false) throw new Error('Comment is not a user note');
    body = current.body; author = current.author?.username;
  } else {
    const origin = await readOrigin(target), root = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(origin.workspace)}/${encodeURIComponent(origin.repository)}`, headers = { Authorization: `Bearer ${token(environment?.BITBUCKET_TOKEN)}` };
    const first = await getJson(root, headers, fetchImpl);
    if (typeof first.uuid !== 'string' || first.uuid.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Bitbucket repository mismatch');
    current = await getJson(`${root}/pullrequests/${claim.number}/comments/${claim.commentId}`, headers, fetchImpl);
    const last = await getJson(root, headers, fetchImpl);
    if (typeof last.uuid !== 'string' || last.uuid.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Bitbucket repository changed');
    body = current.content?.raw; author = current.user?.uuid;
  }
  const matches = current?.id === claim.commentId && typeof body === 'string' && typeof author === 'string' && author.toLowerCase() === claim.actor.toLowerCase() && createHash('sha256').update(body, 'utf8').digest('hex') === claim.commentBodyDigest;
  return { matches, scope: 'Current provider comment and editable claim metadata only; a match does not prove authorization or prevent later changes.' };
}
