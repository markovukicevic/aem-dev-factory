const jcrPath = value => typeof value === 'string' && value.length <= 2048 && /^\/(?:[A-Za-z0-9_:.~-]+)(?:\/[A-Za-z0-9_:.~-]+)*$/.test(value) && !value.split('/').some(segment => segment === '.' || segment === '..');
function authorOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('Invalid AEM author URL'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new TypeError('Use an HTTPS author origin or HTTP loopback origin');
  return url.origin;
}
async function jsonLimited(response, limit) {
  if (!response.body?.getReader) throw new Error('AEM response stream unavailable');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error('AEM response exceeds limit'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
}
/** Read an explicitly scoped resource-type query from an AEM author instance. */
export async function searchLiveAemUsage({ authorUrl, root, resourceType, username, password }, { fetchImpl = globalThis.fetch, maxPages = 4, pageSize = 25, timeoutMs = 15000 } = {}) {
  const origin = authorOrigin(authorUrl);
  if (!jcrPath(root) || !(root === '/content' || root.startsWith('/content/')) || typeof resourceType !== 'string' || !/^[A-Za-z0-9_:.~-]+(?:\/[A-Za-z0-9_:.~-]+)+$/.test(resourceType) || resourceType.split('/').some(segment => segment === '.' || segment === '..') || typeof username !== 'string' || !username || /[:\r\n]/.test(username) || typeof password !== 'string' || !password || /[\r\n]/.test(password) || typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 4 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 25 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw new TypeError('Invalid AEM search options');
  const matches = [], seen = new Set(); let complete = false, lastReportedTotal = null;
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize, url = new URL('/bin/querybuilder.json', origin);
    url.search = new URLSearchParams({ path: root, '1_property': 'sling:resourceType', '1_property.value': resourceType, 'p.limit': String(pageSize), 'p.offset': String(offset), 'p.guessTotal': 'true', orderby: 'path' }).toString();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    let data;
    try {
      const response = await fetchImpl(url.href, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }, redirect: 'error', signal: controller.signal });
      if (!response.ok) throw new Error(`AEM search failed (${response.status})`);
      data = await jsonLimited(response, 1024 * 1024);
    } finally { clearTimeout(timer); }
    if (data?.success !== true || data.offset !== offset || !Number.isSafeInteger(data.total) || data.total < 0 || typeof data.more !== 'boolean' || !Array.isArray(data.hits) || data.hits.length > pageSize || (data.more && data.hits.length < pageSize)) throw new Error('Invalid or incomplete AEM search response');
    for (const hit of data.hits) {
      if (!jcrPath(hit?.path) || !(hit.path === root || hit.path.startsWith(`${root}/`)) || seen.has(hit.path)) throw new Error('Invalid or repeated AEM search hit');
      seen.add(hit.path); matches.push(hit.path);
    }
    lastReportedTotal = data.total;
    if (!data.more) { complete = true; break; }
  }
  const pages = new Map(), unmatched = [];
  for (const path of matches) {
    const marker = path.indexOf('/jcr:content');
    if (marker < 1 || !['', '/'].includes(path.charAt(marker + '/jcr:content'.length))) { unmatched.push(path); continue; }
    const pagePath = path.slice(0, marker);
    if (!pages.has(pagePath)) pages.set(pagePath, { path: pagePath, authorUrl: `${origin}/editor.html${pagePath.split('/').map(encodeURIComponent).join('/')}.html`, componentPaths: [] });
    pages.get(pagePath).componentPaths.push(path);
  }
  return { authorOrigin: origin, root, resourceType, pages: [...pages.values()], unmatched, queryComplete: complete, reportedTotal: lastReportedTotal, scope: 'Read-only exact resource-type query within the selected root and account permissions. Candidate pages are derived from matching paths; references, inheritance, other roots and concurrent changes are not covered.' };
}
