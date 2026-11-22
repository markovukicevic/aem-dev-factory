import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** A read-only Jira Cloud issue client. Atlassian Document Format is preserved. */
export function createJiraTracker({ baseUrl, email, token, fetchImpl = globalThis.fetch, maxPages = 10 }) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new TypeError('Invalid Jira Cloud URL'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new TypeError('Invalid Jira Cloud URL');
  if (typeof email !== 'string' || !email.trim() || /[:\r\n]/.test(email) || typeof token !== 'string' || !token.trim()) throw new TypeError('Jira email and API token are required');
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid Jira client options');
  const origin = url.origin;
  const authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  async function get(path) {
    const response = await fetchImpl(`${origin}${path}`, { method: 'GET', headers: { Accept: 'application/json', Authorization: authorization }, redirect: 'error' });
    if (!response.ok) {
      const error = new Error(`Jira request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  function attachmentId(id) {
    if (typeof id !== 'string' || !/^[1-9][0-9]{0,30}$/.test(id)) throw new TypeError('Invalid Jira attachment ID');
    return id;
  }
  async function downloadAttachment(id, { maxBytes = 5 * 1024 * 1024 } = {}) {
    attachmentId(id);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 5 * 1024 * 1024) throw new TypeError('Invalid attachment size limit');
    const response = await fetchImpl(`${origin}/rest/api/3/attachment/content/${id}?redirect=false`, { method: 'GET', headers: { Accept: 'application/octet-stream', Authorization: authorization }, redirect: 'error' });
    if (response.status !== 200 || !response.ok) {
      const error = new Error(`Jira attachment request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    const length = response.headers?.get?.('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
      await response.body?.cancel?.();
      throw new Error('Jira attachment exceeds size limit or has invalid length');
    }
    if (!response.body || typeof response.body.getReader !== 'function') throw new Error('Jira attachment stream is unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) throw new Error('Invalid Jira attachment stream');
        size += value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error('Jira attachment exceeds size limit'); }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, size);
  }
  return {
    provider: 'jira',
    async getAttachmentMetadata(id) {
      attachmentId(id);
      const data = await get(`/rest/api/3/attachment/${id}`);
      if (!data || String(data.id) !== id || typeof data.filename !== 'string' || !Number.isSafeInteger(data.size) || data.size < 0) throw new Error('Invalid Jira attachment metadata');
      return { id, filename: data.filename, size: data.size, mimeType: data.mimeType ?? null, created: data.created ?? null };
    },
    downloadAttachment,
    async saveAttachment(id, path) {
      if (typeof path !== 'string' || !path.trim()) throw new TypeError('Output path is required');
      const content = await downloadAttachment(id);
      await writeFile(path, content, { flag: 'wx', mode: 0o600 });
      return { id, path, size: content.length, sha256: createHash('sha256').update(content).digest('hex') };
    },
    async getTicket(key) {
      if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(key)) throw new TypeError('Invalid Jira issue key');
      const encoded = encodeURIComponent(key);
      const issue = await get(`/rest/api/3/issue/${encoded}?fields=summary,description,status,reporter,labels,attachment`);
      if (!issue || typeof issue.key !== 'string' || issue.key.toUpperCase() !== key.toUpperCase() || typeof issue.fields?.summary !== 'string') throw new Error('Invalid Jira issue response');
      const attachments = (issue.fields.attachment ?? []).map(item => {
        const id = String(item?.id ?? '');
        attachmentId(id);
        if (typeof item.filename !== 'string' || !Number.isSafeInteger(item.size) || item.size < 0) throw new Error('Invalid Jira attachment metadata');
        return { id, filename: item.filename, size: item.size, mimeType: item.mimeType ?? null };
      });
      const comments = [];
      let startAt = 0;
      for (let page = 0; page < maxPages; page++) {
        const result = await get(`/rest/api/3/issue/${encoded}/comment?startAt=${startAt}&maxResults=100`);
        if (!Array.isArray(result?.comments) || result.startAt !== startAt || !Number.isSafeInteger(result.total) || result.total < 0 || result.comments.length > 100 || startAt + result.comments.length > result.total) throw new Error('Invalid Jira comments response');
        for (const item of result.comments) {
          if (!item || typeof item.id !== 'string' || (item.body !== null && typeof item.body !== 'object')) throw new Error('Invalid Jira comment');
          comments.push({ id: item.id, author: item.author?.displayName ?? null, body: item.body, bodyFormat: 'adf', createdAt: item.created ?? null, updatedAt: item.updated ?? null });
        }
        startAt += result.comments.length;
        if (startAt === result.total) {
          return { provider: 'jira', key: issue.key, title: issue.fields.summary, body: issue.fields.description ?? null, bodyFormat: 'adf', state: issue.fields.status?.name ?? null, author: issue.fields.reporter?.displayName ?? null, labels: Array.isArray(issue.fields.labels) ? issue.fields.labels : [], url: `${origin}/browse/${encodeURIComponent(issue.key)}`, attachments, comments };
        }
        if (!result.comments.length) throw new Error('Jira comments are incomplete');
      }
      throw new Error('Jira comment limit reached; context is incomplete');
    },
  };
}
