/** Constrain credentials to the public Azure DevOps Services API host. */
export function createAdoHttp({ organization, project, token, fetchImpl = globalThis.fetch }) {
  if (typeof organization !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(organization)) throw new TypeError('Invalid Azure DevOps organization');
  if (typeof project !== 'string' || !project.trim() || project !== project.trim() || /[\\/\u0000-\u001f]/.test(project) || project === '.' || project === '..') throw new TypeError('Invalid Azure DevOps project');
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Azure DevOps PAT is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('Invalid Azure DevOps client options');
  const base = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`;
  const authorization = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
  async function requestWithMetadata(path, { method = 'GET', body, contentType = 'application/json' } = {}) {
    if (!['application/json', 'application/json-patch+json'].includes(contentType)) throw new TypeError('Invalid content type');
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Accept: 'application/json', Authorization: authorization, ...(body === undefined ? {} : { 'Content-Type': contentType }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
    });
    if (!response.ok) {
      const error = new Error(`Azure DevOps request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return { data: await response.json(), headers: response.headers };
  }
  async function requestBytes(path, { maxBytes = 5 * 1024 * 1024 } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/_apis/') || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 5 * 1024 * 1024) throw new TypeError('Invalid Azure byte request');
    const response = await fetchImpl(`${base}${path}`, { method: 'GET', headers: { Accept: 'text/plain', Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('Azure response unavailable');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid Azure response stream'); size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error('Azure response exceeds size limit'); } chunks.push(Buffer.from(value)); }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks, size);
  }
  async function request(path, options) { return (await requestWithMetadata(path, options)).data; }
  return { base, request, requestWithMetadata, requestBytes };
}
