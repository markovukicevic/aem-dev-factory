import { createHash } from 'node:crypto';
import { checkTaskPlan, readTaskPlan } from './task-plan.js';
import { readTaskSourceIdentity } from './jira-subtask.js';
import { createGitHubClient } from './github.js';

const escape = value => value.replace(/([\\`*_{}\[\]()#+.!|~-])/g, '\\$1').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@/g, '&#64;');
function body(task) {
  return `${escape(task.description)}\n\nArea: ${escape(task.area)}\n\n## Acceptance criteria\n\n${task.acceptance.map(item => `- ${escape(item)}`).join('\n')}\n${task.estimateHours === null ? '' : `\nProposed estimate: ${task.estimateHours} hours\n`}`;
}
async function prepare({ spec, recordPath, index, config, client }) {
  if (!Number.isSafeInteger(index) || index < 1 || config?.provider !== 'github') throw new TypeError('Invalid GitHub sub-issue request');
  const [check, plan, identity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!check.matches || !check.sourceComplete || index > plan.tasks.length) throw new Error('Task plan or requirements context is incomplete or changed');
  const source = identity.value, match = /^github-([1-9][0-9]*)$/.exec(source?.id ?? ''), repository = `${config.owner}/${config.repository}`.toLowerCase();
  if (source?.version !== 1 || source.provider !== 'github' || !match || !Number.isSafeInteger(Number(match[1])) || source.source !== repository) throw new Error('GitHub source identity mismatch');
  const task = plan.tasks[index - 1];
  if (task.title.length > 255 || /[\u0000-\u001f\u007f]/.test(task.title)) throw new Error('Invalid issue title');
  const parent = Number(match[1]), issue = await client.getIssue(parent);
  if (!issue || issue.number !== parent || !Number.isSafeInteger(issue.id) || issue.id < 1 || issue.pull_request || typeof issue.updated_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(issue.updated_at)) throw new Error('GitHub parent issue unavailable');
  const [afterCheck, afterPlan, afterIdentity] = await Promise.all([checkTaskPlan({ path: spec, recordPath }), readTaskPlan(recordPath), readTaskSourceIdentity(spec)]);
  if (!afterCheck.matches || !afterCheck.sourceComplete || afterPlan.digest !== plan.digest || afterIdentity.digest !== identity.digest) throw new Error('Task source changed while preparing request');
  const request = { parent, title: task.title, body: body(task) };
  const digest = createHash('sha256').update(JSON.stringify({ repository, request, parentId: issue.id, parentUpdatedAt: issue.updated_at, taskPlanDigest: plan.digest, identityDigest: identity.digest })).digest('hex');
  return { request, digest };
}

/** Create then link one issue; report partial success without retrying writes. */
export async function processGitHubSubtask({ spec, recordPath, index, config, token, expectedDigest }, { makeClient = createGitHubClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ owner: config?.owner, repository: config?.repository, token });
  const first = await prepare({ spec, recordPath, index, config, client });
  if (expectedDigest === undefined) return { preview: first.request, digest: first.digest, scope: 'Reviewable proposal and parent lookup only; no issue was created. GitHub state may change.' };
  if (first.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const final = await prepare({ spec, recordPath, index, config, client });
  if (final.digest !== expectedDigest) return { created: false, reason: 'preview-changed' };
  const child = await client.createIssue({ title: final.request.title, body: final.request.body });
  const url = `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/issues/${child.number}`;
  try {
    const recheck = await prepare({ spec, recordPath, index, config, client });
    if (recheck.digest !== expectedDigest) return { created: true, linked: false, number: child.number, url, reason: 'source-or-parent-changed', scope: 'Issue exists; inspect it and the parent before taking further action.' };
    await client.addSubIssue({ parent: final.request.parent, issueId: child.id });
    return { created: true, linked: true, number: child.number, url, scope: 'Create and link requests returned success; inspect the resulting issue and relationship.' };
  } catch { return { created: true, linked: false, number: child.number, url, reason: 'link-failed-or-unclear', scope: 'Issue exists and the link may or may not exist; inspect GitHub before retrying or taking further action.' }; }
}
