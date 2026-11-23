import { createHash, randomUUID } from 'node:crypto';
import { lstat, realpath, rename } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { collectSkillAssets } from './skill-assets.js';
const roots = { codex: '.agents', claude: '.claude', copilot: '.github' };
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = files => files.map(file => ({ path: file.parts.join('/'), sha256: hash(file.bytes), executable: file.executable }));
async function directory(path) { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe skill directory'); return { dev: info.dev, ino: info.ino }; }
async function prepare({ client, target, name, backupPath }) {
  if (!Object.hasOwn(roots, client) || typeof target !== 'string' || !target.trim() || typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || typeof backupPath !== 'string' || !backupPath.trim()) throw new TypeError('Invalid skill restore');
  await directory(target); const root = await realpath(target); let parent = root;
  for (const part of [roots[client], 'skills']) { parent = join(parent, part); await directory(parent); }
  const backup = resolve(backupPath), prefix = `.backup-${name}-`, suffix = basename(backup).slice(prefix.length);
  if (dirname(backup) !== parent || !basename(backup).startsWith(prefix) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(suffix)) throw new Error('Backup must be a matching sibling created by skill upgrade');
  const destination = join(parent, name), currentInfo = await directory(destination), backupInfo = await directory(backup);
  const [current, previous] = await Promise.all([collectSkillAssets(destination, { requireMain: false }), collectSkillAssets(backup, { requireMain: false })]);
  const currentFiles = manifest(current), backupFiles = manifest(previous);
  const preview = { client, target: root, name, destination, backup, currentFiles, backupFiles };
  return { preview, digest: hash(JSON.stringify(preview)), currentInfo, backupInfo, parent };
}
/** Restore an explicitly selected backup, preserving the current version as another backup. */
export async function processSkillRestore({ client, target, name, backupPath, expectedDigest }) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid restore digest');
  const input = { client, target, name, backupPath }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only preview. Review the selected backup and current files before an explicit restore.' };
  if (first.digest !== expectedDigest) return { restored: false, reason: 'preview-changed' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest || final.currentInfo.dev !== first.currentInfo.dev || final.currentInfo.ino !== first.currentInfo.ino || final.backupInfo.dev !== first.backupInfo.dev || final.backupInfo.ino !== first.backupInfo.ino) return { restored: false, reason: 'preview-changed' };
  const currentBackup = join(first.parent, `.backup-${name}-${randomUUID()}`);
  await rename(first.preview.destination, currentBackup);
  try { await rename(first.preview.backup, first.preview.destination); }
  catch { try { await rename(currentBackup, first.preview.destination); } catch { return { restored: false, reason: 'restore-and-rollback-failed', currentBackup, requestedBackup: first.preview.backup }; } return { restored: false, reason: 'restore-failed-reverted', requestedBackup: first.preview.backup }; }
  return { restored: true, destination: first.preview.destination, preservedCurrent: currentBackup, scope: 'The previous current version was retained. Client discovery and behavior are not verified; concurrent changes remain possible.' };
}
