import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveAttachmentManifest, checkAttachmentManifest } from '../src/attachment-manifest.js';

test('records local hashes and detects changes and missing attachments', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'attachment-manifest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputPath = join(directory, 'manifest.json');
  await writeFile(join(directory, '1.bin'), 'abc');
  await writeFile(join(directory, '2.bin'), '');
  await saveAttachmentManifest({ directory, outputPath, ids: ['1', '2'] });
  assert.equal((await checkAttachmentManifest({ directory, manifestPath: outputPath })).consistent, true);
  await writeFile(join(directory, '1.bin'), 'abd');
  await rm(join(directory, '2.bin'));
  const result = await checkAttachmentManifest({ directory, manifestPath: outputPath });
  assert.deepEqual(result.files, [{ id: '1', status: 'changed' }, { id: '2', status: 'missing' }]);
  assert.match(result.scope, /provenance/);
  await assert.rejects(saveAttachmentManifest({ directory, outputPath, ids: ['1'] }), { code: 'EEXIST' });
});

test('refuses symlinked attachments and unsafe or duplicate IDs', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'attachment-manifest-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputPath = join(directory, 'manifest.json');
  await writeFile(join(directory, '1.bin'), 'abc');
  await saveAttachmentManifest({ directory, outputPath, ids: ['1'] });
  const content = await readFile(outputPath, 'utf8');
  await rm(join(directory, '1.bin')); await symlink('/etc/passwd', join(directory, '1.bin'));
  assert.equal((await checkAttachmentManifest({ directory, manifestPath: outputPath })).files[0].status, 'unsafe-or-unreadable');
  await assert.rejects(saveAttachmentManifest({ directory, outputPath: join(directory, 'bad.json'), ids: ['../1'] }), /Invalid/);
  await writeFile(outputPath, content.replace('"id": "1"', '"id": "../1"'));
  await assert.rejects(checkAttachmentManifest({ directory, manifestPath: outputPath }), /entry/);
});
