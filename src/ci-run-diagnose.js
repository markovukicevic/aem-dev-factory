import { readGitHubRunJobs } from './github-ci-jobs.js';
import { readGitLabPipelineJobs } from './gitlab-ci-jobs.js';
import { readAzureBuildTimeline } from './ado-ci-timeline.js';
import { readBitbucketPipelineSteps } from './bitbucket-ci-steps.js';
/** Summarize reported problem candidates for one explicitly selected CI run. */
export async function diagnoseCiRun({ ci, id }) {
  let result, records, stateKey, idKey, complete;
  if (ci?.provider === 'github-actions') { result = await readGitHubRunJobs({ ci, runId: id }); records = result.jobs; stateKey = 'conclusion'; idKey = 'id'; complete = result.complete; }
  else if (ci?.provider === 'gitlab-ci') { result = await readGitLabPipelineJobs({ ci, pipelineId: id }); records = result.jobs; stateKey = 'status'; idKey = 'id'; complete = result.complete; }
  else if (ci?.provider === 'ado-pipelines') { result = await readAzureBuildTimeline({ ci, buildId: id }); records = result.records; stateKey = 'result'; idKey = 'id'; complete = null; }
  else if (ci?.provider === 'bitbucket-pipelines') { result = await readBitbucketPipelineSteps({ ci, pipelineId: id }); records = result.steps; stateKey = 'result'; idKey = 'id'; complete = true; }
  else throw new TypeError('Unsupported CI provider');
  const flagged = new Set(['failure', 'failed', 'error', 'timed_out', 'canceled', 'cancelled', 'abandoned', 'action_required', 'succeededwithissues']);
  const candidates = records.filter(item => typeof item[stateKey] === 'string' && flagged.has(item[stateKey].toLowerCase())).map(item => ({ id: item[idKey], name: item.name ?? null, reportedResult: item[stateKey], ...(item.stage ? { stage: item.stage } : {}), ...(item.failureReason ? { failureReason: item.failureReason } : {}), ...(item.logId ? { logId: item.logId } : {}), ...(item.steps ? { flaggedSteps: item.steps.filter(step => typeof step.conclusion === 'string' && flagged.has(step.conclusion.toLowerCase())).map(step => ({ number: step.number, name: step.name, conclusion: step.conclusion })) } : {}) }));
  return { provider: ci.provider, id, commit: result.head ?? result.sha ?? result.sourceVersion ?? result.commit ?? null, status: result.status ?? result.state ?? null, result: result.conclusion ?? result.result ?? null, candidates, complete, changedDuringInspection: result.runStatusChanged ?? result.pipelineStatusChanged ?? result.buildStatusChanged ?? null, providerEvidence: result, scope: 'Provider-reported problem candidates only; an empty list is not proof of success, complete coverage, root cause or branch policy.' };
}
