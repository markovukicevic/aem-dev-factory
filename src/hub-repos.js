import { lstat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { readLimitedFile } from './read-limited.js';

/** Inspect configured hub repositories without dispatching or mutating them. */
export async function inspectHubRepositories({ cwd }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Hub directory is required');
  const config = parse((await readLimitedFile(join(cwd, '.ai', 'config.yaml'), 262144)).toString('utf8'), { uniqueKeys: true, maxAliasCount: 0 });
  if (config?.hub?.enabled !== true || !Array.isArray(config.hub.repos) || config.hub.repos.length > 500) throw new Error('Invalid or disabled hub configuration');
  const seen = new Set();
  const repos = [];
  for (const repo of config.hub.repos) {
    if (!repo || typeof repo.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo.name) || seen.has(repo.name) || typeof repo.path !== 'string' || !repo.path.trim() || repo.path !== repo.path.trim() || repo.path.startsWith('~') || /[\u0000-\u001f]/.test(repo.path)) throw new Error('Invalid hub repository entry');
    seen.add(repo.name);
    const path = isAbsolute(repo.path) ? resolve(repo.path) : resolve(cwd, repo.path);
    let status = 'missing';
    let gitMarker = 'unknown';
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) status = 'unsupported';
      else {
        status = 'available';
        try { const git = await lstat(join(path, '.git')); gitMarker = git.isSymbolicLink() ? 'unsupported' : git.isFile() || git.isDirectory() ? 'present' : 'unsupported'; }
        catch (error) { if (error?.code === 'ENOENT') gitMarker = 'missing'; else gitMarker = 'unreadable'; }
      }
    } catch (error) { if (error?.code !== 'ENOENT') status = 'unreadable'; }
    repos.push({ name: repo.name, path, status, gitMarker, baseBranch: typeof repo['base-branch'] === 'string' ? repo['base-branch'] : null, project: typeof repo.project === 'string' ? repo.project : null });
  }
  return { repos, scope: 'Configured local paths and Git markers only; repository identity, access, health and live work are not verified.' };
}
