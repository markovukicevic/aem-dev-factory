import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** Jira Cloud issue client; writes require a separate explicit invocation. */
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
    const contentEncoding = response.headers?.get?.('content-encoding');
    const hasComparableLength = !!length && (!contentEncoding || contentEncoding.toLowerCase() === 'identity');
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
    if (hasComparableLength && size !== Number(length)) throw new Error('Jira attachment length does not match response');
    return Buffer.concat(chunks, size);
  }
  return {
    provider: 'jira',
    async getIssueState(key) {
      if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(key)) throw new TypeError('Invalid Jira issue key');
      return get(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=status,updated`);
    },
    async getTransitions(key) {
      if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(key)) throw new TypeError('Invalid Jira issue key');
      return get(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions?expand=transitions.fields`);
    },
    async createIssueComment({ key, body }) {
      if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(key) || !body || body.type !== 'doc' || body.version !== 1 || !Array.isArray(body.content)) throw new TypeError('Invalid Jira comment');
      const response = await fetchImpl(`${origin}/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { method: 'POST', headers: { Accept: 'application/json', Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ body }), redirect: 'error' });
      if (!response.ok) throw new Error('Comment request failed; inspect Jira before retrying');
      const result = await response.json();
      if (typeof result?.id !== 'string' || !/^[1-9][0-9]*$/.test(result.id)) throw new Error('Comment response unclear; inspect Jira before retrying');
      return { sent: true, id: result.id };
    },
    async transitionIssue({ key, transitionId }) {
      if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(key) || typeof transitionId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(transitionId)) throw new TypeError('Invalid Jira transition');
      const response = await fetchImpl(`${origin}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { method: 'POST', headers: { Accept: 'application/json', Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ transition: { id: transitionId } }), redirect: 'error' });
      if (!response.ok || response.status !== 204) throw new Error('Transition response unclear; inspect Jira before retrying');
      return { accepted: true };
    },
    async createSubtask({ parent, issueTypeId, summary, description }) {
      if (typeof parent !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(parent) || typeof issueTypeId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(issueTypeId) || typeof summary !== 'string' || !summary.trim() || summary.length > 255 || /[\u0000-\u001f\u007f]/.test(summary) || !description || description.type !== 'doc' || description.version !== 1 || !Array.isArray(description.content)) throw new TypeError('Invalid Jira subtask');
      const project = parent.slice(0, parent.lastIndexOf('-'));
      const payload = { fields: { project: { key: project }, parent: { key: parent }, issuetype: { id: issueTypeId }, summary, description } };
      const response = await fetchImpl(`${origin}/rest/api/3/issue`, { method: 'POST', headers: { Accept: 'application/json', Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error' });
      if (!response.ok) throw new Error('Subtask request failed; inspect Jira before retrying');
      const result = await response.json();
      if (typeof result?.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(result.key) || result.key.slice(0, result.key.lastIndexOf('-')).toLowerCase() !== project.toLowerCase()) throw new Error('Subtask response unclear; inspect Jira before retrying');
      return { created: true, key: result.key, url: `${origin}/browse/${encodeURIComponent(result.key)}` };
    },
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
      const issue = await get(`/rest/api/3/issue/${encoded}?fields=summary,description,status,reporter,labels,attachment,updated`);
      if (!issue || typeof issue.key !== 'string' || issue.key.toUpperCase() !== key.toUpperCase() || typeof issue.fields?.summary !== 'string') throw new Error('Invalid Jira issue response');
      const attachments = (issue.fields.attachment ?? []).map(item => {
        const id = String(item?.id ?? '');
        attachmentId(id);
        if (typeof item.filename !== 'string' || !Number.isSafeInteger(item.size) || item.size < 0) throw new Error('Invalid Jira attachment metadata');
        return { id, filename: item.filename, size: item.size, mimeType: item.mimeType ?? null };
      });
      const comments = [], commentIds = new Set();
      let startAt = 0, expectedTotal = null;
      for (let page = 0; page < maxPages; page++) {
        const result = await get(`/rest/api/3/issue/${encoded}/comment?startAt=${startAt}&maxResults=100`);
        if (!Array.isArray(result?.comments) || result.startAt !== startAt || !Number.isSafeInteger(result.total) || result.total < 0 || result.comments.length > 100 || startAt + result.comments.length > result.total) throw new Error('Invalid Jira comments response');
        if (expectedTotal !== null && result.total !== expectedTotal) throw new Error('Jira comments changed during pagination');
        expectedTotal = result.total;
        for (const item of result.comments) {
          if (!item || typeof item.id !== 'string' || !/^[0-9]+$/.test(item.id) || commentIds.has(item.id) || (item.body !== null && typeof item.body !== 'object')) throw new Error('Invalid or repeated Jira comment');
          commentIds.add(item.id);
          comments.push({ id: item.id, author: item.author?.displayName ?? null, body: item.body, bodyFormat: 'adf', createdAt: item.created ?? null, updatedAt: item.updated ?? null });
        }
        startAt += result.comments.length;
        if (startAt === result.total) {
          if (typeof issue.fields.updated === 'string' && issue.fields.updated) {
            const latest = await get(`/rest/api/3/issue/${encoded}?fields=updated`);
            if (typeof latest?.key !== 'string' || latest.key.toUpperCase() !== issue.key.toUpperCase() || latest.fields?.updated !== issue.fields.updated) throw new Error('Jira issue changed during collection');
          }
          return { provider: 'jira', key: issue.key, updatedAt: typeof issue.fields.updated === 'string' ? issue.fields.updated : null, title: issue.fields.summary, body: issue.fields.description ?? null, bodyFormat: 'adf', state: issue.fields.status?.name ?? null, author: issue.fields.reporter?.displayName ?? null, labels: Array.isArray(issue.fields.labels) ? issue.fields.labels : [], url: `${origin}/browse/${encodeURIComponent(issue.key)}`, attachments, comments };
        }
        if (!result.comments.length) throw new Error('Jira comments are incomplete');
      }
      throw new Error('Jira comment limit reached; context is incomplete');
    },
  };
}
