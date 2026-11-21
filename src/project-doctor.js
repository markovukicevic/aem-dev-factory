import { validateProjectConfig } from './project-init.js';
const required = {
  github: ['GITHUB_TOKEN'], 'github-actions': ['GITHUB_TOKEN'],
  gitlab: ['GITLAB_TOKEN'], 'gitlab-ci': ['GITLAB_TOKEN'],
  ado: ['ADO_PAT'], 'ado-pipelines': ['ADO_PAT'],
  'bitbucket-cloud': ['BITBUCKET_TOKEN'], 'bitbucket-pipelines': ['BITBUCKET_TOKEN'],
  jira: ['JIRA_EMAIL', 'JIRA_API_TOKEN'], confluence: ['CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN'],
};
/** Report configuration structure and credential presence without exposing values. */
export function inspectProviderConfiguration({ config, env = process.env }) {
  validateProjectConfig(config);
  const providers = Object.entries(config).map(([section, value]) => ({ section, provider: value.provider, credentials: required[value.provider].map(name => ({ name, present: typeof env[name] === 'string' && !!env[name].trim() })) }));
  return { providers, scope: 'Configuration structure and environment variable presence only; service access and permission validity are not verified.' };
}
