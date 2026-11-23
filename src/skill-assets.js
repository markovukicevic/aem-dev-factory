import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Collect bounded regular skill files; reject links and mutable sources. */
export async function collectSkillAssets(root, { requireMain = true } = {}) {
  const files = []; let total = 0;
  async function walk(directory, parts, depth) {
    if (depth > 5) throw new Error('Skill directory depth exceeded');
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.length > 100) throw new Error('Skill entry limit exceeded');
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.name || entry.name === '.' || entry.name === '..' || /[\u0000-\u001f\u007f\\/]/.test(entry.name)) throw new Error('Invalid skill entry');
      const path = join(directory, entry.name), relative = [...parts, entry.name], info = await lstat(path);
      if (info.isSymbolicLink()) throw new Error('Skill links are not supported');
      if (info.isDirectory()) { await walk(path, relative, depth + 1); continue; }
      if (!info.isFile() || info.size > 1024 * 1024 || files.length >= 100) throw new Error('Invalid skill file');
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = await handle.stat();
        if (!before.isFile() || before.size > 1024 * 1024 || before.ino !== info.ino || before.dev !== info.dev) throw new Error('Skill source changed');
        const buffer = Buffer.alloc(before.size + 1); let offset = 0;
        while (offset < buffer.length) { const next = await handle.read(buffer, offset, buffer.length - offset, null); if (!next.bytesRead) break; offset += next.bytesRead; }
        const after = await handle.stat();
        if (offset !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== after.ino || before.dev !== after.dev) throw new Error('Skill source changed');
        total += offset; if (total > 8 * 1024 * 1024) throw new Error('Skill size limit exceeded');
        files.push({ parts: relative, bytes: buffer.subarray(0, offset), executable: (before.mode & 0o111) !== 0 });
      } finally { await handle.close(); }
    }
  }
  await walk(root, [], 0);
  if (requireMain && !files.some(file => file.parts.length === 1 && file.parts[0] === 'SKILL.md')) throw new Error('Skill metadata file missing');
  return files;
}
