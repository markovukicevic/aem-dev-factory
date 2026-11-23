import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { createJiraTracker } from './jira.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, key, bodyPath, client }) {
  if (config?.provider !== 'jira' || typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(key)) throw new TypeError('Invalid Jira comment request');
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(bodyPath, 65536));
  const body = JSON.parse(raw);
  if (!body || Array.isArray(body) || body.type !== 'doc' || body.version !== 1 || !Array.isArray(body.content) || !body.content.length) throw new TypeError('Invalid ADF document');
  const issue = await client.getIssueState(key);
  if (typeof issue?.key !== 'string' || issue.key.toUpperCase() !== key.toUpperCase() || typeof issue.id !== 'string' || !/^[1-9][0-9]*$/.test(issue.id) || typeof issue.fields?.updated !== 'string') throw new Error('Issue unavailable or mismatched');
  const request = { site: new URL(config.baseUrl).origin.toLowerCase(), key: issue.key, body };
  const target = { issueId: issue.id, updatedAt: issue.fields.updated };
  return { request, target, digest: digest(JSON.stringify({ request, target })) };
}
export async function processJiraComment({ config, key, bodyPath, email, token, expectedDigest }, { makeClient = createJiraTracker } = {}) {
  if (config?.provider !== 'jira' || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid Jira comment request');
  const client = makeClient({ baseUrl: config.baseUrl, email, token }), input = { config, key, bodyPath, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.request, target: first.target, digest: first.digest, scope: 'Read-only preview; Jira validates the document schema. Nothing was sent.' };
  if (first.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { sent: false, reason: 'preview-changed' };
  const result = await client.createIssueComment({ key: final.request.key, body: final.request.body });
  return { ...result, scope: 'One Jira comment request returned an identifier; inspect the issue. Target state can change after the final check.' };
}
