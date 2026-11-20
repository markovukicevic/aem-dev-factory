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
