import { createAdoHttp } from './ado-http.js';

/** Read Azure DevOps Services work items without following server-supplied URLs. */
export function createAdoTracker({ organization, project, token, fetchImpl = globalThis.fetch, maxPages = 10 }) {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid Azure DevOps client options');
  const { base, request: get } = createAdoHttp({ organization, project, token, fetchImpl });
  return {
    provider: 'ado',
    async getTicket(id) {
      if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new TypeError('Invalid Azure DevOps work item ID');
      const item = await get(`/_apis/wit/workitems/${id}?%24expand=All&api-version=7.1`);
      if (!item || item.id !== id || !item.fields || typeof item.fields !== 'object' || typeof item.fields['System.Title'] !== 'string') throw new Error('Invalid Azure DevOps work item response');
      const comments = [];
      const seen = new Set();
      let continuation;
      for (let page = 0; page < maxPages; page++) {
        const query = new URLSearchParams({ 'api-version': '7.1-preview.4', '$top': '100' });
        if (continuation) query.set('continuationToken', continuation);
        const result = await get(`/_apis/wit/workItems/${id}/comments?${query}`);
        if (!result || !Array.isArray(result.comments)) throw new Error('Invalid Azure DevOps comments response');
        for (const comment of result.comments) {
          const commentId = comment?.id ?? comment?.commentId;
          if (!Number.isSafeInteger(commentId) || typeof comment.text !== 'string') throw new Error('Invalid Azure DevOps comment');
          comments.push({ id: commentId, author: comment.createdBy?.displayName ?? null, body: comment.text, bodyFormat: 'azure-devops', createdAt: comment.createdDate ?? null, updatedAt: comment.modifiedDate ?? null });
        }
        const next = result.continuationToken;
        if (next === undefined || next === null || next === '') {
          return { provider: 'ado', number: id, title: item.fields['System.Title'], body: item.fields['System.Description'] ?? '', bodyFormat: 'html', state: item.fields['System.State'] ?? null, author: item.fields['System.CreatedBy']?.displayName ?? null, url: `${base}/_workitems/edit/${id}`, fields: item.fields, relations: item.relations ?? [], comments };
        }
        if (typeof next !== 'string' || next.length > 4096 || seen.has(next)) throw new Error('Invalid Azure DevOps continuation token');
        seen.add(next);
        continuation = next;
      }
      throw new Error('Azure DevOps comment limit reached; context is incomplete');
    },
  };
}
