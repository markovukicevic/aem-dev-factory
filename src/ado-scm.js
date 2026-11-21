import { createAdoHttp } from './ado-http.js';

function branchRef(value) {
  if (typeof value !== 'string' || !value || value.startsWith('-') || value.startsWith('/') || value.endsWith('/') || value.endsWith('.') || value.includes('..') || value.includes('//') || value.includes('@{') || /[\x00-\x20\x7f~^:?*\[\\]/.test(value) || value.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) throw new TypeError('Invalid branch name');
  return `refs/heads/${value}`;
}

/** Azure Repos REST adapter. The caller must perform readiness and publication checks. */
export function createAdoScm({ organization, project, repository, token, fetchImpl = globalThis.fetch }) {
  if (typeof repository !== 'string' || !repository.trim() || repository !== repository.trim() || /[\\/\u0000-\u001f]/.test(repository) || ['.', '..'].includes(repository)) throw new TypeError('Invalid Azure repository');
  const { request } = createAdoHttp({ organization, project, token, fetchImpl });
  const root = `/_apis/git/repositories/${encodeURIComponent(repository)}/pullrequests`;
  function validId(number) {
    if (!Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw new TypeError('Invalid pull request ID');
  }
  return {
    provider: 'ado',
    getPullRequest(number) {
      validId(number);
      return request(`${root}/${number}?api-version=7.1`);
    },
    getPullRequestThreads(number) {
      validId(number);
      return request(`${root}/${number}/threads?api-version=7.1`);
    },
    async listActivePullRequests({ head, base }) {
      const query = new URLSearchParams({ 'searchCriteria.sourceRefName': branchRef(head), 'searchCriteria.targetRefName': branchRef(base), 'searchCriteria.status': 'active', '$top': '1', 'api-version': '7.1' });
      const result = await request(`${root}?${query}`);
      if (!Array.isArray(result?.value)) throw new Error('Invalid Azure DevOps pull request response');
      return result.value;
    },
    createPullRequest({ title, head, base, body = '', draft = false, workItemIds = [] }) {
      if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || typeof draft !== 'boolean') throw new TypeError('Invalid pull request fields');
      if (!Array.isArray(workItemIds) || workItemIds.some(id => !Number.isSafeInteger(id) || id < 1 || id > 2147483647)) throw new TypeError('Invalid work item IDs');
      const sourceRefName = branchRef(head);
      const targetRefName = branchRef(base);
      if (sourceRefName === targetRefName) throw new TypeError('Source and target branches must differ');
      const payload = { title, description: body, sourceRefName, targetRefName, isDraft: draft, ...(workItemIds.length ? { workItemRefs: workItemIds.map(id => ({ id: String(id) })) } : {}) };
      return request(`${root}?api-version=7.1`, { method: 'POST', body: payload });
    },
  };
}
