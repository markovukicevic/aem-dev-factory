import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfluenceClient } from '../src/confluence.js';
import { createDocumentationProvider } from '../src/providers.js';

test('reads an explicitly requested page and preserves its storage body', async () => {
  let call;
  const provider = createDocumentationProvider({ provider: 'confluence', baseUrl: 'https://team.atlassian.net/wiki' }, { confluenceEmail: 'user@example.com', confluenceToken: 'secret', fetchImpl: async (...args) => { call = args; return { ok: true, json: async () => ({ id: '123', title: 'Docs', version: { number: 2 }, body: { storage: { value: '<p>Source</p>' } }, _links: { webui: '/spaces/ABC/pages/123' } }) }; } });
  const page = await provider.getPage('123');
  assert.equal(page.body, '<p>Source</p>');
  assert.equal(page.version, 2);
  assert.equal(page.url, 'https://team.atlassian.net/wiki/spaces/ABC/pages/123');
  assert.match(call[0], /\/wiki\/api\/v2\/pages\/123\?body-format=storage$/);
  assert.equal(call[1].redirect, 'error');
});

test('rejects untrusted hosts, invalid IDs and malformed responses', async () => {
  for (const baseUrl of ['http://team.atlassian.net', 'https://evil.example', 'https://user@team.atlassian.net', 'https://team.atlassian.net/other']) assert.throws(() => createConfluenceClient({ baseUrl, email: 'a@example.com', token: 'secret' }));
  const client = createConfluenceClient({ baseUrl: 'https://team.atlassian.net', email: 'a@example.com', token: 'secret', fetchImpl: async () => ({ ok: true, json: async () => ({ id: '123', title: 'Docs' }) }) });
  await assert.rejects(client.getPage('../bad'), /Invalid Confluence page ID/);
  await assert.rejects(client.getPage('123'), /Invalid Confluence page response/);
});
