import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectAemComponent } from '../src/aem-doctor.js';

test('reports local definition, dialog, templates and unresolved inheritance', async t => {
  const path = await mkdtemp(join(tmpdir(), 'aem-doctor-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  await writeFile(join(path, '.content.xml'), '<jcr:root xmlns:jcr="x" xmlns:sling="y" jcr:primaryType="cq:Component" componentGroup="Example" sling:resourceSuperType="core/example"/>');
  await mkdir(join(path, '_cq_dialog'));
  await writeFile(join(path, '_cq_dialog', '.content.xml'), '<root/>');
  await writeFile(join(path, 'component.html'), '<div/>');
  const result = await inspectAemComponent({ path });
  assert.equal(result.definition.primaryType, 'cq:Component');
  assert.equal(result.definition.superType, 'core/example');
  assert.equal(result.dialog, 'present');
  assert.deepEqual(result.templates, ['component.html']);
  assert.ok(result.warnings.some(warning => /not resolved/.test(warning)));
});

test('reports missing, unsafe or malformed local definitions without claiming runtime health', async t => {
  const path = await mkdtemp(join(tmpdir(), 'aem-doctor-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  await writeFile(join(path, '.content.xml'), '<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><jcr:root/>');
  await symlink('/tmp', join(path, '_cq_dialog'));
  const result = await inspectAemComponent({ path });
  assert.equal(result.definition.status, 'invalid-or-unreadable');
  assert.equal(result.dialog, 'unsupported');
  assert.match(result.scope, /runtime AEM/);
  assert.ok(result.warnings.length >= 3);
});
