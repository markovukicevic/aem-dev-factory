import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveJiraAttachments } from '../src/jira-attachments.js';

function tracker(fail) {
  return { provider: 'jira', getAttachmentMetadata: async id => ({ id, filename: '../remote-name', size: 3, mimeType: 'image/png' }), saveAttachment: async (id, path) => { if (id === fail) throw new Error('private provider error'); await writeFile(path, 'abc', { flag: 'wx' }); return { id, path, size: 3 }; } };
}

test('preflights and saves selected attachments using ID-only paths', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jira-batch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await saveJiraAttachments({ tracker: tracker(), directory, ids: ['1', '2'] });
  assert.equal(result.complete, true);
  assert.equal(result.saved[0].path, join(directory, '1.bin'));
  assert.equal(await readFile(join(directory, '1.bin'), 'utf8'), 'abc');
  assert.equal(result.saved[0].sizeMatches, true);
  await assert.rejects(saveJiraAttachments({ tracker: tracker(), directory, ids: ['1', '3'] }), { code: 'EEXIST' });
  await assert.rejects(saveJiraAttachments({ tracker: tracker(), directory, ids: ['4', '4'] }), /Invalid/);
});

test('reports partial failure and size mismatch without deleting files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jira-batch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await saveJiraAttachments({ tracker: tracker('2'), directory, ids: ['1', '2'] });
  assert.equal(result.complete, false);
  assert.equal(result.failed, '2');
  assert.doesNotMatch(JSON.stringify(result), /private provider error/);
  assert.equal(await readFile(join(directory, '1.bin'), 'utf8'), 'abc');
  const mismatched = { ...tracker(), getAttachmentMetadata: async id => ({ id, filename: 'x', size: 2 }) };
  const mismatch = await saveJiraAttachments({ tracker: mismatched, directory, ids: ['3'] });
  assert.equal(mismatch.reason, 'size-mismatch');
  assert.equal(await readFile(join(directory, '3.bin'), 'utf8'), 'abc');
});

test('rejects symlinked target directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jira-batch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const link = join(root, 'link'); await symlink(root, link);
  await assert.rejects(saveJiraAttachments({ tracker: tracker(), directory: link, ids: ['1'] }), /local directory/);
});

test('only downloads attachment IDs reported on the selected Jira issue', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jira-ticket-batch-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { saveJiraTicketAttachments } = await import('../src/jira-attachments.js');
  let downloads = 0;
  const client = { ...tracker(), getTicket: async key => ({ provider: 'jira', key, attachments: [{ id: '1' }, { id: '2' }] }), saveAttachment: async (id, path) => { downloads++; await writeFile(path, 'abc', { flag: 'wx' }); return { id, path, size: 3 }; } };
  await assert.rejects(saveJiraTicketAttachments({ tracker: client, key: 'TEAM-7', directory, ids: ['1', '3'] }), /not reported/);
  assert.equal(downloads, 0);
  const result = await saveJiraTicketAttachments({ tracker: client, key: 'TEAM-7', directory, ids: ['1'] });
  assert.equal(result.ticket, 'TEAM-7');
  assert.equal(result.complete, true);
  assert.equal(downloads, 1);
  await assert.rejects(saveJiraTicketAttachments({ tracker: { ...client, getTicket: async () => ({ provider: 'jira', key: 'OTHER-1', attachments: [] }) }, key: 'TEAM-7', directory, ids: ['2'] }), /metadata/);
});
