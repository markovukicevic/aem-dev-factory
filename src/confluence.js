/** Read an explicitly requested Confluence Cloud page in storage format. */
export function createConfluenceClient({ baseUrl, email, token, fetchImpl = globalThis.fetch }) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new TypeError('Invalid Confluence Cloud URL'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !['', '/', '/wiki', '/wiki/'].includes(url.pathname)) throw new TypeError('Invalid Confluence Cloud URL');
  if (typeof email !== 'string' || !email.trim() || /[:\r\n]/.test(email) || typeof token !== 'string' || !token.trim()) throw new TypeError('Confluence email and API token are required');
  if (typeof fetchImpl !== 'function') throw new TypeError('Invalid Confluence client options');
  const authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  return {
    provider: 'confluence',
    site: url.origin,
    async searchPages(cql) {
      if (typeof cql !== 'string' || !cql.trim() || cql.length > 512 || /[\u0000-\u001f\u007f]/.test(cql)) throw new TypeError('Invalid Confluence query');
      const query = new URLSearchParams({ cql, limit: '25' });
      const response = await fetchImpl(`${url.origin}/wiki/rest/api/content/search?${query}`, { method: 'GET', headers: { Accept: 'application/json', Authorization: authorization }, redirect: 'error' });
      if (!response.ok) { const error = new Error(`Confluence request failed (${response.status})`); error.status = response.status; throw error; }
      const data = await response.json();
      if (!data || !Array.isArray(data.results) || data.results.length > 25) throw new Error('Invalid Confluence search response');
      const pages = data.results.map(item => {
        if (!item || typeof item.id !== 'string' || !/^[1-9][0-9]{0,30}$/.test(item.id) || typeof item.title !== 'string') throw new Error('Invalid Confluence search result');
        return { id: item.id, title: item.title, type: typeof item.type === 'string' ? item.type : null, status: typeof item.status === 'string' ? item.status : null };
      });
      return { provider: 'confluence', pages, hasMore: typeof data._links?.next === 'string' && !!data._links.next ? true : null, scope: 'First response only; completeness, hidden content and later changes are not verified.' };
    },
    async searchAllPages(cql, { maxPages = 10 } = {}) {
      if (typeof cql !== 'string' || !cql.trim() || cql.length > 512 || /[\u0000-\u001f\u007f]/.test(cql) || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10) throw new TypeError('Invalid Confluence search request');
      const path = '/wiki/rest/api/content/search';
      let nextUrl = new URL(`${url.origin}${path}`);
      nextUrl.search = new URLSearchParams({ cql, limit: '25' }).toString();
      const pages = [], seenPages = new Set(), seenIds = new Set();
      for (let count = 0; count < maxPages; count++) {
        if (seenPages.has(nextUrl.href)) throw new Error('Confluence pagination repeated');
        seenPages.add(nextUrl.href);
        const response = await fetchImpl(nextUrl.href, { method: 'GET', headers: { Accept: 'application/json', Authorization: authorization }, redirect: 'error' });
        if (!response.ok) { const error = new Error(`Confluence request failed (${response.status})`); error.status = response.status; throw error; }
        const data = await response.json();
        if (!data || !Array.isArray(data.results) || data.results.length > 25) throw new Error('Invalid Confluence search response');
        for (const item of data.results) {
          if (!item || typeof item.id !== 'string' || !/^[1-9][0-9]{0,30}$/.test(item.id) || typeof item.title !== 'string' || seenIds.has(item.id)) throw new Error('Invalid or repeated Confluence result');
          seenIds.add(item.id); pages.push({ id: item.id, title: item.title, type: typeof item.type === 'string' ? item.type : null, status: typeof item.status === 'string' ? item.status : null });
        }
        const next = data._links?.next;
        if (next === undefined || next === null || next === '') return { provider: 'confluence', pages, paginationComplete: true, scope: 'Reported pagination ended; permissions, server-side omissions and later changes are not verified.' };
        if (typeof next !== 'string' || next.length > 8192) throw new Error('Invalid Confluence next page');
        let candidate;
        try { candidate = new URL(next.startsWith('/rest/api/') ? `/wiki${next}` : next, nextUrl); } catch { throw new Error('Invalid Confluence next page'); }
        if (candidate.origin !== url.origin || candidate.username || candidate.password || candidate.hash || candidate.pathname !== path) throw new Error('Invalid Confluence next page');
        const keys = [...candidate.searchParams.keys()];
        if (keys.some(key => !['cql', 'limit', 'cursor', 'start'].includes(key)) || new Set(keys).size !== keys.length || (candidate.searchParams.has('cql') && candidate.searchParams.get('cql') !== cql) || (candidate.searchParams.has('limit') && candidate.searchParams.get('limit') !== '25') || (!candidate.searchParams.has('cursor') && !candidate.searchParams.has('start'))) throw new Error('Invalid Confluence next page');
        candidate.searchParams.set('cql', cql); candidate.searchParams.set('limit', '25');
        nextUrl = candidate;
      }
      return { provider: 'confluence', pages, paginationComplete: false, scope: 'Page limit reached; results may be incomplete and permissions and later changes are not verified.' };
    },
    async getPage(id) {
      if (typeof id !== 'string' || !/^[1-9][0-9]{0,30}$/.test(id)) throw new TypeError('Invalid Confluence page ID');
      const response = await fetchImpl(`${url.origin}/wiki/api/v2/pages/${id}?body-format=storage`, { method: 'GET', headers: { Accept: 'application/json', Authorization: authorization }, redirect: 'error' });
      if (!response.ok) {
        const error = new Error(`Confluence request failed (${response.status})`);
        error.status = response.status;
        throw error;
      }
      const page = await response.json();
      if (!page || page.id !== id || typeof page.title !== 'string' || typeof page.body?.storage?.value !== 'string') throw new Error('Invalid Confluence page response');
      return { provider: 'confluence', site: url.origin, id, title: page.title, status: page.status ?? null, version: page.version?.number ?? null, body: page.body.storage.value, bodyFormat: 'storage', url: typeof page._links?.webui === 'string' && page._links.webui.startsWith('/') && !page._links.webui.startsWith('//') ? `${url.origin}/wiki${page._links.webui}` : null };
    },
  };
}
