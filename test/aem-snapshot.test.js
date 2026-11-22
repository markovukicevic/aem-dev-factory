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


test('suggests only unique name and type matches as possible moves', () => {
  const field = { path: '/old/title', name: './title', resourceType: 'text', label: 'Old', description: null, required: null, value: null, defaultValue: null };
  const moved = { ...field, path: '/new/title', label: 'New' };
  const make = values => ({ schemaVersion: 1, source: { type: 'local-dialog' }, fields: values });
  const result = compareAemDialogSnapshots(make([field]), make([moved]));
  assert.deepEqual(result.possibleMoves, [{ name: './title', from: '/old/title', to: '/new/title', changes: { label: { before: 'Old', after: 'New' } } }]);
  assert.equal(result.added.length, 1);
  assert.equal(result.removed.length, 1);
  assert.equal(compareAemDialogSnapshots(make([field]), make([{ ...moved, resourceType: 'select' }])).possibleMoves.length, 0);
  assert.equal(compareAemDialogSnapshots(make([field, { ...field, path: '/old/other' }]), make([moved])).possibleMoves.length, 0);
  assert.equal(compareAemDialogSnapshots(make([field]), make([moved, { ...moved, path: '/new/other' }])).possibleMoves.length, 0);
});
