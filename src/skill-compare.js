import { createHash } from 'node:crypto';
import { lstat, realpath, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSkills } from './list-skills.js';
import { readLimitedFile } from './read-limited.js';
import { collectSkillAssets } from './skill-assets.js';
const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };
const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Compare exact bytes and executable flags without modifying either copy. */
export async function compareInstalledSkill({ client, name, target, sourceRoot = defaultRoot, catalog: suppliedCatalog }) {
  if (!Object.hasOwn(roots, client) || typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || typeof target !== 'string' || !target.trim()) throw new TypeError('Invalid skill comparison');
  const root = await realpath(target), source = await realpath(sourceRoot);
  if (!(await lstat(root)).isDirectory()) throw new Error('Invalid target project');
  const catalog = suppliedCatalog ?? await listSkills({ sourceRoot: source }), matching = catalog.skills.filter(skill => skill.name === name);
  if (matching.length !== 1 || !matching[0].installable) throw new Error('Source skill unavailable or ambiguous');
  const marketplace = JSON.parse((await readLimitedFile(join(source, '.claude-plugin', 'marketplace.json'), 262144)).toString('utf8'));
  const entries = marketplace.plugins.filter(plugin => plugin.name === matching[0].plugin);
  if (entries.length !== 1 || typeof entries[0].source !== 'string' || !/^\.\/plugins\/[A-Za-z0-9_-]+$/.test(entries[0].source)) throw new Error('Invalid plugin source');
  const candidate = join(source, entries[0].source, 'skills', name), sourceInfo = await lstat(candidate), canonical = await realpath(candidate), inside = relative(source, canonical);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink() || !inside || inside === '..' || inside.startsWith('../') || isAbsolute(inside)) throw new Error('Unsafe source skill');
  const original = await collectSkillAssets(canonical);
  const destination = join(root, roots[client], 'skills', name);
  let current = root;
  for (const part of [roots[client], 'skills', name]) {
    current = join(current, part);
    try { const item = await lstat(current); if (!item.isDirectory() || item.isSymbolicLink()) throw new Error('Unsafe installed skill path'); }
    catch (error) { if (error?.code === 'ENOENT') return { status: 'missing', destination, sourceFiles: original.length, scope: 'Read-only current file comparison; source provenance, client discovery and future state are not verified.' }; throw error; }
  }
  const installed = await collectSkillAssets(destination, { requireMain: false }), hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const index = files => new Map(files.map(item => [item.parts.join('/'), { hash: hash(item.bytes), executable: item.executable }]));
  const expected = index(original), actual = index(installed), added = [], missing = [], changed = [], permissionsChanged = [];
  for (const [path, item] of expected) {
    const other = actual.get(path);
    if (!other) missing.push(path);
    else { if (item.hash !== other.hash) changed.push(path); if (item.executable !== other.executable) permissionsChanged.push(path); }
  }
  for (const path of actual.keys()) if (!expected.has(path)) added.push(path);
  const matches = !added.length && !missing.length && !changed.length && !permissionsChanged.length;
  return { status: matches ? 'matches' : 'different', destination, sourceFiles: expected.size, installedFiles: actual.size, added, missing, changed, permissionsChanged, scope: 'Read-only exact file comparison at one point in time; local customization, source authenticity, client discovery and behavior are not assessed. Files may change afterward.' };
}


/** Compare installed bundled skills and report custom or unreadable entries without changes. */
export async function auditInstalledSkills({ client, target, sourceRoot = defaultRoot }) {
  if (!Object.hasOwn(roots, client) || typeof target !== 'string' || !target.trim()) throw new TypeError('Invalid skill audit');
  const input = await lstat(target); if (!input.isDirectory() || input.isSymbolicLink()) throw new Error('Invalid target project');
  const root = await realpath(target), source = await realpath(sourceRoot), catalog = await listSkills({ sourceRoot: source });
  let directory = root;
  for (const part of [roots[client], 'skills']) {
    directory = join(directory, part);
    try { const info = await lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid skill directory'); }
    catch (error) { if (error?.code === 'ENOENT') return { client, target: root, skills: [], scope: 'No selected-client skill directory found; client discovery and runtime behavior are not established.' }; throw error; }
  }
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length > 100) throw new Error('Installed skill audit limit exceeded');
  const skills = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) { skills.push({ name: entry.name, status: 'unsupported' }); continue; }
    const match = catalog.skills.filter(skill => skill.name === entry.name);
    if (!match.length) { skills.push({ name: entry.name, status: 'custom-or-unknown' }); continue; }
    if (match.length !== 1 || !match[0].installable) { skills.push({ name: entry.name, status: 'source-unsupported-or-ambiguous' }); continue; }
    try { const comparison = await compareInstalledSkill({ client, name: entry.name, target: root, sourceRoot: source, catalog }); skills.push({ name: entry.name, ...comparison }); }
    catch { skills.push({ name: entry.name, status: 'unreadable-or-unsafe' }); }
  }
  return { client, target: root, skills, scope: 'Read-only comparison of installed directories with bundled source. Customization may be intentional; source authenticity, client discovery and runtime behavior are not established.' };
}
