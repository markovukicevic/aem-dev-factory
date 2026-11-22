import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveAemComponentReport } from '../src/aem-component-report.js';

test('creates an evidence-only report and never overwrites it', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aem-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const component = join(root, 'component');
  await mkdir(component);
  await writeFile(join(component, '.content.xml'), '<jcr:root xmlns:jcr="x" jcr:primaryType="cq:Component"/>');
  await mkdir(join(component, '_cq_dialog'));
  await writeFile(join(component, '_cq_dialog', '.content.xml'), '<jcr:root xmlns:jcr="x" xmlns:sling="y"><field sling:resourceType="text" name="./title" fieldLabel="Title"/></jcr:root>');
  const output = join(root, 'report.md');
  const result = await saveAemComponentReport({ componentPath: component, outputPath: output });
  assert.equal(result.dialogStatus, 'present');
  const report = await readFile(output, 'utf8');
  assert.match(report, /"name": "\.\/title"/);
  assert.match(report, /not an authoring guide/);
  await assert.rejects(saveAemComponentReport({ componentPath: component, outputPath: output }), { code: 'EEXIST' });
  assert.equal(await readFile(output, 'utf8'), report);
});
