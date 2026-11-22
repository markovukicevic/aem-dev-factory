import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';

export const AEM_KNOWLEDGE_FILES = [
  { source: 'components/component-index.md', destination: 'component-index-project.md', required: true },
  { source: 'project.yaml', destination: 'project.yaml', required: true },
  { source: 'file-patterns.yaml', destination: 'file-patterns.yaml', required: true },
  { source: 'content-paths.yaml', destination: 'content-paths.yaml', required: false },
  { source: 'architecture.md', destination: 'architecture.md', required: true },
  { source: 'features.md', destination: 'features.md', required: true },
];

async function inspectPath(root, parts, lastType) {
  let path = root;
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]);
    let info;
    try { info = await lstat(path); } catch (error) { return error?.code === 'ENOENT' ? 'missing' : 'unreadable'; }
    if (info.isSymbolicLink()) return 'unsafe';
    if (i < parts.length - 1 && !info.isDirectory()) return 'unsafe';
    if (i === parts.length - 1) {
      if (lastType === 'file' && (!info.isFile() || info.size > 1024 * 1024)) return 'unsafe';
      if (lastType === 'directory' && !info.isDirectory()) return 'unsafe';
    }
  }
  return 'present';
}

async function safeRoot(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Directory is required');
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Directory must be local and non-symlinked');
  return realpath(path);
}

/** Preview explicit local seed inputs and destination collisions without writing. */
export async function previewAemRefresh({ source, target }) {
  const sourceRoot = await safeRoot(source), targetRoot = await safeRoot(target);
  const ai = await inspectPath(targetRoot, ['.ai'], 'directory');
  const project = ai === 'present' ? await inspectPath(targetRoot, ['.ai', 'project'], 'directory') : ai;
  const entries = [];
  for (const item of AEM_KNOWLEDGE_FILES) {
    const sourceStatus = await inspectPath(sourceRoot, item.source.split('/'), 'file');
    const destinationStatus = project === 'present' ? await inspectPath(targetRoot, ['.ai', 'project', item.destination], 'file') : project;
    entries.push({ ...item, sourceStatus, destinationStatus });
  }
  const ready = !['unsafe', 'unreadable'].includes(project) && entries.every(item => (!item.required || item.sourceStatus === 'present') && (item.sourceStatus === 'missing' && !item.required || item.sourceStatus === 'present' && item.destinationStatus === 'missing'));
  return { source: sourceRoot, target: targetRoot, entries, ready, scope: 'Local file availability only; source contents, project correctness and later filesystem changes are not verified.' };
}

async function ensureDirectory(path) {
  try { await mkdir(path); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Destination is unsafe');
}

/** Copy only absent, explicitly mapped files; preserve and report partial work. */
export async function importAemRefresh({ source, target }) {
  const plan = await previewAemRefresh({ source, target });
  if (!plan.ready) return { complete: false, copied: [], reason: 'preflight-blocked', plan };
  await ensureDirectory(join(plan.target, '.ai'));
  await ensureDirectory(join(plan.target, '.ai', 'project'));
  const copied = [];
  for (const item of plan.entries.filter(entry => entry.sourceStatus === 'present')) {
    try {
      if (await inspectPath(plan.source, item.source.split('/'), 'file') !== 'present') throw new Error('Source changed');
      const bytes = await readLimitedFile(join(plan.source, ...item.source.split('/')), 1024 * 1024);
      await writeFile(join(plan.target, '.ai', 'project', item.destination), bytes, { flag: 'wx', mode: 0o600 });
      copied.push({ source: item.source, destination: item.destination, bytes: bytes.length });
    } catch {
      return { complete: false, copied, failed: item.destination, reason: 'source-or-write-failed', scope: 'Earlier copies and any partial destination are retained. Review files before retrying.' };
    }
  }
  return { complete: true, copied, scope: 'Explicit local copies only; contents are untrusted, may change later and were not semantically validated.' };
}
