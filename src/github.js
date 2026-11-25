import { branchRef } from './git-ref.js';

/** Construct a GitHub repository REST endpoint without allowing path injection. */
export function githubRepositoryPath(owner, repository) {
  for (const [name, value] of Object.entries({ owner, repository })) {
    if (typeof value !== 'string' || value.trim() !== value || !value || /[\\/\s?#]/u.test(value) || value === '.' || value === '..') {
      throw new TypeError(`${name} must be a non-empty GitHub path segment`);
    }
  }
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
}

function validateNumber(number, name) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`${name} must be a positive integer`);
}

function pageQuery(page, perPage) {
  validateNumber(page, 'page');
  validateNumber(perPage, 'perPage');
  if (perPage > 100) throw new TypeError('perPage must be at most 100');
  return `?per_page=${perPage}&page=${page}`;
}

/** A minimal GitHub Cloud pull request client with an injectable transport. */
export function createGitHubClient({ owner, repository, token, publicRead = false, fetchImpl = globalThis.fetch }) {
  const path = githubRepositoryPath(owner, repository);
  if (typeof publicRead !== 'boolean' || (publicRead ? token !== undefined : typeof token !== 'string' || !token.trim())) throw new TypeError('A token or explicit public read is required');
  const requireToken = () => { if (publicRead) throw new Error('Public GitHub access is read-only'); };
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  async function request(method, suffix, body) {
    if (method !== 'GET') requireToken();
    const response = await fetchImpl(`https://api.github.com${path}${suffix}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        ...(publicRead ? {} : { Authorization: `Bearer ${token}` }),
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
    });
    if (!response.ok) {
      const error = new Error(`GitHub request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  return {
    getIssue(number) {
      validateNumber(number, 'issue number');
      return request('GET', `/issues/${number}`);
    },
    async updateIssueState({ number, state }) {
      validateNumber(number, 'issue number');
      if (!['open', 'closed'].includes(state)) throw new TypeError('Invalid issue state');
      const result = await request('PATCH', `/issues/${number}`, { state });
      if (result?.number !== number || result.pull_request || result.state !== state) throw new Error('Issue update unclear; inspect GitHub before retrying');
      return { updated: true, state: result.state };
    },
    async createIssue({ title, body }) {
      if (typeof title !== 'string' || !title.trim() || title.length > 255 || /[\u0000-\u001f\u007f]/.test(title) || typeof body !== 'string' || body.length > 262144) throw new TypeError('Invalid issue');
      const result = await request('POST', '/issues', { title, body });
      if (!Number.isSafeInteger(result?.id) || result.id < 1 || !Number.isSafeInteger(result?.number) || result.number < 1 || result.pull_request) throw new Error('Issue response unclear; inspect GitHub before retrying');
      return { id: result.id, number: result.number };
    },
    async addSubIssue({ parent, issueId }) {
      validateNumber(parent, 'parent issue number'); validateNumber(issueId, 'sub-issue ID');
      const result = await request('POST', `/issues/${parent}/sub_issues`, { sub_issue_id: issueId });
      if (!result || result.id !== issueId) throw new Error('Sub-issue link response unclear; inspect GitHub before retrying');
      return { linked: true };
    },
    async createInlineComment({ number, path, side, line, commit, body }) {
      validateNumber(number, 'pull request number'); validateNumber(line, 'line');
      if (typeof path !== 'string' || !path || path.length > 1024 || path.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..') || !['LEFT', 'RIGHT'].includes(side) || typeof commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(commit) || typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid inline comment');
      const result = await request('POST', `/pulls/${number}/comments`, { body, commit_id: commit, path, side, line });
      if (!Number.isSafeInteger(result?.id) || result.id < 1) throw new Error('Comment response unclear; inspect GitHub before retrying');
      return { sent: true, id: result.id };
    },
    async submitPullRequestReview({ number, event, commit, body }) {
      validateNumber(number, 'pull request number');
      if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event) || typeof commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(commit) || typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid review');
      const result = await request('POST', `/pulls/${number}/reviews`, { commit_id: commit, event, body });
      const state = { APPROVE: 'APPROVED', REQUEST_CHANGES: 'CHANGES_REQUESTED', COMMENT: 'COMMENTED' }[event];
      if (!Number.isSafeInteger(result?.id) || result.id < 1 || result.commit_id !== commit || result.state !== state) throw new Error('Review response unclear; inspect GitHub before retrying');
      return { submitted: true, id: result.id, state: result.state, commit: result.commit_id };
    },
    getReviewComment(id) {
      validateNumber(id, 'review comment ID');
      return request('GET', `/pulls/comments/${id}`);
    },
    async createIssueComment({ number, body }) {
      validateNumber(number, 'issue number');
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid comment');
      const result = await request('POST', `/issues/${number}/comments`, { body });
      if (!Number.isSafeInteger(result?.id) || result.id < 1) throw new Error('Comment response unclear; inspect GitHub before retrying');
      return { sent: true, id: result.id };
    },
    async replyReviewComment({ number, commentId, body }) {
      validateNumber(number, 'pull request number'); validateNumber(commentId, 'review comment ID');
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid reply');
      const result = await request('POST', `/pulls/${number}/comments/${commentId}/replies`, { body });
      if (!Number.isSafeInteger(result?.id) || result.id < 1) throw new Error('Reply response unclear; inspect GitHub before retrying');
      return { sent: true, id: result.id };
    },
    getPullRequest(number) {
      validateNumber(number, 'pull request number');
      return request('GET', `/pulls/${number}`);
    },
    listPullRequestCommits(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'pull request number');
      return request('GET', `/pulls/${number}/commits${pageQuery(page, perPage)}`);
    },
    listPullRequestFiles(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'pull request number');
      return request('GET', `/pulls/${number}/files${pageQuery(page, perPage)}`);
    },
    listReviews(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'pull request number');
      return request('GET', `/pulls/${number}/reviews${pageQuery(page, perPage)}`);
    },
    listReviewComments(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'pull request number');
      return request('GET', `/pulls/${number}/comments${pageQuery(page, perPage)}`);
    },
    listIssueComments(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'pull request number');
      return request('GET', `/issues/${number}/comments${pageQuery(page, perPage)}`);
    },
    async dispatchWorkflow({ workflow, ref, inputs = {} }) {
      if (typeof workflow !== 'string' || !/^(?:[1-9][0-9]*|[A-Za-z0-9_][A-Za-z0-9_.-]*\.ya?ml)$/.test(workflow) || workflow.includes('..')) throw new TypeError('Invalid workflow ID or file name');
      branchRef(ref);
      if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || Object.keys(inputs).length > 25 || Object.values(inputs).some(value => !['string', 'boolean', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))) throw new TypeError('Invalid workflow inputs');
      await request('POST', `/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { ref, inputs });
      return { accepted: true, runId: null };
    },
    listWorkflowRuns({ sha, page = 1, perPage = 100 } = {}) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new TypeError('sha must be a hexadecimal commit SHA');
      const query = new URLSearchParams({ head_sha: sha, per_page: String(perPage), page: String(page) });
      pageQuery(page, perPage);
      return request('GET', `/actions/runs?${query}`);
    },
    getWorkflowJob(id) { validateNumber(id, 'workflow job ID'); return request('GET', `/actions/jobs/${id}`); },
    async getWorkflowJobLogRedirect(id) {
      validateNumber(id, 'workflow job ID');
      const response = await fetchImpl(`https://api.github.com${path}/actions/jobs/${id}/logs`, { method: 'GET', headers: { Accept: 'application/vnd.github+json', ...(publicRead ? {} : { Authorization: `Bearer ${token}` }), 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (response.status !== 302 || response.redirected) throw new Error('Unexpected GitHub log redirect');
      const location = response.headers?.get?.('location');
      if (typeof location !== 'string' || !location || location.length > 8192) throw new Error('GitHub log redirect unavailable');
      return location;
    },
    async cancelWorkflowRun(id) {
      requireToken();
      validateNumber(id, 'workflow run ID');
      const response = await fetchImpl(`https://api.github.com${path}/actions/runs/${id}/cancel`, { method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (response.status !== 202 || response.redirected) throw new Error('Cancel response unclear; inspect GitHub before retrying');
      return { accepted: true };
    },
    async retryFailedWorkflowJobs(id) {
      requireToken();
      validateNumber(id, 'workflow run ID');
      const response = await fetchImpl(`https://api.github.com${path}/actions/runs/${id}/rerun-failed-jobs`, { method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (response.status !== 201 || response.redirected) throw new Error('Retry response unclear; inspect GitHub before retrying');
      return { accepted: true };
    },
    listWorkflowRunJobs(number, { page = 1, perPage = 100 } = {}) {
      validateNumber(number, 'workflow run ID');
      return request('GET', `/actions/runs/${number}/jobs${pageQuery(page, perPage)}&filter=latest`);
    },
    getWorkflowRun(number) {
      validateNumber(number, 'workflow run ID');
      return request('GET', `/actions/runs/${number}`);
    },
    listCheckRuns(sha, { page = 1, perPage = 100 } = {}) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new TypeError('sha must be a hexadecimal commit SHA');
      return request('GET', `/commits/${sha}/check-runs${pageQuery(page, perPage)}`);
    },
    getCommitStatus(sha, options) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new TypeError('sha must be a hexadecimal commit SHA');
      const query = options === undefined ? '' : pageQuery(options.page ?? 1, options.perPage ?? 100);
      return request('GET', `/commits/${sha}/status${query}`);
    },
    listPullRequestsPage() { return request('GET', '/pulls?state=open&per_page=20&page=1'); },
    listOpenPullRequests({ owner: headOwner, head, base }) {
      if ([headOwner, head, base].some(value => typeof value !== 'string' || !value.trim())) throw new TypeError('owner, head and base are required');
      const query = new URLSearchParams({ state: 'open', head: `${headOwner}:${head}`, base, per_page: '100' });
      return request('GET', `/pulls?${query}`);
    },
    createPullRequest({ title, head, base, body = '', draft = false }) {
      for (const [name, value] of Object.entries({ title, head, base })) {
        if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required`);
      }
      if (typeof body !== 'string' || typeof draft !== 'boolean') throw new TypeError('invalid pull request body or draft flag');
      return request('POST', '/pulls', { title, head, base, body, draft });
    },
  };
}
