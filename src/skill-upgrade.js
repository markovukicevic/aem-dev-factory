import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, realpath, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSkills } from './list-skills.js';
import { collectSkillAssets } from './skill-assets.js';
import { readLimitedFile } from './read-limited.js';
const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };
const defaultRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = files => files.map(file => ({ path: file.parts.join('/'), sha256: hash(file.bytes), executable: file.executable }));
async function safeDirectory(path) {
  const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe skill directory'); return info;
}
async function prepare({ client, target, name, sourceRoot }) {
  if (!Object.hasOwn(roots, client) || typeof target !== 'string' || !target.trim() || typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new TypeError('Invalid skill upgrade');
  await safeDirectory(target);
  const root = await realpath(target), source = await realpath(sourceRoot);
  const catalog = await listSkills({ sourceRoot: source }), match = catalog.skills.filter(item => item.name === name);
  if (match.length !== 1 || !match[0].installable) throw new Error('Bundled skill unavailable');
  const marketplace = JSON.parse((await readLimitedFile(join(source, '.claude-plugin', 'marketplace.json'), 262144)).toString('utf8'));
  const plugins = marketplace.plugins.filter(item => item.name === match[0].plugin);
  if (plugins.length !== 1 || typeof plugins[0].source !== 'string' || !/^\.\/plugins\/[A-Za-z0-9_-]+$/.test(plugins[0].source)) throw new Error('Invalid skill source');
  const candidate = join(source, plugins[0].source, 'skills', name); await safeDirectory(candidate);
  const canonical = await realpath(candidate), subpath = relative(source, canonical);
  if (!subpath || subpath === '..' || subpath.startsWith('../') || isAbsolute(subpath)) throw new Error('Unsafe skill source');
  let parent = root;
  for (const part of [roots[client], 'skills']) { parent = join(parent, part); await safeDirectory(parent); }
  const destination = join(parent, name), info = await safeDirectory(destination);
  const [installed, bundled] = await Promise.all([collectSkillAssets(destination, { requireMain: false }), collectSkillAssets(canonical)]);
  const oldFiles = manifest(installed), newFiles = manifest(bundled);
  const oldMap = new Map(oldFiles.map(file => [file.path, file])), newMap = new Map(newFiles.map(file => [file.path, file]));
  const added = newFiles.filter(file => !oldMap.has(file.path)).map(file => file.path), removed = oldFiles.filter(file => !newMap.has(file.path)).map(file => file.path), changed = newFiles.filter(file => oldMap.has(file.path) && (oldMap.get(file.path).sha256 !== file.sha256 || oldMap.get(file.path).executable !== file.executable)).map(file => file.path);
  const digest = hash(JSON.stringify({ client, root, name, source: canonical, oldFiles, newFiles }));
  return { root, parent, destination, source: canonical, installedInfo: { dev: info.dev, ino: info.ino }, bundled, added, removed, changed, digest };
}
/** Preview or replace a selected skill while preserving its previous directory. */
export async function processSkillUpgrade({ client, target, name, sourceRoot = defaultRoot, expectedDigest }) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid upgrade digest');
  const first = await prepare({ client, target, name, sourceRoot });
  const summary = { client, target: first.root, name, destination: first.destination, added: first.added, removed: first.removed, changed: first.changed, digest: first.digest };
  if (expectedDigest === undefined) return { preview: summary, scope: 'Read-only comparison. Review local customizations before explicitly applying; files can change later.' };
  if (first.digest !== expectedDigest) return { updated: false, reason: 'preview-changed' };
  if (!first.added.length && !first.removed.length && !first.changed.length) return { updated: false, reason: 'already-matches' };
  const stage = join(first.parent, `.upgrade-${name}-${randomUUID()}`), backup = join(first.parent, `.backup-${name}-${randomUUID()}`);
  await mkdir(stage, { mode: 0o700 });
  for (const file of first.bundled) {
    let directory = stage;
    for (const part of file.parts.slice(0, -1)) { directory = join(directory, part); try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; } await safeDirectory(directory); }
    const path = join(directory, file.parts.at(-1));
    await writeFile(path, file.bytes, { flag: 'wx', mode: file.executable ? 0o700 : 0o600 });
    if (file.executable) await chmod(path, 0o700);
  }
  const staged = manifest(await collectSkillAssets(stage));
  if (JSON.stringify(staged) !== JSON.stringify(manifest(first.bundled))) return { updated: false, reason: 'staged-skill-changed', stagedPath: stage };
  const final = await prepare({ client, target, name, sourceRoot });
  if (final.digest !== expectedDigest || final.installedInfo.dev !== first.installedInfo.dev || final.installedInfo.ino !== first.installedInfo.ino) return { updated: false, reason: 'preview-changed', stagedPath: stage };
  await rename(first.destination, backup);
  try { await rename(stage, first.destination); }
  catch { try { await rename(backup, first.destination); } catch { return { updated: false, reason: 'replacement-and-rollback-failed', backupPath: backup, stagedPath: stage }; } return { updated: false, reason: 'replacement-failed-restored', stagedPath: stage }; }
  return { updated: true, destination: first.destination, backupPath: backup, scope: 'Previous files were retained in the backup. Inspect the new skill and backup; client discovery and behavior are not verified.' };
}
