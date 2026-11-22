import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { AEM_KNOWLEDGE_FILES } from './aem-refresh.js';
const names = [{ destination: 'component-index.md', required: false }, ...AEM_KNOWLEDGE_FILES];

async function projectRoot(target) {
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('Target project is required');
  const root = await lstat(target);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid target project');
  const canonical = await realpath(target);
  for (const part of ['.ai', 'project']) {
    const path = part === '.ai' ? join(canonical, '.ai') : join(canonical, '.ai', 'project');
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Knowledge directory is unsafe');
  }
  return join(canonical, '.ai', 'project');
}

/** Inspect known local knowledge files without reading or modifying their content. */
export async function inspectAemKnowledge({ target }) {
  const directory = await projectRoot(target), files = [];
  for (const item of names) {
    let status;
    try {
      const info = await lstat(join(directory, item.destination));
      status = info.isFile() && !info.isSymbolicLink() && info.size <= 1024 * 1024 ? 'present' : 'unsafe-or-oversized';
    } catch (error) { status = error?.code === 'ENOENT' ? 'missing' : 'unreadable'; }
    files.push({ name: item.destination, required: item.required, status });
  }
  return { directory, files, scope: 'Known local file presence only; contents, source, freshness and project correctness are not verified.' };
}

async function readKnownFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > 1024 * 1024) throw new Error('Invalid knowledge file');
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat(), bytes = buffer.subarray(0, offset), content = bytes.toString('utf8');
    if (offset > 1024 * 1024 || before.size !== offset || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !Buffer.from(content, 'utf8').equals(bytes) || content.includes('\u0000')) throw new Error('Knowledge file changed or is not supported text');
    return content;
  } finally { await file.close(); }
}

/** Return matching file and line locations, not untrusted source text. */
export async function searchAemKnowledge({ target, query }) {
  if (typeof query !== 'string' || !query.trim() || query.length > 128 || /[\u0000-\u001f\u007f]/.test(query)) throw new TypeError('Invalid search query');
  const inventory = await inspectAemKnowledge({ target });
  const matches = [], skipped = [];
  let limited = false;
  for (const item of inventory.files) {
    if (item.status !== 'present') { skipped.push({ name: item.name, reason: item.status }); continue; }
    let content;
    try { content = await readKnownFile(join(inventory.directory, item.name)); }
    catch { skipped.push({ name: item.name, reason: 'invalid-or-unreadable' }); continue; }
    const lines = content.split(/\r?\n/);
    if (lines.length > 50000) { skipped.push({ name: item.name, reason: 'line-limit' }); continue; }
    const needle = query.toLowerCase();
    for (const [index, line] of lines.entries()) {
      if (!line.toLowerCase().includes(needle)) continue;
      if (matches.length >= 200) { limited = true; break; }
      matches.push({ name: item.name, line: index + 1 });
    }
    if (limited) break;
  }
  return { query, matches, skipped, limited, scope: 'Case-insensitive literal matches in known local files only. Contents, source freshness, live AEM and later changes are not verified.' };
}
