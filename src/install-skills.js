import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { listSkills } from './list-skills.js';
import { installSkill } from './install-skill.js';
const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };

async function safeExistingDirectory(path) {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Destination contains a symlink or non-directory');
    return true;
  } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
}

/** Install an explicit list after preflight; partial results are never rolled back. */
export async function installSkills({ client, target, names, sourceRoot }, { list = listSkills, install = installSkill } = {}) {
  if (!Object.hasOwn(roots, client) || typeof target !== 'string' || !target.trim() || !Array.isArray(names) || !names.length || names.length > 100 || names.some(name => typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) || new Set(names).size !== names.length) throw new TypeError('Invalid skill installation request');
  const root = await realpath(target);
  const info = await lstat(root);
  if (!info.isDirectory()) throw new TypeError('Target must be a directory');
  const catalog = await list(sourceRoot === undefined ? {} : { sourceRoot });
  for (const name of names) {
    const matching = catalog.skills.filter(skill => skill.name === name);
    if (matching.length !== 1 || matching[0].installable !== true) throw new Error('Skill is unavailable, ambiguous or unsupported by the installer');
  }
  const clientRoot = join(root, roots[client]);
  const skillRoot = join(clientRoot, 'skills');
  if (await safeExistingDirectory(clientRoot) && await safeExistingDirectory(skillRoot)) {
    for (const name of names) {
      try { await lstat(join(skillRoot, name)); throw new Error(`Skill destination already exists: ${name}`); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
  }
  const installed = [];
  for (const name of names) {
    try { installed.push(await install({ client, name, target: root, ...(sourceRoot === undefined ? {} : { sourceRoot }) })); }
    catch { return { complete: false, installed, failed: name, note: 'Installation stopped; inspect installed files and any partial destination before retrying.' }; }
  }
  return { complete: true, installed, note: 'Client discovery and skill behavior are not verified.' };
}
