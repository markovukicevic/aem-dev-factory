import { createHash } from 'node:crypto';
import { checkTaskPlan, readTaskPlan } from './task-plan.js';
import { readTaskSourceIdentity } from './jira-subtask.js';
import { createGitLabClient } from './gitlab.js';
const escape = value => value.replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '&#64;');
const quote = value => value.split(/\r?\n/).map(line => `> ${escape(line)}`).join('\n');
function description(task) {
  return `${quote(task.description)}\n\n**Area:** ${escape(task.area).replace(/\r?\n/g, ' ')}\n\n## Acceptance criteria\n\n${task.acceptance.map(item => `> - ${escape(item).replace(/\r?\n/g, '\n>   ')}`).join('\n')}\n${task.estimateHours === null ? '' : `\nProposed estimate: ${task.estimateHours} hours\n`}`;
}
async function prepare({ spec, recordPath, index, workItemTypeId, config, client }) {
  if (!Number.isSafeInteger(index) || index < 1 || typeof workItemTypeId !== 'string' || !/^gid:\/\/gitlab\/WorkItems::Type\/[1-9][0-9]*$/.test(workItemTypeId) || config?.provider !== 'gitlab') throw new TypeError('Invalid GitLab child work item request');
  const [check, plan, identity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!check.matches || !check.sourceComplete || index > plan.tasks.length) throw new Error('Task plan or requirements context is incomplete or changed');
  const source = identity.value, match = /^gitlab-([1-9][0-9]*)$/.exec(source?.id ?? '');
  if (source?.version !== 1 || source.provider !== 'gitlab' || !match || !Number.isSafeInteger(Number(match[1])) || source.source !== config.project) throw new Error('GitLab source identity mismatch');
  const task = plan.tasks[index - 1];
  if (task.title.length > 255 || /[\u0000-\u001f\u007f]/.test(task.title)) throw new Error('Invalid task title');
  const parent = await client.getWorkItem(Number(match[1]));
  const [afterCheck, afterPlan, afterIdentity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!afterCheck.matches || !afterCheck.sourceComplete || afterPlan.digest !== plan.digest || afterIdentity.digest !== identity.digest) throw new Error('Task source changed while preparing request');
  const request = { parentId: parent.id, workItemTypeId, title: task.title, description: description(task) };
  const digest = createHash('sha256').update(JSON.stringify({ project: config.project, request, parentUpdatedAt: parent.updatedAt, taskPlanDigest: plan.digest, identityDigest: identity.digest })).digest('hex');
  return { request, digest, parentUpdatedAt: parent.updatedAt };
}
export async function processGitLabSubtask({ spec, recordPath, index, workItemTypeId, config, token, expectedDigest }, { makeClient = createGitLabClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ project: config?.project, token });
  const first = await prepare({ spec, recordPath, index, workItemTypeId, config, client });
  if (expectedDigest === undefined) return { preview: first.request, parentUpdatedAt: first.parentUpdatedAt, digest: first.digest, scope: 'Reviewable proposal and parent lookup only; no work item was created. GitLab state may change.' };
  if (first.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const final = await prepare({ spec, recordPath, index, workItemTypeId, config, client });
  if (final.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const result = await client.createChildWorkItem(final.request);
  const url = `https://gitlab.com/${config.project.split('/').map(encodeURIComponent).join('/')}/-/work_items/${result.iid}`;
  return { ...result, url, scope: result.linked ? 'Create response included the requested parent; inspect the resulting item.' : 'Work item exists but parent relationship is unconfirmed; inspect GitLab before retrying.' };
}
