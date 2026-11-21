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
