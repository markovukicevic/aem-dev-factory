import { readGitHubCiSummary } from './github-ci-summary.js';
import { readAzureCommitBuilds } from './ado-commit-builds.js';

/** Report observed provider states without deciding whether branch policy is satisfied. */
export async function readCiObservations({ ci, sha, branch }) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) throw new TypeError('A full Git commit SHA is required');
  if (ci?.provider !== 'ado-pipelines' && branch !== undefined) throw new TypeError('Branch is supported only for Azure Pipelines');
  if (ci?.provider === 'github-actions') {
    const summary = await readGitHubCiSummary(ci, sha);
    return { provider: ci.provider, sha, summary, scope: 'Observed GitHub checks and statuses only; required branch policy is not evaluated.' };
  }
  let values, scope, paginationComplete = true, unattributed = 0;
  if (ci?.provider === 'gitlab-ci') {
    values = await ci.listAllPipelines(sha);
    if (!Array.isArray(values)) throw new Error('Invalid GitLab pipeline response');
    for (const item of values) if (!item || typeof item.sha !== 'string' || item.sha.toLowerCase() !== sha.toLowerCase()) throw new Error('GitLab pipeline commit does not match');
    scope = 'Observed GitLab pipelines for the configured project and exact SHA; required checks and branch policy are not evaluated.';
  } else if (ci?.provider === 'bitbucket-pipelines') {
    values = await ci.getAllCommitStatuses(sha);
    if (!Array.isArray(values)) throw new Error('Invalid Bitbucket status response');
    scope = 'Observed Bitbucket commit statuses for the configured repository; status-to-commit identity, required checks and branch policy are not independently verified.';
  } else if (ci?.provider === 'ado-pipelines') {
    if (typeof branch !== 'string' || !branch.trim()) throw new TypeError('Azure branch is required');
    const result = await readAzureCommitBuilds({ ci, branch, sha });
    values = result.builds; paginationComplete = result.paginationComplete; unattributed = result.unattributedBuilds;
    scope = 'Observed Azure project-wide builds for branch and exact source version; repository identity, required checks and branch policy are not verified.';
  } else throw new TypeError('Unsupported CI provider');
  if (values.length > 10000) throw new Error('CI observation limit exceeded');
  const key = ci.provider === 'gitlab-ci' ? 'status' : ci.provider === 'bitbucket-pipelines' ? 'state' : 'result';
  const counts = new Map();
  for (const item of values) {
    const raw = item?.[key];
    const state = typeof raw === 'string' && raw.trim() && raw.length <= 100 && !/[\u0000-\u001f]/.test(raw) ? raw : 'unknown';
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return { provider: ci.provider, sha, ...(branch === undefined ? {} : { branch }), count: values.length, states: [...counts].map(([state, count]) => ({ state, count })).sort((a, b) => a.state.localeCompare(b.state)), paginationComplete, unattributed, scope };
}
