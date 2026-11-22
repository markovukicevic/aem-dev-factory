import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';

function safeParts(value, allowRoot = false) {
  if (allowRoot && value === '.') return [];
  if (!value || value.startsWith('/') || /[\\\u0000-\u001f\u007f*?\[\]]/.test(value)) return null;
  const parts = value.split('/');
  return parts.some(part => !part || part === '.' || part === '..') ? null : parts;
}

async function inspectPath(root, parts) {
  let path = root;
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]);
    let info;
    try { info = await lstat(path); }
    catch (error) { if (error?.code === 'ENOENT') return 'missing'; throw error; }
    if (info.isSymbolicLink()) return 'symlink-skipped';
    if (i < parts.length - 1 && !info.isDirectory()) return 'not-directory';
    if (i === parts.length - 1) return info.isFile() ? 'present' : 'not-file';
  }
  return 'unsupported';
}

/** Inspect local js.txt and css.txt paths without resolving runtime clientlibs. */
export async function inspectAemClientlibFiles({ path }) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Client library directory is required');
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Client library must be a local directory');
  const manifests = [];
  for (const name of ['js.txt', 'css.txt']) {
    const file = join(path, name);
    let stat;
    try { stat = await lstat(file); }
    catch (error) { if (error?.code === 'ENOENT') { manifests.push({ name, status: 'missing', entries: [] }); continue; } throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) { manifests.push({ name, status: 'unsupported', entries: [] }); continue; }
    try {
      const data = await readLimitedFile(file, 1024 * 1024);
      const content = data.toString('utf8');
      if (!Buffer.from(content, 'utf8').equals(data)) throw new Error('Invalid UTF-8');
      const lines = content.split(/\r?\n/);
      if (lines.length > 10000) throw new Error('Manifest line limit exceeded');
      let base = null;
      const entries = [], seen = new Set();
      for (const [index, raw] of lines.entries()) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('#base=')) { base = safeParts(line.slice(6).trim(), true); continue; }
        if (line.startsWith('#')) continue;
        const parts = safeParts(line);
        if (!base || !parts) { entries.push({ line: index + 1, source: line, status: 'unsupported-or-no-base' }); continue; }
        const relative = [...base, ...parts];
        const key = relative.join('/');
        const duplicate = seen.has(key); seen.add(key);
        entries.push({ line: index + 1, source: line, base: base.join('/') || '.', status: await inspectPath(path, relative), duplicate });
      }
      manifests.push({ name, status: 'inspected', entries });
    } catch { manifests.push({ name, status: 'invalid-or-unreadable', entries: [] }); }
  }
  return { manifests, scope: 'Explicit local manifest paths only; generated assets, runtime aggregation, dependencies, rendered output and later filesystem changes are not verified. Unsupported paths are not resolved.' };
}
