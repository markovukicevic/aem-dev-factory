import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createBitbucketClient } from './bitbucket.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const safePath = path => typeof path === 'string' && path.length > 0 && path.length <= 1024 && /^[A-Za-z0-9_./-]+$/.test(path) && !path.startsWith('/') && path.split('/').every(part => part && part !== '.' && part !== '..');
/** Find an explicit text-diff line in a bounded, unquoted Git diff. */
function containsLine(diff, path, side, line) {
  if (typeof diff !== 'string' || Buffer.byteLength(diff, 'utf8') > 2 * 1024 * 1024) return false;
  let oldPath = null, newPath = null, selected = false, oldLine = null, newLine = null;
  for (const row of diff.split('\n')) {
    if (row.startsWith('diff --git ')) { oldPath = null; newPath = null; selected = false; oldLine = null; newLine = null; continue; }
    if (oldLine === null && row.startsWith('--- ')) { oldPath = row.slice(4); continue; }
    if (oldLine === null && row.startsWith('+++ ')) {
      newPath = row.slice(4);
      const oldName = oldPath?.startsWith('a/') ? oldPath.slice(2) : oldPath === '/dev/null' ? null : undefined;
      const newName = newPath.startsWith('b/') ? newPath.slice(2) : newPath === '/dev/null' ? null : undefined;
      selected = oldName !== undefined && newName !== undefined && (newName ?? oldName) === path && (!oldName || safePath(oldName)) && (!newName || safePath(newName));
      continue;
    }
    if (!selected) continue;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); if (!Number.isSafeInteger(oldLine) || !Number.isSafeInteger(newLine)) return false; continue; }
    if (oldLine === null || row.startsWith('\\')) continue;
    if (row.startsWith('-')) { if (side === 'LEFT' && oldLine === line) return true; oldLine++; }
    else if (row.startsWith('+')) { if (side === 'RIGHT' && newLine === line) return true; newLine++; }
    else if (row.startsWith(' ')) { if (side === 'RIGHT' && newLine === line) return true; oldLine++; newLine++; }
    else if (row !== '') return false;
  }
  return false;
}
function revisions(pr, number) {
  const head = pr?.source?.commit?.hash, base = pr?.destination?.commit?.hash;
  if (pr?.id !== number || pr.state !== 'OPEN' || !/^[a-f0-9]{40,64}$/i.test(head ?? '') || !/^[a-f0-9]{40,64}$/i.test(base ?? '')) throw new Error('PR revisions unavailable');
  return { head, base };
}
async function prepare({ config, number, path, side, line, bodyPath, client }) {
  if (config?.provider !== 'bitbucket-cloud' || !Number.isSafeInteger(number) || number < 1 || !safePath(path) || !['LEFT', 'RIGHT'].includes(side) || !Number.isSafeInteger(line) || line < 1) throw new TypeError('Invalid Bitbucket inline request');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const before = revisions(await client.getPullRequest(number), number), diff = await client.getPullRequestDiff(number), after = revisions(await client.getPullRequest(number), number);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('PR changed while reading diff');
  if (!containsLine(diff, path, side, line)) throw new Error('Selected diff line unavailable or unsupported');
  const request = { workspace: config.workspace, repository: config.repository, number, path, side, line, body }, target = { ...before, diffDigest: digest(diff) };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
/** Preview or explicitly create one Bitbucket Cloud inline PR comment. */
export async function processBitbucketInline({ config, number, path, side, line, bodyPath, token, expectedDigest }, { makeClient = createBitbucketClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ workspace: config?.workspace, repository: config?.repository, token }), input = { config, number, path, side, line, bodyPath, client }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview of a line in a bounded diff; nothing was sent. Quoted paths and oversized diffs are unsupported.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const result = await client.createInlineComment({ number, path, side, line, body: final.request.body });
  return { ...result, scope: 'One Bitbucket comment request returned an identifier; inspect the PR. Revisions can change after the final check.' };
}
