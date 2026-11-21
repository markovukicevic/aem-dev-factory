import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, realpath, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function ensureDirectory(path) {
  try { await mkdir(path); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Skill destination contains a non-directory or symlink');
}

/** Install one self-contained SKILL.md into an explicitly chosen project. */
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
      const files = await readdir(path, { withFileTypes: true });
      if (files.length !== 1 || files[0].name !== 'SKILL.md' || !files[0].isFile()) throw new Error('Only self-contained skills are supported');
      matches.push(path);
    } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  if (matches.length !== 1) throw new Error('Skill not found or ambiguous');
  const source = join(matches[0], 'SKILL.md');
  const text = await readFile(source, 'utf8');
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
  try { await copyFile(source, join(destination, 'SKILL.md'), constants.COPYFILE_EXCL); }
  catch (error) { throw new Error('Skill copy failed; inspect the newly created destination before retrying', { cause: error }); }
  return { client, name, path: destination };
}
