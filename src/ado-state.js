import { createHash } from 'node:crypto';
import { createAdoTracker } from './ado.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
function create(config, token, makeClient) {
  if (config?.provider !== 'ado') throw new TypeError('Azure tracker required');
  return makeClient({ organization: config.organization, project: config.project, token });
}
async function inspect({ client, config, id }) {
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new TypeError('Invalid work item ID');
  const item = await client.getWorkItemState(id), fields = item?.fields;
  if (item?.id !== id || !Number.isSafeInteger(item.rev) || item.rev < 1 || typeof fields?.['System.State'] !== 'string' || typeof fields?.['System.WorkItemType'] !== 'string' || typeof fields?.['System.TeamProject'] !== 'string' || fields['System.TeamProject'].toLowerCase() !== config.project.toLowerCase()) throw new Error('Work item unavailable or mismatched');
  const response = await client.listWorkItemStates(fields['System.WorkItemType']);
  if (!Array.isArray(response?.value) || response.value.length > 500) throw new Error('Invalid work item states');
  const states = response.value.map(value => {
    if (typeof value?.name !== 'string' || !value.name.trim() || value.name.length > 128 || /[\u0000-\u001f\u007f]/.test(value.name)) throw new Error('Invalid work item state');
    return { name: value.name, category: typeof value.category === 'string' ? value.category : null };
  });
  if (new Set(states.map(value => value.name)).size !== states.length) throw new Error('Duplicate work item states');
  return { organization: config.organization, project: config.project, id, revision: item.rev, type: fields['System.WorkItemType'], current: fields['System.State'], states };
}
export async function listAdoStates({ config, id, token }, { makeClient = createAdoTracker } = {}) {
  const data = await inspect({ config, id, client: create(config, token, makeClient) });
  return { ...data, scope: 'States belong to the work item type; allowed transitions and workflow effects are not established.' };
}
async function prepare(input) {
  const data = await inspect(input), selected = data.states.filter(item => item.name === input.state);
  if (selected.length !== 1) throw new Error('Requested state unavailable');
  const target = { organization: data.organization, project: data.project, id: data.id, revision: data.revision, type: data.type, from: data.current, to: selected[0] };
  return { target, digest: digest(JSON.stringify(target)) };
}
export async function processAdoState({ config, id, state, token, expectedDigest }, { makeClient = createAdoTracker } = {}) {
  if (typeof state !== 'string' || !state.trim() || state !== state.trim() || state.length > 128 || /[\u0000-\u001f\u007f]/.test(state) || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid state request');
  const client = create(config, token, makeClient), input = { config, id, state, client }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.target, digest: first.digest, scope: 'Read-only preview; transition permission and workflow effects are not established.' };
  if (first.digest !== expectedDigest) return { updated: false, reason: 'preview-changed' };
  if (first.target.from === state) return { updated: false, reason: 'already-in-state' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { updated: false, reason: 'preview-changed' };
  const result = await client.updateWorkItemState({ id, revision: final.target.revision, state });
  return { ...result, scope: 'Azure returned the updated work item; inspect its state and workflow effects.' };
}
