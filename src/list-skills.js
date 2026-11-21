import { readdir, realpath, lstat } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { readLimitedFile } from './read-limited.js';
const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Discover plugin skills and report whether the current one-file installer supports them. */
export async function listSkills({ sourceRoot = defaultRoot } = {}) {
  const root = await realpath(sourceRoot);
  const marketplace = JSON.parse((await readLimitedFile(join(root, '.claude-plugin', 'marketplace.json'), 262144)).toString('utf8'));
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length > 100) throw new Error('Invalid marketplace');
  const skills = [];
  for (const plugin of marketplace.plugins) {
    if (typeof plugin.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plugin.name) || typeof plugin.source !== 'string' || !/^\.\/plugins\/[A-Za-z0-9_-]+$/.test(plugin.source)) throw new Error('Invalid plugin');
    const pluginPath = await realpath(join(root, plugin.source));
    const subpath = relative(root, pluginPath);
    if (!subpath || subpath === '..' || subpath.startsWith('../') || isAbsolute(subpath)) throw new Error('Plugin escapes project');
    const skillRoot = join(pluginPath, 'skills');
    const entries = await readdir(skillRoot, { withFileTypes: true });
    if (entries.length > 1000) throw new Error('Skill limit exceeded');
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) throw new Error('Invalid skill directory');
      const path = join(skillRoot, entry.name);
      const info = await lstat(path);
      const canonical = await realpath(path);
      const relation = relative(root, canonical);
      if (info.isSymbolicLink() || !info.isDirectory() || !relation || relation === '..' || relation.startsWith('../') || isAbsolute(relation)) throw new Error('Invalid skill path');
      const items = await readdir(path, { withFileTypes: true });
      const skillFile = items.find(item => item.name === 'SKILL.md');
      if (!skillFile?.isFile()) throw new Error('Invalid skill file');
      const text = (await readLimitedFile(join(path, 'SKILL.md'), 262144)).toString('utf8');
      const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      const meta = front ? parse(front[1], { uniqueKeys: true, maxAliasCount: 0 }) : null;
      if (meta?.name !== entry.name || typeof meta.description !== 'string' || !meta.description.trim()) throw new Error('Invalid skill metadata');
      skills.push({ name: meta.name, description: meta.description, plugin: plugin.name, installable: items.length === 1 });
    }
  }
  const counts = new Map();
  for (const skill of skills) counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  for (const skill of skills) if (counts.get(skill.name) !== 1) skill.installable = false;
  skills.sort((a, b) => a.name.localeCompare(b.name) || a.plugin.localeCompare(b.plugin));
  return { skills, scope: 'Installer support only; discovery and behavior in AI clients are not verified.' };
}
