import { createAdoHttp } from './ado-http.js';
import { branchRef } from './git-ref.js';

/** Read Azure DevOps builds and queue only explicitly selected definitions. */
export function createAdoCi({ organization, project, token, fetchImpl = globalThis.fetch }) {
  const { request, requestWithMetadata } = createAdoHttp({ organization, project, token, fetchImpl });
  return {
    provider: 'ado-pipelines',
    async dispatchPipeline({ definition, branch, commit }) {
      if (!Number.isSafeInteger(definition) || definition < 1 || definition > 2147483647 || (commit !== undefined && (typeof commit !== 'string' || !/^[a-f0-9]{40,64}$/i.test(commit)))) throw new TypeError('Invalid build definition or commit');
      const sourceBranch = branchRef(branch);
      const result = await request('/_apis/build/builds?api-version=7.1', { method: 'POST', body: { definition: { id: definition }, sourceBranch, ...(commit ? { sourceVersion: commit } : {}) } });
      if (!result || !Number.isSafeInteger(result.id) || result.id < 1 || (result.definition?.id !== undefined && result.definition.id !== definition)) throw new Error('Build request may have been accepted; inspect provider before retrying');
      return { accepted: true, id: result.id, status: typeof result.status === 'string' ? result.status : null };
    },
    getBuild(id) {
      if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) throw new TypeError('Invalid build ID');
      return request(`/_apis/build/builds/${id}?api-version=7.1`);
    },
    async listBuilds({ branch, top = 100, continuationToken } = {}) {
      const ref = branchRef(branch);
      if (!Number.isSafeInteger(top) || top < 1 || top > 100) throw new TypeError('Invalid build page size');
      if (continuationToken !== undefined && (typeof continuationToken !== 'string' || !continuationToken || continuationToken.length > 4096)) throw new TypeError('Invalid build continuation token');
      const query = new URLSearchParams({ branchName: ref, '$top': String(top), 'api-version': '7.1' });
      if (continuationToken) query.set('continuationToken', continuationToken);
      const result = await requestWithMetadata(`/_apis/build/builds?${query}`);
      if (!Array.isArray(result.data?.value)) throw new Error('Invalid Azure builds response');
      const next = result.headers?.get?.('x-ms-continuationtoken') ?? null;
      if (next !== null && (typeof next !== 'string' || next.length > 4096)) throw new Error('Invalid build continuation token');
      return { values: result.data.value, continuationToken: next || null };
    },
  };
}
