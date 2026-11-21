import { createGitHubClient } from './github.js';
import { createJiraTracker } from './jira.js';
import { createAdoTracker } from './ado.js';
import { createAdoScm } from './ado-scm.js';
import { fetchGitHubIssueContext } from './issue-context.js';

function githubClient(config, options) {
  return createGitHubClient({ owner: config.owner, repository: config.repository, token: options.token, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
}

/** Tracker, SCM and CI adapters can be chosen independently. */
export function createTrackerProvider(config, options = {}) {
  if (config?.provider === 'ado') return createAdoTracker({ organization: config.organization, project: config.project, token: options.adoToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (config?.provider === 'jira') return createJiraTracker({ baseUrl: config.baseUrl, email: options.jiraEmail, token: options.jiraToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (config?.provider !== 'github') throw new Error('Unsupported tracker provider');
  const client = githubClient(config, options);
  return { provider: 'github', getTicket: number => fetchGitHubIssueContext({ client, number }) };
}

export function createScmProvider(config, options = {}) {
  if (config?.provider === 'ado') return createAdoScm({ organization: config.organization, project: config.project, repository: config.repository, token: options.adoToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (config?.provider !== 'github') throw new Error('Unsupported SCM provider');
  const client = githubClient(config, options);
  return { provider: 'github', getPullRequest: number => client.getPullRequest(number), createPullRequest: input => client.createPullRequest(input) };
}

export function createCiProvider(config, options = {}) {
  if (config?.provider !== 'github-actions') throw new Error('Unsupported CI provider');
  const client = githubClient(config, options);
  return { provider: 'github-actions', listCheckRuns: (sha, page) => client.listCheckRuns(sha, page), getCommitStatus: sha => client.getCommitStatus(sha), listWorkflowRuns: options => client.listWorkflowRuns(options), getWorkflowRun: id => client.getWorkflowRun(id) };
}

export function createProviderSet(config, options = {}) {
  if (!config || typeof config !== 'object') throw new TypeError('Provider configuration is required');
  return { tracker: createTrackerProvider(config.tracker, options), scm: createScmProvider(config.scm, options), ci: createCiProvider(config.ci, options) };
}
