import { join } from 'node:path';
import { parse } from 'yaml';
import { readLimitedFile } from './read-limited.js';
import { inspectAemSimpleBlock } from './aem-simple-block.js';
import { inspectHubRepositories } from './hub-repos.js';

/** Propose hub repos using explicitly configured reference-style routing metadata. */
export async function discoverHubSimpleRepositories({ cwd, path }) {
  const { fields } = await inspectAemSimpleBlock(path);
  const config = parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(join(cwd, '.ai', 'config.yaml'), 262144)), { uniqueKeys: true, maxAliasCount: 0 });
  const registry = await inspectHubRepositories({ cwd });
  if (!Array.isArray(config?.repos) || !config.repos.length || config.repos.length > 500) throw new Error('Reference routing metadata is missing');
  const entries = new Map();
  for (const repo of config.repos) {
    if (!repo || typeof repo !== 'object' || Array.isArray(repo) || typeof repo.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo.name) || !['frontend', 'backend', 'fullstack', 'config'].includes(repo.role) || typeof repo.platform !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo.platform) || (repo.brand !== undefined && (typeof repo.brand !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo.brand))) || entries.has(repo.name.toLowerCase())) throw new Error('Invalid or ambiguous repository routing metadata');
    entries.set(repo.name.toLowerCase(), repo);
  }
  const candidates = registry.repos.map(repo => ({ repo, route: entries.get(repo.name.toLowerCase()) }));
  if (!candidates.length || candidates.some(item => !item.route || item.repo.name !== item.route.name)) throw new Error('Hub and routing registry do not match exactly');
  const scope = fields.scope ?? 'both';
  if (typeof scope !== 'string' || !['fe', 'be', 'both'].includes(scope)) throw new Error('Invalid simple scope');
  for (const key of ['platform', 'brand']) if (fields[key] !== undefined && (typeof fields[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fields[key]))) throw new Error('Invalid routing field');
  const platforms = [...new Set(candidates.filter(item => item.route.role !== 'config').map(item => item.route.platform))];
  const platform = fields.platform ?? (platforms.length === 1 ? platforms[0] : null);
  if (!platform || !platforms.includes(platform)) throw new Error('Platform is missing or unknown');
  const matching = candidates.filter(item => item.route.role !== 'config' && item.route.platform === platform);
  const brands = [...new Set(matching.filter(item => item.route.role === 'frontend' && item.route.brand).map(item => item.route.brand))];
  const brand = fields.brand ?? null;
  if (scope !== 'be' && !brand && brands.length > 1) throw new Error('Brand is ambiguous');
  if (scope !== 'be' && brand && !matching.some(item => ['frontend', 'fullstack'].includes(item.route.role) && item.route.brand === brand)) throw new Error('Brand is unknown');
  const selected = matching.filter(({ route }) => {
    const frontend = ['frontend', 'fullstack'].includes(route.role), backend = ['backend', 'fullstack'].includes(route.role), brandMatches = !brand || !route.brand || route.brand === brand;
    return scope === 'fe' ? frontend && brandMatches : scope === 'be' ? backend : (backend && !frontend) || (frontend && brandMatches);
  });
  if (!selected.length) throw new Error('No repository matched');
  return { platform, brand, scope, repos: selected.map(({ repo, route }) => ({ ...repo, role: route.role, brand: route.brand ?? null })), warning: 'Source fields and configuration are editable declarations, not permission to dispatch.', observation: 'Repository identity, task suitability, live page and authoring ownership are not verified; no tasks were started.' };
}
