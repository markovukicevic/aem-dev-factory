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

/** Inspect local workflow files and dependency resolution without loading project code. */
export async function inspectWorkflowSetup({ target, client, env = process.env }) {
  const { lstat, realpath, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { createRequire } = await import('node:module');
  const { readLimitedFile } = await import('./read-limited.js');
  const { parseLegacyConfig } = await import('./legacy-config.js');
  const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };
  if (typeof target !== 'string' || !target.trim() || !Object.hasOwn(roots, client)) throw new TypeError('Invalid workflow inspection');
  const input = await lstat(target); if (!input.isDirectory() || input.isSymbolicLink()) throw new Error('Invalid project directory');
  const root = await realpath(target);
  async function marker(parts, type) {
    let path = root;
    for (const [index, part] of parts.entries()) {
      path = join(path, part);
      try { const info = await lstat(path); if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : type === 'directory' ? !info.isDirectory() : !info.isFile())) return { status: 'unsupported', path }; }
      catch (error) { if (error?.code === 'ENOENT') return { status: 'missing', path: join(root, ...parts) }; return { status: 'unreadable', path }; }
    }
    return { status: 'present', path };
  }
  const files = {};
  for (const [name, parts, type] of [ ['providers', ['.ai', 'providers.json'], 'file'], ['legacyConfig', ['.ai', 'config.yaml'], 'file'], ['rules', ['.ai', 'rules'], 'directory'], ['skills', [roots[client], 'skills'], 'directory'], ['mcpConfig', ['.mcp.json'], 'file'] ]) files[name] = await marker(parts, type);
  let providers = null;
  if (files.providers.status === 'present') {
    try { providers = inspectProviderConfiguration({ config: JSON.parse((await readLimitedFile(files.providers.path, 262144)).toString('utf8')), env }); }
    catch { files.providers.status = 'invalid-or-unreadable'; }
  }
  if (files.legacyConfig.status === 'present') {
    try { parseLegacyConfig((await readLimitedFile(files.legacyConfig.path, 262144)).toString('utf8')); files.legacyConfig.readiness = 'supported-settings-present'; }
    catch { files.legacyConfig.readiness = 'unavailable-or-unsupported'; }
  }
  let skills = [];
  if (files.skills.status === 'present') {
    const entries = await readdir(files.skills.path, { withFileTypes: true }); if (entries.length > 1000) throw new Error('Skill directory limit exceeded');
    skills = entries.filter(entry => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)).map(entry => ({ name: entry.name, status: entry.isDirectory() && !entry.isSymbolicLink() ? 'directory-present' : 'unsupported' })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const require = createRequire(join(root, 'package.json'));
  const dependencies = ['playwright', 'axe-core'].map(name => { try { require.resolve(name); return { name, status: 'resolvable' }; } catch { return { name, status: 'not-resolved' }; } });
  return { root, client, files, providers, skills, dependencies, scope: 'Local file markers, environment presence and Node resolution only; client discovery, package behavior, credentials, MCP services and live access are not verified.' };
}
