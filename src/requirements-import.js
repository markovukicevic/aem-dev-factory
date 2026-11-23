import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';

/** Copy explicitly selected local text into a new, non-overwriting spec directory. */
export async function importLocalRequirements({ cwd, slug, sourcePath }) {
  if (typeof cwd !== 'string' || !cwd.trim() || typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60 || typeof sourcePath !== 'string' || !sourcePath.trim()) throw new TypeError('Invalid local requirements import');
  const source = await lstat(sourcePath);
  if (!source.isFile() || source.isSymbolicLink()) throw new Error('Source must be a regular file');
  const bytes = await readLimitedFile(sourcePath, 1024 * 1024);
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!decoded.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(decoded)) throw new Error('Source must be non-empty UTF-8 text');
  const target = await lstat(cwd);
  if (!target.isDirectory() || target.isSymbolicLink()) throw new Error('Invalid project directory');
  let parent = cwd;
  for (const part of ['.ai', 'specs']) {
    parent = join(parent, part);
    try { await mkdir(parent); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid spec parent');
  }
  const path = join(parent, `local-${slug}`);
  await mkdir(path, { mode: 0o700 });
  const storyPath = join(path, 'raw-story.md'), identityPath = join(path, 'source-identity.json');
  const identity = { version: 1, provider: 'local', source: 'local-file', id: slug, sha256: createHash('sha256').update(bytes).digest('hex') };
  try {
    await writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await writeFile(storyPath, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) { return { path, created: true, complete: false, reason: error?.code ?? 'write-failed', scope: 'Partial directory retained for inspection; no existing files were overwritten.' }; }
  return { path, storyPath, identityPath, created: true, complete: true, scope: 'Untrusted local text copied as supplied. Hash records copied bytes only; origin, requirements completeness and correctness are not verified.' };
}
