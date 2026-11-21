import { mkdir, lstat, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTrackerProvider, createScmProvider, createCiProvider, createDocumentationProvider } from './providers.js';

const allowed = {
  tracker: { github: ['provider', 'owner', 'repository'], gitlab: ['provider', 'project'], ado: ['provider', 'organization', 'project'], jira: ['provider', 'baseUrl'] },
  scm: { github: ['provider', 'owner', 'repository'], gitlab: ['provider', 'project'], ado: ['provider', 'organization', 'project', 'repository'], 'bitbucket-cloud': ['provider', 'workspace', 'repository'] },
  ci: { 'github-actions': ['provider', 'owner', 'repository'], 'gitlab-ci': ['provider', 'project'], 'ado-pipelines': ['provider', 'organization', 'project'], 'bitbucket-pipelines': ['provider', 'workspace', 'repository'] },
  documentation: { confluence: ['provider', 'baseUrl'] },
};
const dummy = { token: 'validation-only', gitlabToken: 'validation-only', adoToken: 'validation-only', bitbucketToken: 'validation-only', jiraEmail: 'validation@example.invalid', jiraToken: 'validation-only', confluenceEmail: 'validation@example.invalid', confluenceToken: 'validation-only' };
const factories = { tracker: createTrackerProvider, scm: createScmProvider, ci: createCiProvider, documentation: createDocumentationProvider };

export function validateProjectConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || !Object.keys(config).length) throw new TypeError('Provider config is required');
  for (const [section, value] of Object.entries(config)) {
    if (!Object.hasOwn(allowed, section) || !value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(allowed[section], value.provider)) throw new TypeError('Unsupported provider configuration');
    const keys = allowed[section][value.provider];
    if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => typeof value[key] !== 'string' || !value[key].trim())) throw new TypeError('Unexpected or missing provider field');
    factories[section](value, dummy);
  }
}

async function ensureSafeDirectory(path) {
  try { await mkdir(path); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Project setup path must be a directory');
}

/** Create a non-secret provider configuration without replacing existing files. */
export async function initializeProject({ cwd, config }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Target project is required');
  validateProjectConfig(config);
  const root = await realpath(cwd);
  const ai = join(root, '.ai');
  await ensureSafeDirectory(ai);
  await ensureSafeDirectory(join(ai, 'specs'));
  const path = join(ai, 'providers.json');
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path, specDirectory: join(ai, 'specs'), providers: Object.keys(config), note: 'Credentials remain in the environment; existing files were not replaced.' };
}
