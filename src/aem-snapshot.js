import { open, writeFile } from 'node:fs/promises';
import { readAemDialog } from './aem-dialog.js';

const fields = ['name', 'resourceType', 'label', 'description', 'required', 'value', 'defaultValue'];

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.source?.type !== 'local-dialog' || !Array.isArray(snapshot.fields)) throw new TypeError('Invalid AEM dialog snapshot');
  const byPath = new Map();
  for (const field of snapshot.fields) {
    if (!field || typeof field.path !== 'string' || !field.path || byPath.has(field.path) || typeof field.name !== 'string' || typeof field.resourceType !== 'string' || fields.slice(2).some(key => field[key] !== null && typeof field[key] !== 'string')) throw new TypeError('Invalid AEM dialog snapshot field');
    byPath.set(field.path, field);
  }
  return byPath;
}

/** Save local dialog attributes to a new snapshot file without overwriting. */
export async function saveAemDialogSnapshot({ dialogPath, outputPath, capturedAt = new Date().toISOString() }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  if (typeof capturedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(capturedAt)) throw new TypeError('Invalid timestamp');
  const dialog = await readAemDialog(dialogPath);
  const snapshot = { schemaVersion: 1, source: { type: 'local-dialog', path: dialogPath }, capturedAt, fields: dialog.fields };
  validateSnapshot(snapshot);
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) throw new Error('Snapshot exceeds size limit');
  await writeFile(outputPath, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, fields: snapshot.fields.length };
}

export function compareAemDialogSnapshots(before, after) {
  const oldFields = validateSnapshot(before);
  const newFields = validateSnapshot(after);
  const added = [];
  const removed = [];
  const changed = [];
  for (const [path, field] of oldFields) {
    const next = newFields.get(path);
    if (!next) { removed.push(field); continue; }
    const changes = {};
    for (const key of fields) if (field[key] !== next[key]) changes[key] = { before: field[key], after: next[key] };
    if (Object.keys(changes).length) changed.push({ path, changes });
  }
  for (const [path, field] of newFields) if (!oldFields.has(path)) added.push(field);
  return { added, removed, changed, scope: 'Local explicit dialog fields only; not a live AEM or rendered-page comparison.' };
}

async function readSnapshot(path) {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 1024 * 1024) throw new Error('Invalid snapshot file');
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > 1024 * 1024) throw new Error('Invalid snapshot file');
    return JSON.parse(buffer.subarray(0, offset).toString('utf8'));
  } finally {
    await file.close();
  }
}

export async function compareAemDialogSnapshotFiles(beforePath, afterPath) {
  if (typeof beforePath !== 'string' || !beforePath.trim() || typeof afterPath !== 'string' || !afterPath.trim()) throw new TypeError('Snapshot paths are required');
  const [before, after] = await Promise.all([readSnapshot(beforePath), readSnapshot(afterPath)]);
  return compareAemDialogSnapshots(before, after);
}
