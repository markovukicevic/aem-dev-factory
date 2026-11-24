import { branchRef } from './git-ref.js';

/** Bitbucket Cloud API client. Data Center is a separate target. */
export function createBitbucketClient({ workspace, repository, token, fetchImpl = globalThis.fetch, maxPages = 10 }) {
  for (const value of [workspace, repository]) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === '.' || value === '..') throw new TypeError('Invalid Bitbucket workspace or repository');
  }
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Bitbucket access token is required');
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid Bitbucket client options');
  const root = `/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;
  async function request(url, { method = 'GET', body } = {}) {
    const response = await fetchImpl(url, { method, headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error' });
    if (!response.ok) {
      const error = new Error(`Bitbucket request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  const endpoint = path => `https://api.bitbucket.org${root}${path}`;
  const get = url => request(url);
  function number(value) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid pull request number');
  }
  async function collect(path, query) {
    let url = `https://api.bitbucket.org${path}?${query}`;
    const seen = new Set();
    const values = [];
    for (let page = 0; page < maxPages; page++) {
      if (seen.has(url)) throw new Error('Bitbucket pagination repeated');
      seen.add(url);
      const response = await get(url);
      if (!response || !Array.isArray(response.values)) throw new Error('Invalid Bitbucket page');
      values.push(...response.values);
      if (response.next === undefined || response.next === null) return values;
      if (typeof response.next !== 'string' || response.next.length > 8192) throw new Error('Invalid Bitbucket next page');
      let next;
      try { next = new URL(response.next); } catch { throw new Error('Invalid Bitbucket next page'); }
      if (next.protocol !== 'https:' || next.hostname !== 'api.bitbucket.org' || next.port || next.username || next.password || next.hash || next.pathname !== path) throw new Error('Invalid Bitbucket next page');
      url = next.href;
    }
    throw new Error('Bitbucket page limit reached; context is incomplete');
  }
  return {
    getRepository: () => get(endpoint('')),
    async approvePullRequest(id) {
      number(id);
      const result = await request(endpoint(`/pullrequests/${id}/approve`), { method: 'POST' });
      if (result?.approved !== true) throw new Error('Approval response unclear; inspect Bitbucket before retrying');
      return { accepted: true, approved: true };
    },
    getPullRequest(id) { number(id); return get(endpoint(`/pullrequests/${id}`)); },
    async getPullRequestDiffstat(id) {
      number(id);
      const response = await fetchImpl(endpoint(`/pullrequests/${id}/diffstat`), { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, redirect: 'manual' });
      if (response.status !== 302) throw new Error('Expected a Bitbucket diffstat redirect');
      const location = response.headers?.get?.('location');
      if (typeof location !== 'string' || location.length > 8192) throw new Error('Invalid Bitbucket diffstat redirect');
      let target;
      try { target = new URL(location, endpoint('')); } catch { throw new Error('Invalid Bitbucket diffstat redirect'); }
      const prefix = `${root}/diffstat/`;
      const spec = target.pathname.startsWith(prefix) ? target.pathname.slice(prefix.length) : '';
      if (target.protocol !== 'https:' || target.hostname !== 'api.bitbucket.org' || target.port || target.username || target.password || target.hash || !/^[A-Za-z0-9._~-]{1,256}$/.test(spec) || spec === '.' || spec === '..') throw new Error('Invalid Bitbucket diffstat redirect');
      target.searchParams.set('pagelen', '100');
      return collect(target.pathname, target.searchParams);
    },
    getPullRequestCommits(id) {
      number(id);
      return collect(`${root}/pullrequests/${id}/commits`, new URLSearchParams({ pagelen: '100' }));
    },
    getPullRequestStatuses(id) {
      number(id);
      return collect(`${root}/pullrequests/${id}/statuses`, new URLSearchParams({ pagelen: '100' }));
    },
    getPullRequestComment(id, commentId) {
      number(id); number(commentId);
      return get(endpoint(`/pullrequests/${id}/comments/${commentId}`));
    },
    async createPullRequestComment({ number: id, body }) {
      number(id);
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid pull request comment');
      const result = await request(endpoint(`/pullrequests/${id}/comments`), { method: 'POST', body: { content: { raw: body } } });
      if (!Number.isSafeInteger(result?.id) || result.id < 1) throw new Error('Comment response unclear; inspect Bitbucket before retrying');
      return { sent: true, id: result.id };
    },
    async replyPullRequestComment({ number: id, commentId, body }) {
      number(id); number(commentId);
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid Bitbucket comment');
      const result = await request(endpoint(`/pullrequests/${id}/comments`), { method: 'POST', body: { content: { raw: body }, parent: { id: commentId } } });
      if (!Number.isSafeInteger(result?.id) || result.id < 1) throw new Error('Comment response unclear; inspect Bitbucket before retrying');
      return { sent: true, id: result.id };
    },
    getPullRequestComments(id) {
      number(id);
      return collect(`${root}/pullrequests/${id}/comments`, new URLSearchParams({ pagelen: '100' }));
    },
    listPullRequestsPage() { return get(endpoint('/pullrequests?state=OPEN&pagelen=20')); },
    listOpenPullRequests({ head, base }) {
      branchRef(head);
      branchRef(base);
      const query = new URLSearchParams({ state: 'OPEN', q: `source.branch.name = ${JSON.stringify(head)} AND destination.branch.name = ${JSON.stringify(base)}`, pagelen: '100' });
      return collect(`${root}/pullrequests`, query);
    },
    createPullRequest({ title, head, base, body = '', draft = false }) {
      if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || typeof draft !== 'boolean') throw new TypeError('Invalid pull request fields');
      branchRef(head);
      branchRef(base);
      if (head === base) throw new TypeError('Source and target branches must differ');
      return request(endpoint('/pullrequests'), { method: 'POST', body: { title, description: body, source: { branch: { name: head } }, destination: { branch: { name: base } }, draft, close_source_branch: false } });
    },
    getPipelineStep(pipelineId, stepId) {
      for (const id of [pipelineId, stepId]) if (typeof id !== 'string' || !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(id)) throw new TypeError('Invalid pipeline or step UUID');
      return get(endpoint(`/pipelines/${encodeURIComponent(pipelineId)}/steps/${encodeURIComponent(stepId)}`));
    },
    getPipelineStepLogResponse(pipelineId, stepId) {
      for (const id of [pipelineId, stepId]) if (typeof id !== 'string' || !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(id)) throw new TypeError('Invalid pipeline or step UUID');
      return fetchImpl(endpoint(`/pipelines/${encodeURIComponent(pipelineId)}/steps/${encodeURIComponent(stepId)}/log`), { method: 'GET', headers: { Accept: 'text/plain', Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
    },
    getPipelineSteps(id) {
      if (typeof id !== 'string' || !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(id)) throw new TypeError('Invalid pipeline UUID');
      return collect(`${root}/pipelines/${encodeURIComponent(id)}/steps`, new URLSearchParams({ pagelen: '100' }));
    },
    getPipeline(id) {
      if (typeof id !== 'string' || !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(id)) throw new TypeError('Invalid pipeline UUID');
      return get(endpoint(`/pipelines/${encodeURIComponent(id)}`));
    },
    async dispatchPipeline({ branch, pipeline }) {
      branchRef(branch);
      if (typeof pipeline !== 'string' || !pipeline.trim() || pipeline !== pipeline.trim() || pipeline.length > 200 || /[\u0000-\u001f\u007f]/.test(pipeline)) throw new TypeError('Explicit custom pipeline name is required');
      const result = await request(endpoint('/pipelines/'), { method: 'POST', body: { target: { type: 'pipeline_ref_target', ref_type: 'branch', ref_name: branch, selector: { type: 'custom', pattern: pipeline } } } });
      if (typeof result?.uuid !== 'string' || !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(result.uuid)) throw new Error('Pipeline request may have been accepted; inspect provider before retrying');
      return { accepted: true, uuid: result.uuid, buildNumber: Number.isSafeInteger(result.build_number) && result.build_number > 0 ? result.build_number : null };
    },
    getAllCommitStatuses(sha) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new TypeError('Invalid commit SHA');
      return collect(`${root}/commit/${sha}/statuses`, new URLSearchParams({ pagelen: '100' }));
    },
    getCommitStatuses(sha) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new TypeError('Invalid commit SHA');
      return get(endpoint(`/commit/${sha}/statuses?pagelen=100`));
    },
  };
}
