import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectLocalSupertype } from '../src/aem-supertype.js';

test('inspects local apps and libs candidates without claiming AEM resolution', async t => {
  const root = await mkdtemp(join(tmpdir(), 'aem-supertype-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const componentPath = join(root, 'component'), jcrRoot = join(root, 'jcr_root');
  await mkdir(componentPath); await mkdir(join(jcrRoot, 'apps', 'core', 'base'), { recursive: true });
  await mkdir(join(jcrRoot, 'libs'), { recursive: true });
  const definition = supertype => `<jcr:root xmlns:jcr="x" xmlns:sling="y" jcr:primaryType="cq:Component" sling:resourceSuperType="${supertype}"/>`;
  await writeFile(join(componentPath, '.content.xml'), definition('core/base'));
  await writeFile(join(jcrRoot, 'apps', 'core', 'base', '.content.xml'), '<jcr:root xmlns:jcr="x" jcr:primaryType="cq:Component"/>');
  let result = await inspectLocalSupertype({ componentPath, jcrRoot });
  assert.equal(result.candidates[0].definition.primaryType, 'cq:Component');
  assert.equal(result.candidates[1].status, 'missing');
  assert.match(result.scope, /without establishing search order/);
  await symlink(join(root, 'elsewhere'), join(jcrRoot, 'libs', 'core'));
  result = await inspectLocalSupertype({ componentPath, jcrRoot });
  assert.equal(result.candidates[1].status, 'symlink-skipped');
  await writeFile(join(componentPath, '.content.xml'), definition('../outside'));
  await assert.rejects(inspectLocalSupertype({ componentPath, jcrRoot }), /Unsupported/);
  await writeFile(join(componentPath, '.content.xml'), definition('/apps/core/base'));
  result = await inspectLocalSupertype({ componentPath, jcrRoot });
  assert.equal(result.candidates.length, 1);
});
