import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createGitHubClient, githubRepositoryPath } from './github.js';
import { readGitHubPullRequestFiles } from './github-pr-files.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
function diffContains(patch, side, line) {
  if (typeof patch !== 'string' || Buffer.byteLength(patch, 'utf8') > 1024 * 1024) return false;
  let oldLine = null, newLine = null;
  for (const row of patch.split('\n')) {
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
async function prepare({ config, number, path, side, line, bodyPath, client }) {
  if (config?.provider !== 'github' || !Number.isSafeInteger(number) || number < 1 || typeof path !== 'string' || !path || path.length > 1024 || path.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') || !['LEFT', 'RIGHT'].includes(side) || !Number.isSafeInteger(line) || line < 1) throw new TypeError('Invalid inline comment request');
  const repositoryPath = githubRepositoryPath(config.owner, config.repository);
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const files = await readGitHubPullRequestFiles({ scm: { ...client, provider: 'github' }, number });
  if (!files.fileListComplete) throw new Error('PR file list incomplete');
  const file = files.files.find(item => item.filename === path);
  if (!file || !diffContains(file.patch, side, line)) throw new Error('Selected diff line unavailable');
  const request = { repository: `${config.owner}/${config.repository}`, number, path, side, line, commit: files.head, body };
  const target = { base: files.base, patchDigest: digest(file.patch) };
  return { request, target, digest: digest(JSON.stringify({ repositoryPath: repositoryPath.toLowerCase(), request, target })) };
}
export async function processGitHubInline({ config, number, path, side, line, bodyPath, token, expectedDigest }, { makeClient = createGitHubClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ owner: config?.owner, repository: config?.repository, token }), input = { config, number, path, side, line, bodyPath, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview for a line present in a returned patch. Nothing was sent; full diff completeness is not established.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const result = await client.createInlineComment({ number, path, side, line, commit: final.request.commit, body: final.request.body });
  return { ...result, scope: 'One GitHub comment request returned an identifier; inspect the PR. Revisions may change after the final check.' };
}
