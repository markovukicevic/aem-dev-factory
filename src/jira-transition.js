import { createHash } from 'node:crypto';
import { createJiraTracker } from './jira.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
function create(config, email, token, makeClient) {
  if (config?.provider !== 'jira') throw new TypeError('Jira tracker required');
  return makeClient({ baseUrl: config.baseUrl, email, token });
}
async function inspect({ client, config, key }) {
  const issue = await client.getIssueState(key);
  if (typeof issue?.key !== 'string' || issue.key.toUpperCase() !== key.toUpperCase() || typeof issue.id !== 'string' || !/^[1-9][0-9]*$/.test(issue.id) || typeof issue.fields?.updated !== 'string' || typeof issue.fields?.status?.id !== 'string' || typeof issue.fields.status.name !== 'string') throw new Error('Issue unavailable or mismatched');
  const response = await client.getTransitions(key);
  if (!Array.isArray(response?.transitions) || response.transitions.length > 500) throw new Error('Invalid transitions response');
  const transitions = response.transitions.map(item => {
    if (typeof item?.id !== 'string' || !/^[1-9][0-9]{0,19}$/.test(item.id) || typeof item.name !== 'string' || typeof item.to?.id !== 'string' || typeof item.to?.name !== 'string' || !item.fields || typeof item.fields !== 'object' || Array.isArray(item.fields)) throw new Error('Invalid transition metadata');
    const fields = Object.entries(item.fields).map(([id, field]) => {
      if (!field || typeof field.required !== 'boolean') throw new Error('Invalid transition field metadata');
      return { id, required: field.required };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return { id: item.id, name: item.name, to: { id: item.to.id, name: item.to.name }, fields };
  });
  if (new Set(transitions.map(item => item.id)).size !== transitions.length) throw new Error('Duplicate transition IDs');
  return { site: new URL(config.baseUrl).origin.toLowerCase(), key: issue.key, issueId: issue.id, updatedAt: issue.fields.updated, current: { id: issue.fields.status.id, name: issue.fields.status.name }, transitions };
}
export async function listJiraTransitions({ config, key, email, token }, { makeClient = createJiraTracker } = {}) {
  const data = await inspect({ client: create(config, email, token, makeClient), config, key });
  return { ...data, scope: 'Available transitions are permission-dependent and may change. Workflow side effects are not enumerated.' };
}
async function prepare(input) {
  const data = await inspect(input), matches = data.transitions.filter(item => item.id === input.transitionId);
  if (matches.length !== 1 || matches[0].fields.some(field => field.required)) throw new Error('Transition unavailable or requires fields');
  const target = { site: data.site, key: data.key, issueId: data.issueId, updatedAt: data.updatedAt, current: data.current, transition: matches[0] };
  return { target, digest: digest(JSON.stringify(target)) };
}
export async function processJiraTransition({ config, key, transitionId, email, token, expectedDigest }, { makeClient = createJiraTracker } = {}) {
  if (typeof transitionId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(transitionId) || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid Jira transition request');
  const client = create(config, email, token, makeClient), input = { config, key, transitionId, client };
  const first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.target, digest: first.digest, scope: 'Read-only preview; workflow side effects are not enumerated.' };
  if (first.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const result = await client.transitionIssue({ key, transitionId });
  return { ...result, scope: 'Jira acknowledged the transition; inspect the resulting status and side effects.' };
}
