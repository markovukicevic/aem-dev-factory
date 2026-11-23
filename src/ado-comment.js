import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createAdoTracker } from './ado.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, id, bodyPath, client }) {
  if (config?.provider !== 'ado' || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new TypeError('Invalid work item comment request');
  const body = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  if (!body.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw new TypeError('Invalid comment body');
  const item = await client.getWorkItemState(id);
  if (item?.id !== id || !Number.isSafeInteger(item.rev) || item.rev < 1 || typeof item.fields?.['System.TeamProject'] !== 'string' || item.fields['System.TeamProject'].toLowerCase() !== config.project.toLowerCase()) throw new Error('Work item unavailable or mismatched');
  const request = { organization: config.organization, project: config.project, id, body }, target = { revision: item.rev };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
export async function processAdoComment({ config, id, bodyPath, token, expectedDigest }, { makeClient = createAdoTracker } = {}) {
  if (config?.provider !== 'ado' || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid comment request');
  const client = makeClient({ organization: config.organization, project: config.project, token }), input = { config, id, bodyPath, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview; nothing was sent. Existing comments are not rechecked.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const result = await client.createWorkItemComment({ id, body: final.request.body });
  return { ...result, scope: 'One Azure comment request returned an identifier; inspect the work item. State can change after the final check.' };
}
