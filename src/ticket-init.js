import { writeFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureSpecDirectory } from './spec-directory.js';
import { renderTrackerStory } from './tracker-story.js';
import { readLimitedFile } from './read-limited.js';

/** Derive the tracker identity used to bind local source records. */
export function deriveTicketIdentity({ config, ticket }) {
  const provider = config?.provider;
  const text = value => typeof value === 'string' && value.trim() && value === value.trim() && !/[\u0000-\u001f]/.test(value) ? value : null;
  let source;
  let id;
  if (provider === 'github' && text(config.owner) && text(config.repository)) {
    source = `${config.owner.toLowerCase()}/${config.repository.toLowerCase()}`;
    id = `github-${ticket?.number}`;
  } else if (provider === 'gitlab' && text(config.project)) {
    source = config.project;
    id = `gitlab-${ticket?.number}`;
  } else if (provider === 'ado' && text(config.organization) && text(config.project)) {
    source = `${config.organization.toLowerCase()}/${config.project}`;
    id = `ado-${ticket?.number}`;
  } else if (provider === 'jira' && text(config.baseUrl)) {
    const url = new URL(config.baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Invalid Jira base URL');
    source = url.origin;
    id = ticket?.key;
  } else throw new TypeError('Invalid tracker configuration');
  if (ticket?.provider !== provider || typeof ticket.title !== 'string' || !ticket.title.trim()) throw new TypeError('Ticket does not match tracker');
  return { version: 1, provider, source, id };
}

/** Bind a new spec directory to one tracker and export the fetched source without overwriting. */
export async function initializeTicket({ cwd, config, ticket }) {
  const identity = deriveTicketIdentity({ config, ticket });
  const { provider, id } = identity;
  const story = renderTrackerStory(ticket);
  const { path, created } = await ensureSpecDirectory({ cwd, id, title: ticket.title });
  const identityPath = join(path, 'source-identity.json');
  if (created) {
    await writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } else {
    const info = await lstat(identityPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Existing ticket identity is missing or unsafe');
    const existing = JSON.parse((await readLimitedFile(identityPath, 16384)).toString('utf8'));
    if (existing?.version !== 1 || existing.provider !== provider || existing.source !== source || existing.id !== id) throw new Error('Ticket identity does not match existing directory');
  }
  const storyPath = join(path, 'raw-story.md');
  await writeFile(storyPath, story, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path, storyPath, identityPath, created, provider, id };
}
