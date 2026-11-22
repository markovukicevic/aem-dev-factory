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

test('checks OSGi JSON syntax without exposing values and reports skipped files', async t => {
  const { inspectOsgiConfigs } = await import('../src/aem-doctor.js');
  const path = await mkdtemp(join(tmpdir(), 'aem-osgi-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  await mkdir(join(path, 'config.author'));
  await writeFile(join(path, 'config.author', 'good.cfg.json'), '{"secret":"do-not-print"}');
  await writeFile(join(path, 'config.author', 'bad.cfg.json'), '{invalid');
  await writeFile(join(path, 'config.author', 'legacy.config'), 'legacy');
  await symlink('/tmp', join(path, 'linked'));
  const result = await inspectOsgiConfigs({ path });
  assert.equal(result.files.find(file => file.path.endsWith('good.cfg.json')).status, 'valid-json-object');
  assert.equal(result.files.find(file => file.path.endsWith('bad.cfg.json')).status, 'invalid-or-unreadable');
  assert.equal(result.files.find(file => file.path.endsWith('legacy.config')).status, 'unsupported-format');
  assert.equal(result.skipped[0].reason, 'symlink');
  assert.ok(!JSON.stringify(result).includes('do-not-print'));
  await assert.rejects(inspectOsgiConfigs({ path, maxEntries: 1 }), /limit exceeded/);
});

test('reports same-named OSGi config candidates without inferring runtime conflicts', async t => {
  const { inspectOsgiConfigs } = await import('../src/aem-doctor.js');
  const path = await mkdtemp(join(tmpdir(), 'aem-osgi-duplicates-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  for (const project of ['one', 'two']) {
    const dir = join(path, project, 'osgiconfig', 'config.author');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'com.example.Service.cfg.json'), '{}');
  }
  const different = join(path, 'two', 'osgiconfig', 'config.publish');
  await mkdir(different, { recursive: true });
  await writeFile(join(different, 'com.example.Service.cfg.json'), '{}');
  const result = await inspectOsgiConfigs({ path });
  assert.equal(result.duplicateCandidates.length, 1);
  assert.equal(result.duplicateCandidates[0].runmode, 'config.author');
  assert.equal(result.duplicateCandidates[0].paths.length, 2);
  assert.match(result.scope, /precedence/);
});
