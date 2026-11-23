import { createHash } from 'node:crypto';
import { checkTaskPlan, readTaskPlan } from './task-plan.js';
import { readTaskSourceIdentity } from './jira-subtask.js';
import { createAdoTracker } from './ado.js';

const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br>');
function description(task) {
  return `<p>${escapeHtml(task.description)}</p><p>Area: ${escapeHtml(task.area)}</p><ul>${task.acceptance.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>${task.estimateHours === null ? '' : `<p>Proposed estimate: ${task.estimateHours} hours</p>`}`;
}
async function prepare({ spec, recordPath, index, workItemType, config, tracker }) {
  if (!Number.isSafeInteger(index) || index < 1 || typeof workItemType !== 'string' || !workItemType.trim() || workItemType !== workItemType.trim() || workItemType.length > 128 || /[\u0000-\u001f\u007f\/\\$]/.test(workItemType) || config?.provider !== 'ado') throw new TypeError('Invalid Azure subtask request');
  const [check, plan, identity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!check.matches || !check.sourceComplete || index > plan.tasks.length) throw new Error('Task plan or requirements context is incomplete or changed');
  const source = identity.value, match = /^ado-([1-9][0-9]*)$/.exec(source?.id ?? '');
  if (source?.version !== 1 || source.provider !== 'ado' || !match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) > 2147483647 || source.source !== `${config.organization.toLowerCase()}/${config.project}`) throw new Error('Azure source identity mismatch');
  const task = plan.tasks[index - 1];
  if (task.title.length > 255 || /[\u0000-\u001f\u007f]/.test(task.title)) throw new Error('Invalid subtask title');
  const parent = Number(match[1]), ticket = await tracker.getTicket(parent);
  if (ticket?.provider !== 'ado' || ticket.number !== parent || !Number.isSafeInteger(ticket.revision) || ticket.revision < 1 || typeof ticket.fields?.['System.TeamProject'] !== 'string' || ticket.fields['System.TeamProject'].toLowerCase() !== config.project.toLowerCase()) throw new Error('Azure parent or project mismatch');
  const [afterCheck, afterPlan, afterIdentity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!afterCheck.matches || !afterCheck.sourceComplete || afterPlan.digest !== plan.digest || afterIdentity.digest !== identity.digest) throw new Error('Task source changed while preparing request');
  const request = { parent, workItemType, summary: task.title, description: description(task) };
  const digest = createHash('sha256').update(JSON.stringify({ source: source.source, request, parentRevision: ticket.revision, taskPlanDigest: plan.digest, identityDigest: identity.digest })).digest('hex');
  return { request, digest, parentRevision: ticket.revision };
}

/** Preview or explicitly submit one reviewed Azure child task; never retries a create. */
export async function processAdoSubtask({ spec, recordPath, index, workItemType, config, token, expectedDigest }, { makeTracker = createAdoTracker } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const tracker = makeTracker({ organization: config?.organization, project: config?.project, token });
  const first = await prepare({ spec, recordPath, index, workItemType, config, tracker });
  if (expectedDigest === undefined) return { preview: first.request, parentRevision: first.parentRevision, digest: first.digest, scope: 'Reviewable proposal and current parent lookup only; no task was created. Azure state may change.' };
  if (first.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const final = await prepare({ spec, recordPath, index, workItemType, config, tracker });
  if (final.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const result = await tracker.createSubtask(final.request);
  return { ...result, scope: 'One Azure create request returned an identifier. Review the created task; the request may have changed state even if later checks fail.' };
}
