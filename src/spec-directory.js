import { mkdir, readdir, lstat, rmdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Create or reuse one uniquely identified ticket directory without overwriting content. */
export async function ensureSpecDirectory({ cwd, id, title }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('cwd is required');
  if (typeof id !== 'string' || !/^(?:(?:github|gitlab|ado)-[1-9][0-9]*|[A-Z][A-Z0-9_]*-[1-9][0-9]*)$/.test(id)) throw new TypeError('Ticket ID must be github-N, gitlab-N, ado-N, or a Jira key');
  if (typeof title !== 'string' || !title.trim()) throw new TypeError('Title is required');
  const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'work-item';
  const root = join(cwd, '.ai', 'specs');
  await mkdir(root, { recursive: true });
  const lock = join(root, `.lock-${id}`);
  try {
    await mkdir(lock);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Ticket directory is locked by another operation');
    throw error;
  }
  try {
    const matching = (await readdir(root)).filter(name => name.startsWith(`${id}-`));
    if (matching.length > 1) throw new Error('Multiple spec directories match this ticket');
    if (matching.length === 1) {
      const path = join(root, matching[0]);
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Ticket path is not a directory');
      return { path, created: false };
    }
    const path = join(root, `${id}-${slug}`);
    await mkdir(path);
    return { path, created: true };
  } finally {
    await rmdir(lock);
  }
}
