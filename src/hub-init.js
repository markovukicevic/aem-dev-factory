import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';

async function directory(path) {
  try { await mkdir(path); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Hub path must be a directory');
}

/** Initialize only a new, explicit reference-style hub registry; no dispatch. */
export async function initializeHub({ cwd, repos }) {
  if (typeof cwd !== 'string' || !cwd.trim() || !Array.isArray(repos) || repos.length < 1 || repos.length > 500) throw new TypeError('A hub directory and repository list are required');
  const seen = new Set();
  const entries = repos.map(repo => {
    if (!repo || typeof repo !== 'object' || Array.isArray(repo) || Object.keys(repo).some(key => !['name', 'path', 'base-branch', 'project'].includes(key)) || typeof repo.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo.name) || seen.has(repo.name) || typeof repo.path !== 'string' || !repo.path.trim() || repo.path !== repo.path.trim() || repo.path.startsWith('~') || /[\u0000-\u001f]/.test(repo.path)) throw new TypeError('Invalid repository entry');
    seen.add(repo.name);
    for (const key of ['base-branch', 'project']) if (repo[key] !== undefined && (typeof repo[key] !== 'string' || !repo[key].trim() || repo[key] !== repo[key].trim() || /[\u0000-\u001f]/.test(repo[key]))) throw new TypeError('Invalid repository metadata');
    return { name: repo.name, path: repo.path, ...(repo['base-branch'] ? { 'base-branch': repo['base-branch'] } : {}), ...(repo.project ? { project: repo.project } : {}) };
  });
  const root = await realpath(cwd);
  await directory(join(root, '.ai'));
  await directory(join(root, 'state'));
  const path = join(root, '.ai', 'config.yaml');
  await writeFile(path, stringify({ hub: { enabled: true, repos: entries } }), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path, repositories: entries.length, scope: 'Local hub registry only; repositories and dispatch have not been validated.' };
}
