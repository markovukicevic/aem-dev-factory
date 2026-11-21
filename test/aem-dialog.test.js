import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAemDialog, readAemDialog } from '../src/aem-dialog.js';

const xml = `<?xml version="1.0"?>
<jcr:root xmlns:jcr="http://www.jcp.org/jcr/1.0" xmlns:sling="http://sling.apache.org/jcr/sling/1.0">
  <content><items><title sling:resourceType="granite/ui/components/coral/foundation/form/textfield" name="./title" fieldLabel="Title &amp; Name" required="true" value="Default"/>
  <link sling:resourceType="granite/ui/components/coral/foundation/form/pathfield" name="./link" fieldDescription="Select a page"/>
  </items></content>
</jcr:root>`;

test('extracts explicit fields without inventing runtime values', () => {
  const result = parseAemDialog(xml);
  assert.equal(result.fields.length, 2);
  const title = result.fields.find(field => field.name === './title');
  assert.equal(title.label, 'Title & Name');
  assert.equal(title.required, 'true');
  assert.equal(title.value, 'Default');
  assert.equal(title.defaultValue, null);
  assert.match(result.scope, /runtime behavior/);
});

test('reads a local XML file and rejects invalid or unsafe declarations', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aem-dialog-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, '.content.xml');
  await writeFile(path, xml);
  assert.equal((await readAemDialog(path)).fields.length, 2);
  assert.throws(() => parseAemDialog('<root><bad></root>'), /Invalid/);
  assert.throws(() => parseAemDialog('<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><root>&x;</root>'), /DTD/);
  assert.throws(() => parseAemDialog(`<root>${'x'.repeat(1024 * 1024)}</root>`), /size limit/);
});
