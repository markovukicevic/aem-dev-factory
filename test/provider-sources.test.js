import test from 'node:test';
import assert from 'node:assert/strict';
import { describeProviderSources } from '../src/provider-sources.js';

test('records whitelisted identifiers without copying credentials or inferring identity', () => {
  const config = { scm: { provider: 'github', owner: 'team', repository: 'site', token: 'do-not-copy' }, ci: { provider: 'github-actions', owner: 'team', repository: 'site', secret: 'do-not-copy' } };
  const result = describeProviderSources(config);
  assert.equal(result.configuredLocation, 'same-fields');
  assert.doesNotMatch(JSON.stringify(result), /do-not-copy/);
  assert.match(result.scope, /not verified/);
  assert.equal(describeProviderSources({ ...config, ci: { ...config.ci, repository: 'different' } }).configuredLocation, 'not-established');
  assert.equal(describeProviderSources({ scm: { provider: 'ado', organization: 'org', project: 'p', repository: 'r' }, ci: { provider: 'ado-pipelines', organization: 'org', project: 'p' } }).configuredLocation, 'not-established');
  assert.throws(() => describeProviderSources({ ...config, scm: { ...config.scm, owner: 'team\nother' } }), /identity/);
});
