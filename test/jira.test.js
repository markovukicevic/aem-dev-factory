import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiraTracker } from '../src/jira.js';
import { createTrackerProvider } from '../src/providers.js';

const adf = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };
const issue = { key: 'TEAM-7', fields: { summary: 'Fix issue', description: adf, status: { name: 'Open' }, labels: ['bug'] } };
const comment = id => ({ id: String(id), body: adf, author: { displayName: 'Alex' } });

test('reads a Jira issue and all comments while preserving ADF', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    assert.match(options.headers.Authorization, /^Basic /);
    assert.equal(options.redirect, 'error');
    const body = url.includes('/comment?') ? url.includes('startAt=0') ? { startAt: 0, total: 2, comments: [comment(1)] } : { startAt: 1, total: 2, comments: [comment(2)] } : issue;
    return { ok: true, json: async () => body };
  };
  const tracker = createTrackerProvider({ provider: 'jira', baseUrl: 'https://team.atlassian.net' }, { jiraEmail: 'user@example.com', jiraToken: 'secret', fetchImpl });
  const result = await tracker.getTicket('TEAM-7');
  assert.equal(result.provider, 'jira');
  assert.deepEqual(result.body, adf);
  assert.deepEqual(result.comments[1].body, adf);
  assert.equal(result.comments.length, 2);
  assert.match(urls[2], /startAt=1/);
});

test('rejects untrusted URLs, invalid keys and incomplete comment pagination', async () => {
  for (const baseUrl of ['http://team.atlassian.net', 'https://evil.com', 'https://user@team.atlassian.net', 'https://team.atlassian.net/path']) assert.throws(() => createJiraTracker({ baseUrl, email: 'a@example.com', token: 'secret' }));
  const tracker = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', maxPages: 1, fetchImpl: async url => ({ ok: true, json: async () => url.includes('/comment?') ? { startAt: 0, total: 2, comments: [comment(1)] } : issue }) });
  await assert.rejects(tracker.getTicket('bad/key'), /Invalid Jira issue key/);
  await assert.rejects(tracker.getTicket('TEAM-7'), /incomplete/);
});

test('rejects malformed or prematurely empty comment pages', async () => {
  for (const page of [
    { startAt: 1, total: 1, comments: [comment(1)] },
    { startAt: 0, total: 1, comments: [] },
    { startAt: 0, total: 0, comments: [comment(1)] },
    { startAt: 0, total: 1, comments: [{ id: '1', body: 'plain text' }] },
  ]) {
    const tracker = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async url => ({ ok: true, json: async () => url.includes('/comment?') ? page : issue }) });
    await assert.rejects(tracker.getTicket('TEAM-7'));
  }
});

test('reports HTTP failures without exposing credentials or response bodies', async () => {
  const tracker = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'user@example.com', token: 'secret', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: 'secret' }) }) });
  await assert.rejects(tracker.getTicket('TEAM-7'), error => error.status === 403 && error.message === 'Jira request failed (403)');
});

test('reads attachment metadata and bounded content from fixed Jira API paths', async () => {
  const calls = [];
  const tracker = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async (url, options) => {
    calls.push([url, options]);
    if (!url.includes('/content/')) return { ok: true, json: async () => ({ id: '42', filename: 'image.png', size: 3, mimeType: 'image/png', content: 'https://evil.example/' }) };
    return { ok: true, status: 200, headers: { get: () => '3' }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) };
  } });
  assert.equal((await tracker.getAttachmentMetadata('42')).filename, 'image.png');
  assert.deepEqual(await tracker.downloadAttachment('42'), Buffer.from([1, 2, 3]));
  assert.match(calls[1][0], /\/attachment\/content\/42\?redirect=false$/);
  assert.equal(calls[1][1].redirect, 'error');
  await assert.rejects(tracker.getAttachmentMetadata('../bad'));
});

test('fails on oversized or partial attachment responses', async () => {
  const response = { ok: true, status: 200, headers: { get: () => null }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) };
  const tracker = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async () => response });
  await assert.rejects(tracker.downloadAttachment('42', { maxBytes: 2 }), /size limit/);
  const partial = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async () => ({ ok: true, status: 206 }) });
  await assert.rejects(partial.downloadAttachment('42'), /failed/);
});

test('includes validated attachment metadata in ticket context', async () => {
  const withAttachment = { ...issue, fields: { ...issue.fields, attachment: [{ id: '42', filename: 'image.png', size: 3, mimeType: 'image/png' }] } };
  const tracker = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async url => ({ ok: true, json: async () => url.includes('/comment?') ? { startAt: 0, total: 0, comments: [] } : withAttachment }) });
  assert.deepEqual((await tracker.getTicket('TEAM-7')).attachments, [{ id: '42', filename: 'image.png', size: 3, mimeType: 'image/png' }]);
});

test('saves an attachment without overwriting an existing file', async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'jira-attachment-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'attachment.bin');
  const tracker = createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => '3' }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) }) });
  const saved = await tracker.saveAttachment('42', path);
  assert.equal(saved.size, 3);
  assert.equal(saved.sha256, '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
  await assert.rejects(tracker.saveAttachment('42', path), { code: 'EEXIST' });
  assert.deepEqual(await readFile(path), Buffer.from([1, 2, 3]));
});


test('rejects an incomplete unencoded response but does not compare compressed wire length', async () => {
  const make = encoding => createJiraTracker({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async () => ({ ok: true, status: 200, headers: { get: name => name === 'content-length' ? '4' : name === 'content-encoding' ? encoding : null }, body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } }) }) });
  await assert.rejects(make(null).downloadAttachment('42'), /length does not match/);
  assert.deepEqual(await make('gzip').downloadAttachment('42'), Buffer.from([1, 2, 3]));
});
