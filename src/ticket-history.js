import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** List bounded source and review backups without exposing their content. */
export async function inspectTicketHistory(path) {
  const root = await lstat(path);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Invalid ticket directory');
  const groups = [];
  for (const name of ['source-history', 'review-history']) {
    const directory = join(path, name);
    let stat;
    try { stat = await lstat(directory); } catch (error) { if (error?.code === 'ENOENT') { groups.push({ name, status: 'missing', entries: [] }); continue; } throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) { groups.push({ name, status: 'unavailable', entries: [] }); continue; }
    const filenames = (await readdir(directory)).sort(), entries = [];
    for (const filename of filenames.slice(0, 200)) {
      if (!/^[a-f0-9]{64}\.md$/.test(filename)) { entries.push({ name: filename, status: 'unrecognized' }); continue; }
      let file;
      try {
        file = await open(join(directory, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
        const before = await file.stat();
        if (!before.isFile() || before.size > 2 * 1024 * 1024) throw new Error('Invalid history file');
        const buffer = Buffer.alloc(2 * 1024 * 1024 + 1); let offset = 0;
        while (offset < buffer.length) { const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null); if (!bytesRead) break; offset += bytesRead; }
        const after = await file.stat();
        if (offset > 2 * 1024 * 1024 || offset !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('History file changed');
        entries.push({ name: filename, status: createHash('sha256').update(buffer.subarray(0, offset)).digest('hex') === filename.slice(0, 64) ? 'matches-name' : 'changed' });
      } catch { entries.push({ name: filename, status: 'unavailable' }); }
      finally { await file?.close(); }
    }
    groups.push({ name, status: filenames.length > 200 ? 'truncated' : 'observed', entries });
  }
  return { groups, consistent: groups.every(group => ['missing', 'observed'].includes(group.status) && group.entries.every(entry => entry.status === 'matches-name')), scope: 'Local editable history files and filename hashes only. A match does not authenticate a record, prove review or capture future changes.' };
}
