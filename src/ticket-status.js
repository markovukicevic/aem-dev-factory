import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { summarizePlanStatus } from './plan-status.js';

const artifacts = ['source-identity.json', 'raw-story.md', 'dor.md', 'explain.md', 'research.md', 'share-req.md', 'implement.md', 'validation-report.md', 'verification.md', 'dod.md', 'triage.md', 'bug-reproduction.md', 'bug-fix.md', 'bug-verification.md'];
/** Inspect declared artifacts without inferring their validity or doing remote calls. */
export async function inspectTicketDirectory(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Ticket directory is required');
  const directory = await lstat(path);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid ticket directory');
  const files = [];
  let plan = null;
  let identity = null;
  for (const name of artifacts) {
    const file = join(path, name);
    let stat;
    try { stat = await lstat(file); } catch (error) { if (error?.code === 'ENOENT') { files.push({ name, status: 'missing' }); continue; } throw error; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) { files.push({ name, status: 'unreadable' }); continue; }
    try {
      const bytes = await readLimitedFile(file, 1024 * 1024);
      if (name === 'implement.md') plan = summarizePlanStatus(bytes.toString('utf8'));
      if (name === 'source-identity.json') {
        const value = JSON.parse(bytes.toString('utf8'));
        if (value?.version !== 1 || typeof value.provider !== 'string' || typeof value.source !== 'string' || typeof value.id !== 'string') throw new Error('Invalid identity');
        identity = { version: 1, provider: value.provider, source: value.source, id: value.id };
      }
      files.push({ name, status: 'present' });
    } catch { files.push({ name, status: 'invalid-or-unreadable' }); }
  }
  return { path, files, identity, plan, scope: 'File presence and declared plan status only; content correctness, source identity, readiness and test outcomes are not verified.' };
}
