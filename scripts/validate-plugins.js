import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

/** Validate marketplace paths and the structural contract of installed skill sources. */
export async function validatePlugins(root) {
  const canonicalRoot = await realpath(root);
  const marketplace = JSON.parse(await readFile(join(canonicalRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  if (!marketplace.name || !marketplace.owner?.name || !Array.isArray(marketplace.plugins) || !marketplace.plugins.length) throw new Error('Invalid marketplace metadata');
  const pluginNames = new Set();
  let skills = 0;
  for (const entry of marketplace.plugins) {
    if (typeof entry.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) || pluginNames.has(entry.name) || typeof entry.source !== 'string' || !entry.source.startsWith('./')) throw new Error('Invalid marketplace plugin entry');
    pluginNames.add(entry.name);
    const pluginPath = await realpath(resolve(canonicalRoot, entry.source));
    const subpath = relative(canonicalRoot, pluginPath);
    if (!subpath || subpath === '..' || subpath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(subpath)) throw new Error('Plugin source escapes marketplace root');
    const manifest = JSON.parse(await readFile(join(pluginPath, '.claude-plugin', 'plugin.json'), 'utf8'));
    if (manifest.name !== entry.name || typeof manifest.version !== 'string' || !manifest.version) throw new Error('Plugin manifest does not match marketplace');
    const directories = await readdir(join(pluginPath, 'skills'), { withFileTypes: true });
    if (!directories.length) throw new Error('Plugin contains no skills');
    for (const directory of directories) {
      if (!directory.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(directory.name)) throw new Error('Invalid skill directory');
      const text = await readFile(join(pluginPath, 'skills', directory.name, 'SKILL.md'), 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      if (!match) throw new Error('Skill frontmatter missing');
      const metadata = parse(match[1], { uniqueKeys: true, maxAliasCount: 0 });
      if (metadata?.name !== directory.name || typeof metadata.description !== 'string' || !metadata.description.trim()) throw new Error('Invalid skill metadata');
      skills++;
    }
  }
  return { plugins: pluginNames.size, skills };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
  try {
    const result = await validatePlugins(root);
    console.log(`Validated ${result.plugins} plugins and ${result.skills} skills.`);
  } catch (error) {
    console.error(`Plugin validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
