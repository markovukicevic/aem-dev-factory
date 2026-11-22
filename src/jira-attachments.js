import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

/** Download explicitly selected attachments without using remote filenames as paths. */
export async function saveJiraAttachments({ tracker, directory, ids }) {
  if (tracker?.provider !== 'jira' || typeof tracker.getAttachmentMetadata !== 'function' || typeof tracker.saveAttachment !== 'function' || typeof directory !== 'string' || !directory.trim() || !Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[1-9][0-9]{0,30}$/.test(id)) || new Set(ids).size !== ids.length) throw new TypeError('Invalid Jira attachments request');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Attachment destination must be a local directory');
  const targets = ids.map(id => ({ id, path: join(directory, `${id}.bin`) }));
  for (const target of targets) {
    try { await lstat(target.path); throw Object.assign(new Error('Attachment destination already exists'), { code: 'EEXIST' }); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const saved = [];
  for (const target of targets) {
    let metadata;
    try {
      metadata = await tracker.getAttachmentMetadata(target.id);
      if (!metadata || metadata.id !== target.id || typeof metadata.filename !== 'string' || !Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > 5 * 1024 * 1024) throw new Error('Invalid or oversized metadata');
      const result = await tracker.saveAttachment(target.id, target.path);
      if (!result || result.id !== target.id || result.path !== target.path || !Number.isSafeInteger(result.size) || result.size < 0) throw new Error('Invalid saved attachment result');
      saved.push({ id: target.id, path: target.path, size: result.size, reportedSize: metadata.size, filename: metadata.filename, mimeType: typeof metadata.mimeType === 'string' ? metadata.mimeType : null, sizeMatches: result.size === metadata.size });
      if (result.size !== metadata.size) return { complete: false, saved, failed: target.id, reason: 'size-mismatch', scope: 'Saved bytes are untrusted; metadata size does not validate content. Earlier files are retained.' };
    } catch {
      return { complete: false, saved, failed: target.id, reason: 'metadata-download-or-write-failed', scope: 'Earlier files and any partial destination are retained; inspect before retrying. Attachment bytes are untrusted.' };
    }
  }
  return { complete: true, saved, scope: 'Explicitly selected attachments only; filenames and bytes are untrusted, and matching sizes do not validate content.' };
}
