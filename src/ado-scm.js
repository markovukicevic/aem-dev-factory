import { createAdoHttp } from './ado-http.js';
import { branchRef } from './git-ref.js';



/** Azure Repos REST adapter. The caller must perform readiness and publication checks. */
export function createAdoScm({ organization, project, repository, token, fetchImpl = globalThis.fetch }) {
  if (typeof repository !== 'string' || !repository.trim() || repository !== repository.trim() || /[\\/\u0000-\u001f]/.test(repository) || ['.', '..'].includes(repository)) throw new TypeError('Invalid Azure repository');
  const { request, requestWithMetadata } = createAdoHttp({ organization, project, token, fetchImpl });
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
    async getPullRequestCommitPage(number, { top = 100, continuationToken } = {}) {
      validId(number);
      if (!Number.isSafeInteger(top) || top < 1 || top > 100) throw new TypeError('Invalid commit page size');
      if (continuationToken !== undefined && (typeof continuationToken !== 'string' || !continuationToken || continuationToken.length > 4096)) throw new TypeError('Invalid continuation token');
      const query = new URLSearchParams({ '$top': String(top), 'api-version': '7.1' });
      if (continuationToken) query.set('continuationToken', continuationToken);
      const result = await requestWithMetadata(`${root}/${number}/commits?${query}`);
      if (!Array.isArray(result.data?.value)) throw new Error('Invalid Azure commits response');
      return { values: result.data.value, continuationToken: result.headers?.get?.('x-ms-continuationtoken') || null };
    },
    async getIterationChanges(number, iteration, { maxPages = 10 } = {}) {
      validId(number);
      validId(iteration);
      if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid page limit');
      let skip = 0;
      let top = 100;
      const changes = [];
      for (let page = 0; page < maxPages; page++) {
        const query = new URLSearchParams({ '$top': String(top), '$skip': String(skip), 'api-version': '7.1' });
        const response = await request(`${root}/${number}/iterations/${iteration}/changes?${query}`);
        if (!response || !Array.isArray(response.changeEntries) || response.changeEntries.length > top) throw new Error('Invalid Azure iteration changes');
        changes.push(...response.changeEntries);
        if (response.nextSkip === undefined && response.nextTop === undefined) {
          if (response.changeEntries.length < top) return { changes, complete: true };
          skip += top;
          continue;
        }
        if (!Number.isSafeInteger(response.nextSkip) || !Number.isSafeInteger(response.nextTop) || response.nextSkip < 0 || response.nextTop < 0) throw new Error('Invalid Azure iteration changes');
        if (response.nextSkip === 0 && response.nextTop === 0) return { changes, complete: true };
        if (response.nextSkip <= skip || response.nextTop < 1 || response.nextTop > 2000) throw new Error('Invalid Azure continuation');
        skip = response.nextSkip;
        top = response.nextTop;
      }
      return { changes, complete: false };
    },
    async createPullRequestComment({ number, body }) {
      validId(number);
      if (typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid pull request comment');
      const result = await request(`${root}/${number}/threads?api-version=7.1`, { method: 'POST', body: { comments: [{ parentCommentId: 0, content: body, commentType: 'text' }], status: 'active' } });
      if (!Number.isSafeInteger(result?.id) || result.id < 1) throw new Error('Thread response unclear; inspect Azure before retrying');
      return { sent: true, threadId: result.id };
    },
    getPullRequestThread(number, threadId) {
      validId(number); validId(threadId);
      return request(`${root}/${number}/threads/${threadId}?api-version=7.1`);
    },
    async replyPullRequestThread({ number, threadId, commentId, body }) {
      validId(number); validId(threadId);
      if (!Number.isSafeInteger(commentId) || commentId < 1 || commentId > 32767 || typeof body !== 'string' || !body.trim() || Buffer.byteLength(body, 'utf8') > 65536) throw new TypeError('Invalid Azure reply');
      const result = await request(`${root}/${number}/threads/${threadId}/comments?api-version=7.1`, { method: 'POST', body: { parentCommentId: commentId, content: body, commentType: 'text' } });
      if (!Number.isSafeInteger(result?.id) || result.id < 1) throw new Error('Comment response unclear; inspect Azure before retrying');
      return { sent: true, id: result.id };
    },
    getPullRequestThreads(number) {
      validId(number);
      return request(`${root}/${number}/threads?api-version=7.1`);
    },
    listPullRequestsPage() { return request(`${root}?searchCriteria.status=active&%24top=20&api-version=7.1`); },
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
