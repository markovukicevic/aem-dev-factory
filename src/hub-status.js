import { readFile, readdir, lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const statuses = new Set(['running', 'done', 'blocked', 'failed']);

async function readBounded(path) {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 262144) throw new Error('Invalid status file');
    const buffer = Buffer.alloc(262145);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > 262144) throw new Error('Invalid status file');
    return buffer.subarray(0, offset).toString('utf8');
  } finally {
    await file.close();
  }
}

/** Read existing AEM DevFlow hub status files; never dispatch or delete work. */
export async function readHubStatuses({ cwd, ticket } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Hub directory is required');
  if (ticket !== undefined && (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]+$/.test(ticket))) throw new TypeError('Invalid ticket ID');
  const config = parse(await readFile(join(cwd, '.ai', 'config.yaml'), 'utf8'), { uniqueKeys: true, maxAliasCount: 0 });
  if (config?.hub?.enabled !== true) throw new Error('Hub mode is not enabled');
  const root = join(cwd, 'state');
  let entries;
  try {
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid hub state directory');
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { dispatches: [], errors: [], complete: true };
    throw error;
  }
  if (entries.length > 1000) throw new Error('Hub state limit exceeded');
  const dispatches = [];
  const errors = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (ticket && entry.name !== ticket) continue;
    if (entry.isSymbolicLink()) { errors.push({ ticket: entry.name, message: 'Symlinked state entry was not read' }); continue; }
    if (!entry.isDirectory()) continue;
    try {
      const statusPath = join(root, entry.name, 'status.json');
      const info = await lstat(statusPath);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid status file');
      const data = JSON.parse(await readBounded(statusPath));
      if (data?.ticket !== entry.name || typeof data.title !== 'string' || !data.repos || typeof data.repos !== 'object' || Array.isArray(data.repos) || Object.entries(data.repos).some(([name, status]) => !name || !statuses.has(status))) throw new Error('Invalid status data');
      dispatches.push({ ticket: data.ticket, title: data.title, type: data.type ?? null, skill: data.skill ?? null, started: data.started ?? null, repos: data.repos });
    } catch {
      errors.push({ ticket: entry.name, message: 'Status file missing or invalid' });
    }
  }
  return { dispatches, errors, complete: errors.length === 0 };
}
