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
  async function graphql(query, variables) {
    const response = await fetchImpl('https://gitlab.com/api/graphql', { method: 'POST', headers: { Accept: 'application/json', 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), redirect: 'error' });
    if (!response.ok) throw new Error(`GitLab GraphQL request failed (${response.status})`);
    return response.json();
  }

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
    async getWorkItem(number) {
      iid(number);
      const query = 'query Parent($path: ID!, $iid: String!) { namespace(fullPath: $path) { fullPath workItem(iid: $iid) { id iid updatedAt } } }';
      const result = await graphql(query, { path: project, iid: String(number) });
      const namespace = result?.data?.namespace, item = namespace?.workItem;
      if (result?.errors?.length || namespace?.fullPath !== project || !/^gid:\/\/gitlab\/WorkItem\/[1-9][0-9]*$/.test(item?.id ?? '') || item.iid !== String(number) || typeof item.updatedAt !== 'string' || item.updatedAt.length > 64) throw new Error('GitLab work item unavailable or mismatched');
      return { id: item.id, iid: number, updatedAt: item.updatedAt };
    },
    async createChildWorkItem({ parentId, workItemTypeId, title, description }) {
      if (typeof parentId !== 'string' || !/^gid:\/\/gitlab\/WorkItem\/[1-9][0-9]*$/.test(parentId) || typeof workItemTypeId !== 'string' || !/^gid:\/\/gitlab\/WorkItems::Type\/[1-9][0-9]*$/.test(workItemTypeId) || typeof title !== 'string' || !title.trim() || title.length > 255 || /[\u0000-\u001f\u007f]/.test(title) || typeof description !== 'string' || !description.trim() || description.length > 262144) throw new TypeError('Invalid GitLab child work item');
      const query = 'mutation CreateChild($input: WorkItemCreateInput!) { workItemCreate(input: $input) { errors workItem { id iid widgets { __typename ... on WorkItemWidgetHierarchy { parent { id } } } } } }';
      const variables = { input: { namespacePath: project, title, workItemTypeId, hierarchyWidget: { parentId }, descriptionWidget: { description } } };
      const response = await graphql(query, variables), data = response?.data?.workItemCreate, item = data?.workItem;
      if (!item || !/^gid:\/\/gitlab\/WorkItem\/[1-9][0-9]*$/.test(item.id ?? '') || !/^[1-9][0-9]*$/.test(item.iid ?? '') || !Number.isSafeInteger(Number(item.iid))) throw new Error('Work item response unclear; inspect GitLab before retrying');
      const hierarchy = Array.isArray(item.widgets) ? item.widgets.find(widget => widget?.__typename === 'WorkItemWidgetHierarchy') : null;
      return { created: true, iid: Number(item.iid), linked: !response?.errors?.length && Array.isArray(data.errors) && data.errors.length === 0 && hierarchy?.parent?.id === parentId };
    },
    async updateIssueState({ number, state }) {
      iid(number);
      if (!['opened', 'closed'].includes(state)) throw new TypeError('Invalid issue state');
      const result = (await request(`/issues/${number}`, { method: 'PUT', body: { state_event: state === 'opened' ? 'reopen' : 'close' } })).data;
      if (result?.iid !== number || result.state !== state) throw new Error('Issue update unclear; inspect GitLab before retrying');
      return { updated: true, state: result.state };
    },
    async getIssueMetadata(number) { iid(number); return (await get(`/issues/${number}`)).data; },
    async getMergeRequestDiscussions(number) {
      iid(number);
      let page = 1;
      const values = [];
      for (let count = 0; count < maxPages; count++) {
        const { data, headers } = await get(`/merge_requests/${number}/discussions?per_page=100&page=${page}`);
        if (!Array.isArray(data) || data.length > 100) throw new Error('Invalid GitLab discussions response');
        values.push(...data);
        const next = headers?.get?.('x-next-page');
        if (next !== null && next !== undefined && next !== '') {
          if (!/^[1-9][0-9]*$/.test(next) || !Number.isSafeInteger(Number(next)) || Number(next) <= page) throw new Error('Invalid GitLab next page');
          page = Number(next);
        } else if (data.length === 100) page++;
        else return values;
      }
      throw new Error('GitLab page limit reached; discussions are incomplete');
    },
    async getMergeRequestDiscussion(number, discussionId) {
      iid(number);
      if (typeof discussionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(discussionId)) throw new TypeError('Invalid GitLab discussion ID');
      return (await get(`/merge_requests/${number}/discussions/${discussionId}`)).data;
    },
    async createIssueNote({ number, body }) {
      iid(number);
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid GitLab note');
      const data = (await request(`/issues/${number}/notes`, { method: 'POST', body: { body } })).data;
      if (!Number.isSafeInteger(data?.id) || data.id < 1) throw new Error('Note response unclear; inspect GitLab before retrying');
      return { sent: true, id: data.id };
    },
    async createInlineDiscussion({ number, body, position }) {
      iid(number);
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536 || !position || position.position_type !== 'text' || !['base_sha', 'head_sha', 'start_sha'].every(key => typeof position[key] === 'string' && /^[a-f0-9]{40,64}$/i.test(position[key])) || !['old_path', 'new_path'].every(key => typeof position[key] === 'string' && position[key].length > 0 && position[key].length <= 1024 && !position[key].startsWith('/') && !/[\u0000-\u001f\u007f\\]/.test(position[key]) && position[key].split('/').every(part => part && part !== '.' && part !== '..')) || !['old_line', 'new_line'].some(key => Number.isSafeInteger(position[key]) && position[key] > 0) || ['old_line', 'new_line'].some(key => position[key] !== undefined && (!Number.isSafeInteger(position[key]) || position[key] < 1))) throw new TypeError('Invalid GitLab diff discussion');
      const payload = { position_type: position.position_type, base_sha: position.base_sha, head_sha: position.head_sha, start_sha: position.start_sha, old_path: position.old_path, new_path: position.new_path, ...(position.old_line === undefined ? {} : { old_line: position.old_line }), ...(position.new_line === undefined ? {} : { new_line: position.new_line }) };
      const result = (await request(`/merge_requests/${number}/discussions`, { method: 'POST', body: { body, position: payload } })).data;
      if (typeof result?.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(result.id)) throw new Error('Discussion response unclear; inspect GitLab before retrying');
      return { sent: true, discussionId: result.id };
    },
    async createPullRequestComment({ number, body }) {
      iid(number);
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid merge request comment');
      const data = (await request(`/merge_requests/${number}/notes`, { method: 'POST', body: { body } })).data;
      if (!Number.isSafeInteger(data?.id) || data.id < 1) throw new Error('Comment response unclear; inspect GitLab before retrying');
      return { sent: true, id: data.id };
    },
    async replyMergeRequestDiscussion({ number, discussionId, body }) {
      iid(number);
      if (typeof discussionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(discussionId) || typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid GitLab discussion reply');
      const data = (await request(`/merge_requests/${number}/discussions/${discussionId}/notes`, { method: 'POST', body: { body } })).data;
      if (!Number.isSafeInteger(data?.id) || data.id < 1) throw new Error('Reply response unclear; inspect GitLab before retrying');
      return { sent: true, id: data.id };
    },
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
    async getMergeRequestCommits(number) { iid(number); return (await get(`/merge_requests/${number}/commits`)).data; },
    async listMergeRequestDiffs(number, { page = 1, perPage = 100 } = {}) {
      iid(number);
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100) throw new TypeError('Invalid GitLab diff page');
      const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      const result = await get(`/merge_requests/${number}/diffs?${query}`);
      if (!Array.isArray(result.data) || result.data.length > perPage) throw new Error('Invalid GitLab diff page');
      return { values: result.data, nextPage: result.headers?.get?.('x-next-page') || null };
    },
    getPullRequestComments(number) { return notes('merge_requests', number); },
    async listPullRequestsPage() { return (await get('/merge_requests?state=opened&scope=all&per_page=20&page=1')).data; },
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
    async dispatchPipeline({ branch }) {
      branchRef(branch);
      const result = (await request('/pipeline', { method: 'POST', body: { ref: branch } })).data;
      if (!result || !Number.isSafeInteger(result.id) || result.id < 1) throw new Error('Pipeline request may have been accepted; inspect provider before retrying');
      return { accepted: true, id: result.id, status: typeof result.status === 'string' ? result.status : null, sha: typeof result.sha === 'string' && /^[a-f0-9]{40,64}$/i.test(result.sha) ? result.sha : null };
    },
    async getJob(id) { iid(id); return (await get(`/jobs/${id}`)).data; },
    async getJobTrace(id) {
      iid(id);
      const response = await fetchImpl(`${root}/jobs/${id}/trace`, { method: 'GET', headers: { Accept: 'text/plain', 'PRIVATE-TOKEN': token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('Job trace unavailable');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          if (!(value instanceof Uint8Array)) throw new Error('Invalid job trace stream');
          size += value.byteLength; if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new Error('Job trace exceeds size limit'); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return Buffer.concat(chunks, size);
    },
    async listPipelineJobs(id, { page = 1 } = {}) {
      iid(id);
      if (!Number.isSafeInteger(page) || page < 1) throw new TypeError('Invalid pipeline jobs page');
      const { data, headers } = await get(`/pipelines/${id}/jobs?per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.length > 100) throw new Error('Invalid pipeline jobs response');
      return { values: data, nextPage: headers?.get?.('x-next-page') || null };
    },
    async cancelPipeline(id) {
      iid(id);
      const result = (await request(`/pipelines/${id}/cancel`, { method: 'POST' })).data;
      if (result?.id !== id) throw new Error('Cancel response unclear; inspect GitLab before retrying');
      return { accepted: true, id };
    },
    async retryPipeline(id) {
      iid(id);
      const result = (await request(`/pipelines/${id}/retry`, { method: 'POST' })).data;
      if (result?.id !== id) throw new Error('Retry response unclear; inspect GitLab before retrying');
      return { accepted: true, id };
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
