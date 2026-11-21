import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderSet } from '../src/providers.js';

const config = {
  tracker: { provider: 'github', owner: 'tickets', repository: 'issues' },
  scm: { provider: 'github', owner: 'code', repository: 'project' },
  ci: { provider: 'github-actions', owner: 'builds', repository: 'ci' },
};

test('routes tracker, SCM and CI requests to their independently configured repositories', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    const value = url.includes('/issues/7/comments') ? [] : url.endsWith('/issues/7') ? { number: 7, title: 'Issue', labels: [] } : url.endsWith('/pulls/2') ? { number: 2 } : { state: 'success' };
    return { ok: true, json: async () => value };
  };
  const providers = createProviderSet(config, { token: 'secret', fetchImpl });
  assert.equal((await providers.tracker.getTicket(7)).number, 7);
  assert.equal((await providers.scm.getPullRequest(2)).number, 2);
  assert.equal((await providers.ci.getCommitStatus('123abcd')).state, 'success');
  assert.match(urls[0], /repos\/tickets\/issues\/issues\/7$/);
  assert.match(urls[2], /repos\/code\/project\/pulls\/2$/);
  assert.match(urls[3], /repos\/builds\/ci\/commits\/123abcd\/status$/);
});

test('rejects unsupported provider combinations instead of silently falling back', () => {
  for (const [key, provider] of [['tracker', 'bitbucket'], ['scm', 'bitbucket'], ['ci', 'gitlab']]) {
    assert.throws(() => createProviderSet({ ...config, [key]: { provider } }, { token: 'secret' }), /Unsupported/);
  }
});

test('can create a tracker independently without requiring SCM or CI configuration', async () => {
  const { createTrackerProvider } = await import('../src/providers.js');
  const tracker = createTrackerProvider(config.tracker, { token: 'secret', fetchImpl: async url => ({ ok: true, json: async () => url.includes('/comments') ? [] : { number: 7, title: 'Issue', labels: [] } }) });
  assert.equal((await tracker.getTicket(7)).number, 7);
});

test('supports Jira tracker independently alongside GitHub SCM and Actions', async () => {
  const mixed = { ...config, tracker: { provider: 'jira', baseUrl: 'https://team.atlassian.net' } };
  const fetchImpl = async url => ({ ok: true, json: async () => url.includes('/comment?') ? { startAt: 0, total: 0, comments: [] } : url.includes('atlassian.net') ? { key: 'TEAM-7', fields: { summary: 'Story' } } : { number: 2 } });
  const providers = createProviderSet(mixed, { token: 'github-secret', jiraEmail: 'a@example.com', jiraToken: 'jira-secret', fetchImpl });
  assert.equal((await providers.tracker.getTicket('TEAM-7')).provider, 'jira');
  assert.equal((await providers.scm.getPullRequest(2)).number, 2);
});
