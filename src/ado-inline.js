import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createAdoScm } from './ado-scm.js';
import { readAzureLatestIterationChanges } from './ado-pr-iterations.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
const validPath = path => typeof path === 'string' && path.startsWith('/') && path.length > 1 && path.length <= 1024 && !/[\u0000-\u001f\u007f\\]/.test(path) && path.slice(1).split('/').every(part => part && part !== '.' && part !== '..');
async function prepare({ config, number, reviewedSha, path, side, line, bodyPath, client }) {
  if (config?.provider !== 'ado' || !Number.isSafeInteger(number) || number < 1 || number > 2147483647 || typeof reviewedSha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(reviewedSha) || !validPath(path) || !['LEFT', 'RIGHT'].includes(side) || !Number.isSafeInteger(line) || line < 1 || line > 2147483647) throw new TypeError('Invalid Azure inline request');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const data = await readAzureLatestIterationChanges({ scm: client, number, reviewedSha });
  if (!data.paginationComplete) throw new Error('Iteration changes incomplete');
  const matches = data.changes.filter(change => change?.item?.path === path);
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].changeTrackingId) || matches[0].changeTrackingId < 1) throw new Error('File is absent or ambiguous in iteration changes');
  const change = matches[0];
  const target = { iteration: data.iteration, changeTrackingId: change.changeTrackingId, changeType: typeof change.changeType === 'string' ? change.changeType : null, originalPath: typeof change.originalPath === 'string' ? change.originalPath : null };
  const request = { organization: config.organization, project: config.project, repository: config.repository, number, reviewedSha: data.iteration.source, path, side, line, body };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
/** Preview or explicitly create one Azure file-positioned PR thread. */
export async function processAzureInline({ config, number, reviewedSha, path, side, line, bodyPath, token, expectedDigest }, { makeClient = createAdoScm } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ organization: config?.organization, project: config?.project, repository: config?.repository, token }), input = { config, number, reviewedSha, path, side, line, bodyPath, client }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview. File membership is reported by Azure; line existence, full diff and current branch heads are not verified.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const result = await client.createInlineThread({ number, path, side, line, body: final.request.body, iteration: final.target.iteration.id, changeTrackingId: final.target.changeTrackingId });
  return { ...result, scope: 'Azure returned a thread identifier. Inspect the actual thread position and PR; line existence and current branch heads were not established.' };
}
