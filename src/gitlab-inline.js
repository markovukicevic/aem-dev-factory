import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createGitLabClient } from './gitlab.js';
import { readGitLabMergeRequestDiffs } from './gitlab-mr-diffs.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const validPath = path => typeof path === 'string' && !!path && path.length <= 1024 && !path.startsWith('/') && !/[\u0000-\u001f\u007f\\]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
/** Resolve a single returned diff line to GitLab's old/new line coordinates. */
function positionForLine(patch, side, line) {
  if (typeof patch !== 'string' || Buffer.byteLength(patch, 'utf8') > 1024 * 1024) return null;
  let oldLine = null, newLine = null;
  for (const row of patch.split('\n')) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); if (!Number.isSafeInteger(oldLine) || !Number.isSafeInteger(newLine)) return null; continue; }
    if (oldLine === null || row.startsWith('\\')) continue;
    if (row.startsWith('-')) { if (side === 'LEFT' && oldLine === line) return { old_line: oldLine }; oldLine++; }
    else if (row.startsWith('+')) { if (side === 'RIGHT' && newLine === line) return { new_line: newLine }; newLine++; }
    else if (row.startsWith(' ')) { if (side === 'RIGHT' && newLine === line) return { old_line: oldLine, new_line: newLine }; oldLine++; newLine++; }
    else if (row !== '') return null;
  }
  return null;
}
async function prepare({ config, number, path, side, line, bodyPath, client }) {
  if (config?.provider !== 'gitlab' || !Number.isSafeInteger(number) || number < 1 || !validPath(path) || !['LEFT', 'RIGHT'].includes(side) || !Number.isSafeInteger(line) || line < 1) throw new TypeError('Invalid GitLab inline request');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const result = await readGitLabMergeRequestDiffs({ scm: { ...client, provider: 'gitlab' }, number });
  if (!result.paginationComplete) throw new Error('GitLab diff pagination incomplete');
  const file = result.files.find(item => item.new_path === path);
  if (!file || !validPath(file.old_path) || !validPath(file.new_path) || file.collapsed === true || file.too_large === true) throw new Error('GitLab diff unavailable');
  const lines = positionForLine(file.diff, side, line);
  if (!lines) throw new Error('Selected diff line unavailable');
  const position = { position_type: 'text', base_sha: result.revisions.base_sha, head_sha: result.revisions.head_sha, start_sha: result.revisions.start_sha, old_path: file.old_path, new_path: file.new_path, ...lines };
  const request = { project: config.project, number, side, line, body, position };
  const target = { patchDigest: digest(file.diff) };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
/** Preview or explicitly create one GitLab merge-request diff discussion. */
export async function processGitLabInline({ config, number, path, side, line, bodyPath, token, expectedDigest }, { makeClient = createGitLabClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ project: config?.project, token }), input = { config, number, path, side, line, bodyPath, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview for a line in a returned patch; nothing was sent. GitLab diff coverage and future revisions are not guaranteed.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const result = await client.createInlineDiscussion({ number, body: final.request.body, position: final.request.position });
  return { ...result, scope: 'One GitLab discussion request returned an identifier; inspect the MR. Revisions can change after the final check.' };
}
