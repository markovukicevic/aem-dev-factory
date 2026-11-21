import { branchRef } from './git-ref.js';

/** GitLab.com REST client. Self-managed instances are a separate target. */
export function createGitLabClient({ project, token, fetchImpl = globalThis.fetch, maxPages = 10 }) {
  if (typeof project !== 'string' || project.split('/').length < 2 || project.split('/').some(segment => !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(segment) || segment === '.' || segment === '..')) throw new TypeError('Invalid GitLab project path');
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('GitLab access token is required');
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid GitLab client options');
  const root = `https://gitlab.com/api/v4/projects/${encodeURIComponent(project)}`;
  async function request(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`${root}${path}`, { method, headers: { Accept: 'application/json', 'PRIVATE-TOKEN': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error' });
    if (!response.ok) {
      const error = new Error(`GitLab request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return { data: await response.json(), headers: response.headers };
  }
  const get = path => request(path);
  function iid(value) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid GitLab IID');
  }
  async function notes(type, number) {
    iid(number);
    let page = 1;
    const seen = new Set();
    const values = [];
    for (let count = 0; count < maxPages; count++) {
      if (seen.has(page)) throw new Error('GitLab pagination repeated');
      seen.add(page);
      const { data, headers } = await get(`/${type}/${number}/notes?per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.length > 100) throw new Error('Invalid GitLab notes response');
      values.push(...data);
      const next = headers?.get?.('x-next-page');
      if (next !== null && next !== undefined && next !== '') {
        if (!/^[1-9][0-9]*$/.test(next) || !Number.isSafeInteger(Number(next)) || Number(next) <= page) throw new Error('Invalid GitLab next page');
        page = Number(next);
      } else if (data.length === 100) page++;
      else return values;
    }
    throw new Error('GitLab page limit reached; context is incomplete');
  }
  async function listAllPipelines(sha) {
    if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new TypeError('Invalid GitLab pipeline query');
    let page = 1;
    const values = [];
    for (let count = 0; count < maxPages; count++) {
      const query = new URLSearchParams({ sha, page: String(page), per_page: '100' });
      const { data, headers } = await get(`/pipelines?${query}`);
      if (!Array.isArray(data) || data.length > 100) throw new Error('Invalid GitLab pipelines response');
      values.push(...data);
      const next = headers?.get?.('x-next-page');
      if (next !== null && next !== undefined && next !== '') {
        if (!/^[1-9][0-9]*$/.test(next) || !Number.isSafeInteger(Number(next)) || Number(next) <= page) throw new Error('Invalid GitLab next page');
        page = Number(next);
      } else if (data.length === 100) page++;
      else return values;
    }
    throw new Error('GitLab page limit reached; pipelines are incomplete');
  }
  return {
    listAllPipelines,
    async getTicket(number) {
      iid(number);
      const { data: issue } = await get(`/issues/${number}`);
      if (!issue || issue.iid !== number || typeof issue.title !== 'string') throw new Error('Invalid GitLab issue response');
      const rawNotes = await notes('issues', number);
      const comments = rawNotes.filter(note => !note.system).map(note => {
        if (!Number.isSafeInteger(note.id) || typeof note.body !== 'string') throw new Error('Invalid GitLab note');
        return { id: note.id, author: note.author?.username ?? null, body: note.body, createdAt: note.created_at ?? null, updatedAt: note.updated_at ?? null };
      });
      return { provider: 'gitlab', number, title: issue.title, body: issue.description ?? '', bodyFormat: 'markdown', state: issue.state ?? null, author: issue.author?.username ?? null, labels: Array.isArray(issue.labels) ? issue.labels : [], url: issue.web_url ?? null, comments };
    },
    async getPullRequest(number) { iid(number); return (await get(`/merge_requests/${number}`)).data; },
    async listMergeRequestDiffs(number, { page = 1, perPage = 100 } = {}) {
      iid(number);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new TypeError('Invalid GitLab diff page');
      const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      const result = await get(`/merge_requests/${number}/diffs?${query}`);
      if (!Array.isArray(result.data) || result.data.length > perPage) throw new Error('Invalid GitLab diff page');
      return { values: result.data, nextPage: result.headers?.get?.('x-next-page') || null };
    },
    getPullRequestComments(number) { return notes('merge_requests', number); },
    async listOpenPullRequests({ head, base }) {
      branchRef(head);
      branchRef(base);
      const results = [];
      let page = 1;
      for (let count = 0; count < maxPages; count++) {
        const query = new URLSearchParams({ state: 'opened', scope: 'all', source_branch: head, target_branch: base, per_page: '100', page: String(page) });
        const result = await get(`/merge_requests?${query}`);
        if (!Array.isArray(result.data) || result.data.length > 100) throw new Error('Invalid GitLab merge request response');
        results.push(...result.data);
        const next = result.headers?.get?.('x-next-page');
        if (next !== null && next !== undefined && next !== '') {
          if (!/^[1-9][0-9]*$/.test(next) || !Number.isSafeInteger(Number(next)) || Number(next) <= page) throw new Error('Invalid GitLab next page');
          page = Number(next);
        } else if (result.data.length === 100) page++;
        else return results;
      }
      throw new Error('GitLab merge request limit reached; context is incomplete');
    },
    async createPullRequest({ title, head, base, body = '', draft = false }) {
      if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || typeof draft !== 'boolean') throw new TypeError('Invalid merge request fields');
      branchRef(head);
      branchRef(base);
      if (head === base) throw new TypeError('Source and target branches must differ');
      if (!draft && /^(?:draft:|\[draft\]|\(draft\))/i.test(title.trim())) throw new TypeError('Draft title conflicts with draft flag');
      const finalTitle = draft && !/^(?:draft:|\[draft\]|\(draft\))/i.test(title.trim()) ? `Draft: ${title}` : title;
      return (await request('/merge_requests', { method: 'POST', body: { source_branch: head, target_branch: base, title: finalTitle, description: body, remove_source_branch: false } })).data;
    },
    async getPipeline(id) { iid(id); return (await get(`/pipelines/${id}`)).data; },
    async listPipelines({ sha, page = 1, perPage = 100 } = {}) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha) || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new TypeError('Invalid GitLab pipeline query');
      const query = new URLSearchParams({ sha, page: String(page), per_page: String(perPage) });
      const result = await get(`/pipelines?${query}`);
      if (!Array.isArray(result.data)) throw new Error('Invalid GitLab pipelines response');
      return { values: result.data, nextPage: result.headers?.get?.('x-next-page') || null, requestedPage: page };
    },
  };
}
