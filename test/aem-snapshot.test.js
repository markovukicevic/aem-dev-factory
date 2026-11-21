import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveAemDialogSnapshot, compareAemDialogSnapshotFiles, compareAemDialogSnapshots } from '../src/aem-snapshot.js';

const dialog = label => `<root xmlns:sling="urn:sling"><title sling:resourceType="text" name="./title" fieldLabel="${label}"/></root>`;

test('saves and compares real local dialog snapshots without overwriting', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aem-snapshot-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const xml = join(dir, 'dialog.xml');
  const before = join(dir, 'before.json');
  const after = join(dir, 'after.json');
  await writeFile(xml, dialog('Old'));
  assert.equal((await saveAemDialogSnapshot({ dialogPath: xml, outputPath: before })).fields, 1);
  await writeFile(xml, dialog('New'));
  await saveAemDialogSnapshot({ dialogPath: xml, outputPath: after });
  const result = await compareAemDialogSnapshotFiles(before, after);
  assert.deepEqual(result.changed[0].changes.label, { before: 'Old', after: 'New' });
  assert.equal(result.added.length, 0);
  await assert.rejects(saveAemDialogSnapshot({ dialogPath: xml, outputPath: before }), { code: 'EEXIST' });
  assert.match(await readFile(before, 'utf8'), /Old/);
});

test('detects added and removed fields and rejects duplicate paths', () => {
  const field = { path: '/a', name: './a', resourceType: 'text', label: null, description: null, required: null, value: null, defaultValue: null };
  const make = values => ({ schemaVersion: 1, source: { type: 'local-dialog' }, fields: values });
  assert.equal(compareAemDialogSnapshots(make([]), make([field])).added.length, 1);
  assert.equal(compareAemDialogSnapshots(make([field]), make([])).removed.length, 1);
  assert.throws(() => compareAemDialogSnapshots(make([field, field]), make([])));
});
