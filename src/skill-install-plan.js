import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { listSkills } from './list-skills.js';
const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };

/** Preview selected skill installation without creating directories or files. */
export async function planSkillInstallation({ client, target, names, sourceRoot }) {
  if (!Object.hasOwn(roots, client) || typeof target !== 'string' || !target.trim() || !Array.isArray(names) || !names.length || names.length > 100 || names.some(name => typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) || new Set(names).size !== names.length) throw new TypeError('Invalid installation request');
  const root = await realpath(target), rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error('Invalid target project');
  const catalog = await listSkills(sourceRoot === undefined ? {} : { sourceRoot });
  let parent = root, parentMissing = false;
  for (const component of [roots[client], 'skills']) {
    parent = join(parent, component);
    if (parentMissing) continue;
    try { const info = await lstat(parent); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe target directory'); }
    catch (error) { if (error?.code === 'ENOENT') parentMissing = true; else throw error; }
  }
  const skills = [];
  for (const name of names) {
    const matching = catalog.skills.filter(skill => skill.name === name), destination = join(parent, name);
    let exists = false;
    if (!parentMissing) { try { await lstat(destination); exists = true; } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
    const status = matching.length === 0 ? 'missing-source' : matching.length !== 1 || !matching[0].installable ? 'unsupported-or-ambiguous' : exists ? 'destination-exists' : 'available';
    skills.push({ name, status, destination });
  }
  return { client, target: root, skills, available: skills.every(skill => skill.status === 'available'), scope: 'Read-only preflight only; files and destinations can change before installation. Client discovery and skill behavior are not verified.' };
}
