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

/** Resolve explicit registry names only; never infer repos from ticket text. */
export async function selectHubRepositories({ cwd, names }) {
  if (!Array.isArray(names) || !names.length || names.length > 500 || names.some(name => typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) || new Set(names).size !== names.length) throw new TypeError('Unique repository names are required');
  const registry = await inspectHubRepositories({ cwd });
  const byName = new Map(registry.repos.map(repo => [repo.name, repo]));
  const unknown = names.filter(name => !byName.has(name));
  if (unknown.length) throw new Error(`Unknown hub repositories: ${unknown.join(', ')}`);
  return { repos: names.map(name => byName.get(name)), scope: 'Explicit registry selection only; paths, repository identity and task suitability require verification.' };
}

/** Extract exactly one explicit repos directive outside fenced code blocks. */
export function parseHubRepositoryDirective(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 262144) throw new TypeError('Invalid directive text');
  let fence = null;
  const found = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;
    const match = /^\s*repos\s*:\s*(.*?)\s*$/i.exec(line);
    if (!match) continue;
    if (!match[1]) throw new Error('Empty repository directive');
    const names = match[1].split(',').map(name => name.trim());
    if (names.some(name => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) || new Set(names).size !== names.length) throw new Error('Invalid repository directive');
    found.push(names);
  }
  if (fence) throw new Error('Unclosed code fence');
  if (found.length !== 1) throw new Error(found.length ? 'Ambiguous repository directives' : 'Repository directive not found');
  return found[0];
}

/** Resolve a directive as a proposal only; source text cannot authorize dispatch. */
export async function discoverHubRepositories({ cwd, path }) {
  const text = (await readLimitedFile(path, 262144)).toString('utf8');
  const selected = await selectHubRepositories({ cwd, names: parseHubRepositoryDirective(text) });
  return { ...selected, scope: 'Untrusted source directive resolved as a proposal only; verify intent and repository identity before work.' };
}

/** Extract explicit repository names from one Cross-Repo Scope Markdown table. */
export function parseHubScopeTable(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 262144) throw new TypeError('Invalid scope document');
  let fence = null, inSection = false, sections = 0, header = false, separator = false; const names = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (marker) { if (!fence) fence = { char: marker[1][0], length: marker[1].length }; else if (marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null; continue; }
    if (fence) continue;
    if (/^##\s+Cross-Repo Scope(?:\s|$)/i.test(line)) { if (++sections > 1) throw new Error('Ambiguous scope sections'); inSection = true; continue; }
    if (inSection && /^##\s+/.test(line)) { inSection = false; continue; }
    if (!inSection || !/^\s*\|/.test(line)) continue;
    const cells = line.trim().split('|').slice(1); if (cells.at(-1) === '') cells.pop();
    if (cells.length < 2) throw new Error('Invalid scope table row');
    const cell = cells[0].trim(), wrapped = /^(?:`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)$/.exec(cell);
    const first = (wrapped ? wrapped[1] ?? wrapped[2] ?? wrapped[3] : cell).trim();
    if (!header) { if (first.toLowerCase() !== 'repo') throw new Error('Invalid scope table header'); header = true; continue; }
    if (!separator) { if (!cells.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell))) throw new Error('Invalid scope table separator'); separator = true; continue; }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(first) || names.some(name => name.toLowerCase() === first.toLowerCase())) throw new Error('Invalid or duplicate scope repository');
    names.push(first); if (names.length > 100) throw new Error('Scope table exceeds limit');
  }
  if (fence || sections !== 1 || !header || !separator || !names.length) throw new Error('Scope table unavailable');
  return names;
}
/** Resolve a scope table against registered names without executing tasks. */
export async function discoverHubScopeTable({ cwd, path }) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(path, 262144));
  const names = parseHubScopeTable(text), { repos } = await inspectHubRepositories({ cwd });
  const byName = new Map();
  for (const repo of repos) { const key = repo.name.toLowerCase(); if (byName.has(key)) throw new Error('Ambiguous registry names'); byName.set(key, repo); }
  const selected = [], unknown = [];
  for (const name of names) { const repo = byName.get(name.toLowerCase()); if (repo) selected.push(repo); else unknown.push(name); }
  return { repos: selected, unknown, complete: unknown.length === 0, scope: 'Explicit names in one untrusted scope table are proposals only; verify repository identity and intent before work.' };
}
