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
      return { provider: 'confluence', id, title: page.title, status: page.status ?? null, version: page.version?.number ?? null, body: page.body.storage.value, bodyFormat: 'storage', url: typeof page._links?.webui === 'string' && page._links.webui.startsWith('/') && !page._links.webui.startsWith('//') ? `${url.origin}/wiki${page._links.webui}` : null };
    },
  };
}
