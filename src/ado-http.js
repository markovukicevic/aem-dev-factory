/** Constrain credentials to the public Azure DevOps Services API host. */
export function createAdoHttp({ organization, project, token, fetchImpl = globalThis.fetch }) {
  if (typeof organization !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(organization)) throw new TypeError('Invalid Azure DevOps organization');
  if (typeof project !== 'string' || !project.trim() || project !== project.trim() || /[\\/\u0000-\u001f]/.test(project) || project === '.' || project === '..') throw new TypeError('Invalid Azure DevOps project');
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Azure DevOps PAT is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('Invalid Azure DevOps client options');
  const base = `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}`;
  const authorization = `Basic ${Buffer.from(`:${token}`).toString('base64')}`;
  async function requestWithMetadata(path, { method = 'GET', body } = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Accept: 'application/json', Authorization: authorization, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
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
  async function request(path, options) { return (await requestWithMetadata(path, options)).data; }
  return { base, request, requestWithMetadata };
}
