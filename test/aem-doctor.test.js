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
