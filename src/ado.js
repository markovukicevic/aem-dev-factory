import { createAdoHttp } from './ado-http.js';

/** Read Azure DevOps Services work items without following server-supplied URLs. */
export function createAdoTracker({ organization, project, token, fetchImpl = globalThis.fetch, maxPages = 10 }) {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid Azure DevOps client options');
  const { base, request: get } = createAdoHttp({ organization, project, token, fetchImpl });
  return {
    provider: 'ado',
    async getWorkItemState(id) {
      if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new TypeError('Invalid work item ID');
      return get(`/_apis/wit/workitems/${id}?fields=System.State,System.WorkItemType,System.TeamProject&api-version=7.1`);
    },
    async listWorkItemStates(type) {
      if (typeof type !== 'string' || !type.trim() || type !== type.trim() || type.length > 128 || /[\u0000-\u001f\u007f\/\\]/.test(type)) throw new TypeError('Invalid work item type');
      return get(`/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=7.1`);
    },
    async updateWorkItemState({ id, revision, state }) {
      if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647 || !Number.isSafeInteger(revision) || revision < 1 || typeof state !== 'string' || !state.trim() || state !== state.trim() || state.length > 128 || /[\u0000-\u001f\u007f]/.test(state)) throw new TypeError('Invalid work item state');
      const body = [{ op: 'test', path: '/rev', value: revision }, { op: 'add', path: '/fields/System.State', value: state }];
      const item = await get(`/_apis/wit/workitems/${id}?api-version=7.1`, { method: 'PATCH', body, contentType: 'application/json-patch+json' });
      if (item?.id !== id || item.fields?.['System.State'] !== state || !Number.isSafeInteger(item.rev) || item.rev <= revision) throw new Error('Work item update unclear; inspect Azure before retrying');
      return { updated: true, state, revision: item.rev };
    },
    async createSubtask({ parent, workItemType, summary, description }) {
      if (!Number.isSafeInteger(parent) || parent < 1 || parent > 2147483647 || typeof workItemType !== 'string' || !workItemType.trim() || workItemType !== workItemType.trim() || workItemType.length > 128 || /[\u0000-\u001f\u007f\/\\$]/.test(workItemType) || typeof summary !== 'string' || !summary.trim() || summary.length > 255 || /[\u0000-\u001f\u007f]/.test(summary) || typeof description !== 'string' || !description.trim() || description.length > 262144) throw new TypeError('Invalid Azure subtask');
      const operations = [ { op: 'add', path: '/fields/System.Title', value: summary }, { op: 'add', path: '/fields/System.Description', value: description }, { op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: `${base}/_apis/wit/workItems/${parent}` } } ];
      const item = await get(`/_apis/wit/workitems/$${encodeURIComponent(workItemType)}?api-version=7.1`, { method: 'POST', body: operations, contentType: 'application/json-patch+json' });
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || item.id > 2147483647) throw new Error('Subtask response unclear; inspect Azure before retrying');
      return { created: true, id: item.id, url: `${base}/_workitems/edit/${item.id}` };
    },
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
          return { provider: 'ado', number: id, revision: Number.isSafeInteger(item.rev) && item.rev > 0 ? item.rev : null, title: item.fields['System.Title'], body: item.fields['System.Description'] ?? '', bodyFormat: 'html', state: item.fields['System.State'] ?? null, author: item.fields['System.CreatedBy']?.displayName ?? null, url: `${base}/_workitems/edit/${id}`, fields: item.fields, relations: item.relations ?? [], comments };
        }
        if (typeof next !== 'string' || next.length > 4096 || seen.has(next)) throw new Error('Invalid Azure DevOps continuation token');
        seen.add(next);
        continuation = next;
      }
      throw new Error('Azure DevOps comment limit reached; context is incomplete');
    },
  };
}
