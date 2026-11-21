import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectProviderConfiguration } from '../src/project-doctor.js';

test('reports required environment variable presence without exposing values', () => {
  const config = { tracker: { provider: 'jira', baseUrl: 'https://example.atlassian.net' }, scm: { provider: 'github', owner: 'team', repository: 'site' } };
  const result = inspectProviderConfiguration({ config, env: { JIRA_EMAIL: 'person@example.com', GITHUB_TOKEN: 'private-token' } });
  assert.deepEqual(result.providers[0].credentials, [{ name: 'JIRA_EMAIL', present: true }, { name: 'JIRA_API_TOKEN', present: false }]);
  assert.ok(!JSON.stringify(result).includes('private-token'));
  assert.ok(!JSON.stringify(result).includes('person@example.com'));
  assert.match(result.scope, /not verified/);
  assert.throws(() => inspectProviderConfiguration({ config: { scm: { provider: 'github', owner: 'team', repository: 'site', token: 'secret' } } }), /Unexpected/);
});
