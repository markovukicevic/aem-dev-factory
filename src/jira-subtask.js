import { createHash } from 'node:crypto';
import { lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { checkTaskPlan, readTaskPlan } from './task-plan.js';
import { createJiraTracker } from './jira.js';

export async function readTaskSourceIdentity(spec) {
  const directory = await lstat(spec);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const handle = await open(join(spec, 'source-identity.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat(); if (!before.isFile() || before.size > 16384) throw new Error('Invalid source identity');
    const bytes = Buffer.alloc(16385); let used = 0;
    while (used < bytes.length) { const part = await handle.read(bytes, used, bytes.length - used, null); if (!part.bytesRead) break; used += part.bytesRead; }
    const after = await handle.stat();
    if (used !== before.size || before.size !== after.size || before.ino !== after.ino || before.dev !== after.dev || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Source identity changed');
    const raw = bytes.subarray(0, used), value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    return { value, digest: createHash('sha256').update(raw).digest('hex') };
  } finally { await handle.close(); }
}
function adfText(value) {
  const content = [];
  for (const [index, line] of value.split(/\r?\n/).entries()) { if (index) content.push({ type: 'hardBreak' }); if (line) content.push({ type: 'text', text: line }); }
  return { type: 'paragraph', ...(content.length ? { content } : {}) };
}
function buildDescription(task) {
  return { type: 'doc', version: 1, content: [adfText(task.description), adfText(`Area: ${task.area}`), { type: 'bulletList', content: task.acceptance.map(item => ({ type: 'listItem', content: [adfText(item)] })) }, ...(task.estimateHours === null ? [] : [adfText(`Proposed estimate: ${task.estimateHours} hours`)])] };
}
async function prepare({ spec, recordPath, index, issueTypeId, config, tracker }) {
  if (!Number.isSafeInteger(index) || index < 1 || typeof issueTypeId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(issueTypeId) || config?.provider !== 'jira') throw new TypeError('Invalid subtask request');
  const [check, plan, identity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!check.matches || !check.sourceComplete || index > plan.tasks.length) throw new Error('Task plan or requirements context is incomplete or changed');
  const source = identity.value;
  if (source?.version !== 1 || source.provider !== 'jira' || typeof source.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(source.id) || source.source !== new URL(config.baseUrl).origin) throw new Error('Jira source identity mismatch');
  const task = plan.tasks[index - 1];
  if (task.title.length > 255 || /[\u0000-\u001f\u007f]/.test(task.title)) throw new Error('Invalid subtask title');
  const parent = await tracker.getTicket(source.id);
  if (parent?.provider !== 'jira' || typeof parent.key !== 'string' || parent.key.toLowerCase() !== source.id.toLowerCase() || typeof parent.updatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(parent.updatedAt)) throw new Error('Jira parent mismatch');
  const [afterCheck, afterPlan, afterIdentity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!afterCheck.matches || !afterCheck.sourceComplete || afterPlan.digest !== plan.digest || afterIdentity.digest !== identity.digest) throw new Error('Task source changed while preparing request');
  const request = { parent: source.id, issueTypeId, summary: task.title, description: buildDescription(task) };
  const digest = createHash('sha256').update(JSON.stringify({ origin: source.source, request, parentUpdatedAt: parent.updatedAt, taskPlanDigest: plan.digest, identityDigest: identity.digest })).digest('hex');
  return { request, digest, parentUpdatedAt: parent.updatedAt, taskPlanDigest: plan.digest, identityDigest: identity.digest, parent: source.id };
}

/** Preview or explicitly submit one reviewed Jira subtask; never retries a create. */
export async function processJiraSubtask({ spec, recordPath, index, issueTypeId, config, email, token, expectedDigest }, { makeTracker = createJiraTracker } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const tracker = makeTracker({ baseUrl: config?.baseUrl, email, token });
  const first = await prepare({ spec, recordPath, index, issueTypeId, config, tracker });
  if (expectedDigest === undefined) return { preview: first.request, parentUpdatedAt: first.parentUpdatedAt, digest: first.digest, scope: 'Reviewable proposal and current parent lookup only; no subtask was created. Jira configuration and remote state may change.' };
  if (first.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const final = await prepare({ spec, recordPath, index, issueTypeId, config, tracker });
  if (final.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const result = await tracker.createSubtask(final.request);
  return { ...result, scope: 'One Jira create request returned an identifier. Review the created subtask; the request may have changed state even if later checks fail.' };
}
