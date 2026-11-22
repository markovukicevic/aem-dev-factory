const scmFields = { github: ['owner', 'repository'], gitlab: ['project'], 'bitbucket-cloud': ['workspace', 'repository'], ado: ['organization', 'project', 'repository'] };
const ciFields = { 'github-actions': ['owner', 'repository'], 'gitlab-ci': ['project'], 'bitbucket-pipelines': ['workspace', 'repository'], 'ado-pipelines': ['organization', 'project'] };

/** Copy only non-secret, provider-specific source identity fields. */
export function describeProviderSources(config) {
  function select(value, schema) {
    if (!value || !Object.hasOwn(schema, value.provider)) throw new TypeError('Unsupported provider identity');
    const result = { provider: value.provider };
    for (const field of schema[value.provider]) {
      const text = value[field];
      if (typeof text !== 'string' || !text.trim() || text !== text.trim() || text.length > 512 || /[\u0000-\u001f\u007f]/.test(text)) throw new TypeError('Invalid provider identity field');
      result[field] = text;
    }
    return result;
  }
  const scm = select(config?.scm, scmFields), ci = select(config?.ci, ciFields);
  const matching = (scm.provider === 'github' && ci.provider === 'github-actions' && scm.owner === ci.owner && scm.repository === ci.repository) ||
    (scm.provider === 'gitlab' && ci.provider === 'gitlab-ci' && scm.project === ci.project) ||
    (scm.provider === 'bitbucket-cloud' && ci.provider === 'bitbucket-pipelines' && scm.workspace === ci.workspace && scm.repository === ci.repository);
  return { scm, ci, configuredLocation: matching ? 'same-fields' : 'not-established', scope: 'Configured identifiers only; actual repository identity and access are not verified.' };
}
