import { writeFile } from 'node:fs/promises';
import { searchLiveAemUsage } from './aem-live-usage.js';
import { readAemDialog } from './aem-dialog.js';
import { readLimitedFile } from './read-limited.js';

/** Save separate local dialog and live search observations to a new file. */
export async function saveAemLiveSnapshot({ authorUrl, root, resourceType, username, password, token, dialogPath, outputPath }, { search = searchLiveAemUsage, readDialog = readAemDialog, now = () => new Date().toISOString() } = {}) {
  if (typeof dialogPath !== 'string' || !dialogPath.trim() || typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Dialog and output paths are required');
  const dialog = await readDialog(dialogPath);
  const usage = await search({ authorUrl, root, resourceType, username, password, token });
  const result = { version: 1, capturedAt: now(), localDialog: { source: dialogPath, ...dialog }, liveUsage: usage, scope: 'Local XML and live query are separate observations and may not describe the same deployed component. Authored properties and rendered output are not captured.' };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { path: outputPath, capturedAt: result.capturedAt, queryComplete: usage.queryComplete, pageCount: usage.pages.length, scope: result.scope };
}
function validate(snapshot) {
  if (snapshot?.version !== 1 || typeof snapshot.capturedAt !== 'string' || !snapshot.localDialog || !Array.isArray(snapshot.localDialog.fields) || !snapshot.liveUsage || typeof snapshot.liveUsage.authorOrigin !== 'string' || typeof snapshot.liveUsage.root !== 'string' || typeof snapshot.liveUsage.resourceType !== 'string' || typeof snapshot.liveUsage.queryComplete !== 'boolean' || !Array.isArray(snapshot.liveUsage.pages)) throw new Error('Invalid AEM live snapshot');
  if (snapshot.liveUsage.pages.length > 100 || snapshot.localDialog.fields.length > 10000) throw new Error('AEM snapshot exceeds limits');
  const pages = snapshot.liveUsage.pages.map(page => page?.path);
  if (pages.some(path => typeof path !== 'string' || !path.startsWith('/content/')) || new Set(pages).size !== pages.length) throw new Error('Invalid snapshot pages');
  return pages;
}
export async function compareAemLiveSnapshots({ beforePath, afterPath }) {
  const before = JSON.parse((await readLimitedFile(beforePath, 2 * 1024 * 1024)).toString('utf8'));
  const after = JSON.parse((await readLimitedFile(afterPath, 2 * 1024 * 1024)).toString('utf8'));
  const oldPages = validate(before), newPages = validate(after);
  if (['authorOrigin', 'root', 'resourceType'].some(key => before.liveUsage[key] !== after.liveUsage[key])) throw new Error('AEM snapshot scope differs');
  const oldSet = new Set(oldPages), newSet = new Set(newPages);
  const fields = list => new Map(list.map(field => [field.path, JSON.stringify(field)]));
  const oldFields = fields(before.localDialog.fields), newFields = fields(after.localDialog.fields);
  if (oldFields.size !== before.localDialog.fields.length || newFields.size !== after.localDialog.fields.length || [...oldFields.keys(), ...newFields.keys()].some(path => typeof path !== 'string')) throw new Error('Invalid dialog fields');
  return { before: before.capturedAt, after: after.capturedAt, scope: { authorOrigin: before.liveUsage.authorOrigin, root: before.liveUsage.root, resourceType: before.liveUsage.resourceType }, queryComplete: before.liveUsage.queryComplete && after.liveUsage.queryComplete, pagesOnlyBefore: oldPages.filter(path => !newSet.has(path)), pagesOnlyAfter: newPages.filter(path => !oldSet.has(path)), localFieldsAdded: [...newFields.keys()].filter(path => !oldFields.has(path)), localFieldsRemoved: [...oldFields.keys()].filter(path => !newFields.has(path)), localFieldsChanged: [...newFields.keys()].filter(path => oldFields.has(path) && oldFields.get(path) !== newFields.get(path)), limitations: 'Snapshots are editable observations, not authenticated evidence. Page changes may reflect access, concurrent edits or incomplete queries; local XML is not a deployed dialog.' };
}
