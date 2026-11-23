import { lstat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readLimitedFile } from './read-limited.js';
import { deriveTicketIdentity } from './ticket-init.js';
import { renderTrackerStory } from './tracker-story.js';

/** Compare a fetched ticket with its existing local source; optionally stage a new export. */
export async function compareTicketSource({ path, config, ticket, outputPath }) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid spec directory');
  const identityPath = join(path, 'source-identity.json'), storyPath = join(path, 'raw-story.md');
  for (const file of [identityPath, storyPath]) { const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid local source'); }
  const expected = deriveTicketIdentity({ config, ticket });
  const actual = JSON.parse((await readLimitedFile(identityPath, 16384)).toString('utf8'));
  if (actual?.version !== expected.version || actual.provider !== expected.provider || actual.source !== expected.source || actual.id !== expected.id) throw new Error('Ticket identity mismatch');
  const bytes = await readLimitedFile(storyPath, 1024 * 1024), old = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const prefix = /^---\nprovenance:\n  agent: (?:github|gitlab|ado|jira)-(?:issue|work-item)-export\n  model: script\n  created: (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z)\n/.exec(old);
  if (!prefix) throw new Error('Unsupported original export format');
  const comparable = renderTrackerStory(ticket, { created: prefix[1] });
  if (Buffer.byteLength(comparable, 'utf8') > 1024 * 1024) throw new Error('Ticket export exceeds size limit');
  const sha = content => createHash('sha256').update(content).digest('hex');
  const result = { provider: expected.provider, id: expected.id, matches: old === comparable, localDigest: sha(bytes), currentDigest: sha(comparable), staged: false, scope: 'Comparison of a fetched export with editable local bytes, ignoring only export creation time. A difference can reflect local edits or remote changes; source accuracy, completeness and future stability are not guaranteed.' };
  if (outputPath !== undefined) {
    if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path required');
    const fresh = renderTrackerStory(ticket);
    if (Buffer.byteLength(fresh, 'utf8') > 1024 * 1024) throw new Error('Ticket export exceeds size limit');
    await writeFile(outputPath, fresh, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    result.staged = true; result.outputPath = outputPath;
  }
  return result;
}
