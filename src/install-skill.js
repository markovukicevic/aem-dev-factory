import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { collectSkillAssets } from './skill-assets.js';

const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function ensureDirectory(path) {
  try { await mkdir(path); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Skill destination contains a non-directory or symlink');
}

/** Install one bounded skill directory into an explicitly chosen project. */
export async function installSkill({ client, name, target, sourceRoot = projectRoot }) {
  if (!Object.hasOwn(roots, client)) throw new TypeError('Unsupported skill client');
  if (typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new TypeError('Invalid skill name');
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('Target project is required');
  const root = await realpath(target);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new TypeError('Target must be a directory');
  const marketplace = JSON.parse(await readFile(join(sourceRoot, '.claude-plugin', 'marketplace.json'), 'utf8'));
  if (!Array.isArray(marketplace.plugins)) throw new Error('Invalid marketplace');
  const matches = [];
  const sourceCanonical = await realpath(sourceRoot);
  for (const plugin of marketplace.plugins) {
    if (typeof plugin.source !== 'string' || !/^\.\/plugins\/[A-Za-z0-9_-]+$/.test(plugin.source)) throw new Error('Invalid plugin source');
    const path = join(sourceCanonical, plugin.source, 'skills', name);
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid source skill directory');
      const skillPath = await realpath(path);
      if (!skillPath.startsWith(`${sourceCanonical}/`)) throw new Error('Source skill escapes project');
      matches.push(path);
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (matches.length !== 1) throw new Error('Skill not found or ambiguous');
  const files = await collectSkillAssets(matches[0]);
  const main = files.find(file => file.parts.length === 1 && file.parts[0] === 'SKILL.md');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(main.bytes);
  if (Buffer.byteLength(text, 'utf8') > 262144) throw new Error('Skill file exceeds size limit');
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const metadata = header ? parse(header[1], { uniqueKeys: true, maxAliasCount: 0 }) : null;
  if (metadata?.name !== name || typeof metadata.description !== 'string' || !metadata.description.trim()) throw new Error('Invalid skill metadata');
  const clientRoot = join(root, roots[client]);
  const skillsRoot = join(clientRoot, 'skills');
  await ensureDirectory(clientRoot);
  await ensureDirectory(skillsRoot);
  const destination = join(skillsRoot, name);
  try { await mkdir(destination); } catch (error) { if (error?.code === 'EEXIST') throw new Error('Skill destination already exists'); throw error; }
  try {
    for (const file of files) {
      let parent = destination;
      for (const part of file.parts.slice(0, -1)) { parent = join(parent, part); await ensureDirectory(parent); }
      await writeFile(join(parent, file.parts.at(-1)), file.bytes, { flag: 'wx', mode: file.executable ? 0o755 : 0o644 });
    }
  }
  catch (error) { throw new Error('Skill copy failed; inspect the newly created destination before retrying', { cause: error }); }
  return { client, name, path: destination, files: files.length };
}
