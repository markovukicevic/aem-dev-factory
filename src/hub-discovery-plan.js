import { readLimitedFile } from './read-limited.js';
import { discoverHubCommentRepositories, discoverHubScopeTable } from './hub-repos.js';
import { discoverHubSimpleRepositories } from './hub-simple-route.js';

/** Inspect relevant markers outside fenced code; never silently skip a malformed selected tier. */
function markers(text) {
  let fence = null, taggedDirective = false, simple = false, scopeTable = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const match = /^ {0,3}(`{3,}|~{3,})([^`]*)$/.exec(line);
    if (!fence) {
      if (match) { fence = { char: match[1][0], length: match[1].length }; if (match[2].trim() === 'simple') simple = true; continue; }
      if (/^\s*@aem(?:-[a-z0-9-]+)?\b/i.test(line) && /\brepos\s*:/i.test(line)) taggedDirective = true;
      if (/^##\s+Cross-Repo Scope(?:\s|$)/i.test(line)) scopeTable = true;
    } else if (match && match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) fence = null;
  }
  if (fence) throw new Error('Unclosed source fence');
  return { taggedDirective, simple, scopeTable };
}
async function read(path) { return new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(path, 262144)); }

/** Apply the reference discovery order without authorizing or dispatching work. */
export async function planHubDiscovery({ cwd, sourcePath, commentPath }) {
  if (typeof cwd !== 'string' || !cwd.trim() || typeof sourcePath !== 'string' || !sourcePath.trim() || (commentPath !== undefined && (typeof commentPath !== 'string' || !commentPath.trim()))) throw new TypeError('Invalid discovery input');
  const sourceText = await read(sourcePath), commentText = commentPath === undefined ? null : await read(commentPath);
  const source = markers(sourceText), comment = commentText === null ? null : markers(commentText);
  const verify = async () => { if (await read(sourcePath) !== sourceText || (commentPath !== undefined && await read(commentPath) !== commentText)) throw new Error('Discovery input changed'); };
  if (comment?.taggedDirective) {
    const result = await discoverHubCommentRepositories({ cwd, path: commentPath });
    await verify();
    return { selectedTier: 'tagged-comment', result, scope: 'Explicit untrusted comment takes precedence; author, intent and repository identity require review. No work was dispatched.' };
  }
  if (source.simple) {
    const result = await discoverHubSimpleRepositories({ cwd, path: sourcePath });
    await verify();
    return { selectedTier: 'simple-block', result, scope: 'Untrusted declared scope and editable routing configuration require review. No work was dispatched.' };
  }
  if (source.scopeTable) {
    const result = await discoverHubScopeTable({ cwd, path: sourcePath });
    await verify();
    return { selectedTier: 'scope-table', result, scope: 'Untrusted scope table is a proposal; inspect unknown repositories and authorization. No work was dispatched.' };
  }
  await verify();
  return { selectedTier: 'none', result: null, scope: 'No supported explicit discovery source found; semantic inference and dispatch were not performed.' };
}
