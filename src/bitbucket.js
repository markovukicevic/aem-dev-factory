/** Read-only Bitbucket Cloud API client. Data Center is a separate target. */
export function createBitbucketClient({ workspace, repository, token, fetchImpl = globalThis.fetch, maxPages = 10 }) {
  for (const value of [workspace, repository]) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === '.' || value === '..') throw new TypeError('Invalid Bitbucket workspace or repository');
  }
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Bitbucket access token is required');
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid Bitbucket client options');
  const root = `/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repository)}`;
  async function get(url) {
    const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, redirect: 'error' });
    if (!response.ok) {
      const error = new Error(`Bitbucket request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  const endpoint = path => `https://api.bitbucket.org${root}${path}`;
  function number(value) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid pull request number');
  }
  return {
    getRepository: () => get(endpoint('')),
    getPullRequest(id) { number(id); return get(endpoint(`/pullrequests/${id}`)); },
    async getPullRequestComments(id) {
      number(id);
      const path = `${root}/pullrequests/${id}/comments`;
      let url = `https://api.bitbucket.org${path}?pagelen=100`;
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
      throw new Error('Bitbucket comment limit reached; context is incomplete');
    },
    getCommitStatuses(sha) {
      if (typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) throw new TypeError('Invalid commit SHA');
      return get(endpoint(`/commit/${sha}/statuses?pagelen=100`));
    },
  };
}
