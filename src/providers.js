import { createGitHubClient } from './github.js';
import { createJiraTracker } from './jira.js';
import { createAdoTracker } from './ado.js';
import { createAdoScm } from './ado-scm.js';
import { createAdoCi } from './ado-ci.js';
import { createBitbucketClient } from './bitbucket.js';
import { createGitLabClient } from './gitlab.js';
import { createConfluenceClient } from './confluence.js';
import { fetchGitHubIssueContext } from './issue-context.js';

function githubClient(config, options) {
  return createGitHubClient({ owner: config.owner, repository: config.repository, token: options.token, ...(options.publicRead ? { publicRead: true } : {}), ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
}

/** Tracker, SCM and CI adapters can be chosen independently. */
export function createTrackerProvider(config, options = {}) {
  if (config?.provider === 'gitlab') {
    const client = createGitLabClient({ project: config.project, token: options.gitlabToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
    return { provider: 'gitlab', getTicket: client.getTicket };
  }
  if (config?.provider === 'ado') return createAdoTracker({ organization: config.organization, project: config.project, token: options.adoToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (config?.provider === 'jira') return createJiraTracker({ baseUrl: config.baseUrl, email: options.jiraEmail, token: options.jiraToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (config?.provider !== 'github') throw new Error('Unsupported tracker provider');
  const client = githubClient(config, options);
  return { provider: 'github', getTicket: number => fetchGitHubIssueContext({ client, number }) };
}

export function createScmProvider(config, options = {}) {
  if (config?.provider === 'gitlab') {
    const client = createGitLabClient({ project: config.project, token: options.gitlabToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
    return { provider: 'gitlab', listPullRequestsPage: client.listPullRequestsPage, getPullRequest: client.getPullRequest, getPullRequestComments: client.getPullRequestComments, listMergeRequestDiffs: client.listMergeRequestDiffs, getMergeRequestCommits: client.getMergeRequestCommits, createPullRequest: client.createPullRequest };
  }
  if (config?.provider === 'bitbucket-cloud') {
    const client = createBitbucketClient({ workspace: config.workspace, repository: config.repository, token: options.bitbucketToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
    return { provider: 'bitbucket-cloud', listPullRequestsPage: client.listPullRequestsPage, getPullRequest: client.getPullRequest, getPullRequestStatuses: client.getPullRequestStatuses, getPullRequestCommits: client.getPullRequestCommits, getPullRequestDiffstat: client.getPullRequestDiffstat, getPullRequestComments: client.getPullRequestComments, getRepository: client.getRepository, createPullRequest: client.createPullRequest };
  }
  if (config?.provider === 'ado') return createAdoScm({ organization: config.organization, project: config.project, repository: config.repository, token: options.adoToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (config?.provider !== 'github') throw new Error('Unsupported SCM provider');
  const client = githubClient(config, options);
  return { provider: 'github', listPullRequestsPage: client.listPullRequestsPage, getPullRequest: number => client.getPullRequest(number), listPullRequestFiles: client.listPullRequestFiles, listPullRequestCommits: client.listPullRequestCommits, listIssueComments: client.listIssueComments, listReviewComments: client.listReviewComments, listReviews: client.listReviews, createPullRequest: input => client.createPullRequest(input) };
}

export function createCiProvider(config, options = {}) {
  if (config?.provider === 'ado-pipelines') return createAdoCi({ organization: config.organization, project: config.project, token: options.adoToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
  if (config?.provider === 'gitlab-ci') {
    const client = createGitLabClient({ project: config.project, token: options.gitlabToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
    return { provider: 'gitlab-ci', dispatchPipeline: client.dispatchPipeline, listPipelines: client.listPipelines, listAllPipelines: client.listAllPipelines, getPipeline: client.getPipeline, listPipelineJobs: client.listPipelineJobs, getJob: client.getJob, getJobTrace: client.getJobTrace };
  }
  if (config?.provider === 'bitbucket-pipelines') {
    const client = createBitbucketClient({ workspace: config.workspace, repository: config.repository, token: options.bitbucketToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
    return { provider: 'bitbucket-pipelines', getPipeline: client.getPipeline, getPipelineSteps: client.getPipelineSteps, dispatchPipeline: client.dispatchPipeline, getCommitStatuses: client.getCommitStatuses, getAllCommitStatuses: client.getAllCommitStatuses };
  }
  if (config?.provider !== 'github-actions') throw new Error('Unsupported CI provider');
  const client = githubClient(config, options);
  return { provider: 'github-actions', listCheckRuns: (sha, page) => client.listCheckRuns(sha, page), getCommitStatus: (sha, page) => client.getCommitStatus(sha, page), listWorkflowRuns: options => client.listWorkflowRuns(options), getWorkflowRun: id => client.getWorkflowRun(id), listWorkflowRunJobs: (id, options) => client.listWorkflowRunJobs(id, options), dispatchWorkflow: input => client.dispatchWorkflow(input) };
}

export function createDocumentationProvider(config, options = {}) {
  if (config?.provider !== 'confluence') throw new Error('Unsupported documentation provider');
  return createConfluenceClient({ baseUrl: config.baseUrl, email: options.confluenceEmail, token: options.confluenceToken, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}) });
}

export function createProviderSet(config, options = {}) {
  if (!config || typeof config !== 'object') throw new TypeError('Provider configuration is required');
  return { tracker: createTrackerProvider(config.tracker, options), scm: createScmProvider(config.scm, options), ci: createCiProvider(config.ci, options), ...(config.documentation ? { documentation: createDocumentationProvider(config.documentation, options) } : {}) };
}
