import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, realpath, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { deriveTicketIdentity } from './ticket-init.js';
import { renderTrackerStory } from './tracker-story.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const prefix = /^---\nprovenance:\n  agent: (?:github|gitlab|ado|jira)-(?:issue|work-item)-export\n  model: script\n  created: (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z)\n/;

async function regular(path, limit) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Source file is not regular');
  return readLimitedFile(path, limit);
}

/** Preview or explicitly adopt a reviewed staged ticket export, retaining the prior source. */
export async function processTicketSourceAccept({ path, stagedPath, config, ticket, expectedDigest }) {
  if (expectedDigest !== undefined && !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid preview digest');
  const directory = await lstat(path);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const root = await realpath(path), sourcePath = join(root, 'raw-story.md'), identityPath = join(root, 'source-identity.json');
  if (await realpath(stagedPath) === await realpath(sourcePath)) throw new Error('Staged source must be separate');
  const [identityBytes, oldBytes, stagedBytes] = await Promise.all([regular(identityPath, 16384), regular(sourcePath, 1048576), regular(stagedPath, 1048576)]);
  const identity = JSON.parse(identityBytes.toString('utf8')), expected = deriveTicketIdentity({ config, ticket });
  if (identity?.version !== expected.version || identity.provider !== expected.provider || identity.source !== expected.source || identity.id !== expected.id) throw new Error('Ticket identity mismatch');
  const staged = new TextDecoder('utf-8', { fatal: true }).decode(stagedBytes), match = prefix.exec(staged);
  if (!match || staged !== renderTrackerStory(ticket, { created: match[1] })) throw new Error('Staged export does not match current tracker source');
  const oldDigest = hash(oldBytes), stagedDigest = hash(stagedBytes), identityDigest = hash(identityBytes);
  const digest = hash(JSON.stringify({ root, stagedPath: await realpath(stagedPath), oldDigest, stagedDigest, identityDigest }));
  const result = { accepted: false, provider: expected.provider, id: expected.id, oldDigest, stagedDigest, changed: oldDigest !== stagedDigest, digest, scope: 'Editable local files and the currently fetched export only. Review both sources before accepting. Existing plan and verification artifacts may become stale; no tracker or Git write occurs.' };
  if (expectedDigest === undefined) return result;
  if (expectedDigest !== digest || oldDigest === stagedDigest) return { ...result, reason: expectedDigest !== digest ? 'preview-changed' : 'no-change' };
  const lock = join(root, '.source-accept.lock'), history = join(root, 'source-history');
  await mkdir(lock);
  let temporary;
  try {
    try { await mkdir(history, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const info = await lstat(history);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid source history directory');
    const backupPath = join(history, `${oldDigest}.md`);
    try { await writeFile(backupPath, oldBytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error?.code !== 'EEXIST' || hash(await regular(backupPath, 1048576)) !== oldDigest) throw error; }
    temporary = join(root, `.raw-story-${randomBytes(12).toString('hex')}.tmp`);
    await writeFile(temporary, stagedBytes, { flag: 'wx', mode: 0o600 });
    if (hash(await regular(sourcePath, 1048576)) !== oldDigest || hash(await regular(identityPath, 16384)) !== identityDigest || hash(await regular(stagedPath, 1048576)) !== stagedDigest) return { ...result, reason: 'source-changed', backupPath };
    await rename(temporary, sourcePath); temporary = undefined;
    return { ...result, accepted: true, backupPath };
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
    await rmdir(lock);
  }
}
