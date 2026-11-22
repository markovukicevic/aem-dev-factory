import { lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { saveJiraTicketAttachments } from './jira-attachments.js';
import { saveAttachmentManifest } from './attachment-manifest.js';

/** Download explicit issue attachments and record local hashes without replacing files. */
export async function saveJiraTicketEvidence({ tracker, baseUrl, key, directory, outputPath, ids }) {
  if (typeof baseUrl !== 'string' || typeof outputPath !== 'string' || !outputPath.trim() || typeof directory !== 'string' || !directory.trim() || !Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[1-9][0-9]{0,30}$/.test(id)) || new Set(ids).size !== ids.length) throw new TypeError('Invalid Jira attachment evidence request');
  let url;
  try { url = new URL(baseUrl); } catch { throw new TypeError('Invalid Jira source'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.atlassian\.net$/i.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new TypeError('Invalid Jira source');
  if (ids.some(id => resolve(outputPath) === resolve(join(directory, `${id}.bin`)))) throw new Error('Manifest conflicts with an attachment destination');
  try { await lstat(outputPath); throw Object.assign(new Error('Manifest exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const result = await saveJiraTicketAttachments({ tracker, key, directory, ids });
  if (!result.complete) return { ...result, manifest: null };
  try {
    const manifest = await saveAttachmentManifest({ directory, outputPath, ids, source: { provider: 'jira', site: url.origin, issue: result.ticket } });
    return { ...result, manifest, scope: 'Jira reported selected issue membership and local hashes were recorded. Source records are editable; content safety and later changes are not verified.' };
  } catch {
    return { ...result, complete: false, manifest: null, reason: 'manifest-write-or-inspection-failed', scope: 'Attachments were saved but the manifest was not created. Inspect files and destinations before retrying.' };
  }
}
