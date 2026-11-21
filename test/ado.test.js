import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdoTracker } from '../src/ado.js';
import { createTrackerProvider } from '../src/providers.js';

const item = { id: 12, fields: { 'System.Title': 'Fix bug', 'System.Description': '<p>Details</p>', 'System.State': 'Active', 'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>AC</p>' } };

test('retrieves a work item and paginated comments without following returned URLs', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    assert.match(options.headers.Authorization, /^Basic /);
    assert.equal(options.redirect, 'error');
    let value = item;
    if (url.includes('/comments?')) value = url.includes('continuationToken=') ? { comments: [{ id: 2, text: 'Second' }] } : { comments: [{ id: 1, text: 'First' }], continuationToken: 'next+token', nextPage: 'https://evil.example/' };
    return { ok: true, json: async () => value };
  };
  const tracker = createTrackerProvider({ provider: 'ado', organization: 'my-org', project: 'My Project' }, { adoToken: 'secret', fetchImpl });
  const result = await tracker.getTicket(12);
  assert.equal(result.provider, 'ado');
  assert.equal(result.fields['Microsoft.VSTS.Common.AcceptanceCriteria'], '<p>AC</p>');
  assert.deepEqual(result.comments.map(value => value.body), ['First', 'Second']);
  assert.match(urls[2], /continuationToken=next%2Btoken/);
  assert.ok(urls.every(url => url.startsWith('https://dev.azure.com/my-org/My%20Project/')));
});

test('fails on invalid configuration, repeated continuation or page limit', async () => {
  for (const organization of ['evil.example/path', '../org', '']) assert.throws(() => createAdoTracker({ organization, project: 'p', token: 'secret' }));
  const fetchImpl = async url => ({ ok: true, json: async () => url.includes('/comments?') ? { comments: [], continuationToken: 'again' } : item });
  const tracker = createAdoTracker({ organization: 'org', project: 'p', token: 'secret', fetchImpl });
  await assert.rejects(tracker.getTicket(12), /continuation/);
  await assert.rejects(tracker.getTicket(-1), /Invalid/);
  const limited = createAdoTracker({ organization: 'org', project: 'p', token: 'secret', fetchImpl, maxPages: 1 });
  await assert.rejects(limited.getTicket(12), /incomplete/);
});

test('reports HTTP status without leaking API credentials', async () => {
  const tracker = createAdoTracker({ organization: 'org', project: 'p', token: 'secret', fetchImpl: async () => ({ ok: false, status: 403 }) });
  await assert.rejects(tracker.getTicket(12), error => error.status === 403 && error.message === 'Azure DevOps request failed (403)');
});
