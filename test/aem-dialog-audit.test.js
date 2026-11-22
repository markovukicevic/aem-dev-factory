import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditAemDialog } from '../src/aem-dialog-audit.js';

const xml = `<root xmlns:sling="http://sling.apache.org/jcr/sling/1.0">
<a name="./title" sling:resourceType="form/textfield" fieldLabel="Title" value="do-not-expose"/>
<b name="./title" sling:resourceType="form/hidden"/>
<c name="./other" sling:resourceType="form/textfield" fieldLabel="  "/>
</root>`;

test('identifies exact-name and missing-label candidates without exposing values', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aem-dialog-audit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'dialog.xml');
  await writeFile(path, xml);
  const result = await auditAemDialog(path);
  assert.equal(result.fieldCount, 3);
  assert.deepEqual(result.duplicateNames, [{ name: './title', paths: ['/root/a', '/root/b'] }]);
  assert.deepEqual(result.missingLabels.map(field => field.name), ['./title', './other']);
  assert.doesNotMatch(JSON.stringify(result), /do-not-expose/);
  assert.match(result.scope, /not proven defects/);
  await writeFile(path, '<!DOCTYPE root><root/>');
  await assert.rejects(auditAemDialog(path), /DTD/);
});
