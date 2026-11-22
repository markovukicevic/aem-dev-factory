import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveJiraTicketEvidence } from '../src/jira-ticket-evidence.js';
import { checkAttachmentManifest } from '../src/attachment-manifest.js';
const baseUrl = 'https://team.atlassian.net';
function makeTracker(failing) {
  return { provider: 'jira', getTicket: async key => ({ provider: 'jira', key, attachments: [{ id: '1' }, { id: '2' }] }), getAttachmentMetadata: async id => ({ id, filename: 'remote', size: 3 }), saveAttachment: async (id, path) => { if (id === failing) throw new Error('failed'); await writeFile(path, 'abc', { flag: 'wx' }); return { id, path, size: 3 }; } };
}

test('saves selected issue attachments and a source-labelled local hash manifest', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jira-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outputPath = join(directory, 'manifest.json');
  const result = await saveJiraTicketEvidence({ tracker: makeTracker(), baseUrl, key: 'TEAM-7', directory, outputPath, ids: ['1', '2'] });
  assert.equal(result.complete, true);
  const manifest = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.deepEqual(manifest.source, { provider: 'jira', site: baseUrl, issue: 'TEAM-7' });
  assert.equal((await checkAttachmentManifest({ directory, manifestPath: outputPath })).consistent, true);
  await assert.rejects(saveJiraTicketEvidence({ tracker: makeTracker(), baseUrl, key: 'TEAM-7', directory, outputPath, ids: ['1'] }), { code: 'EEXIST' });
});

test('retains partial downloads and refuses destination collisions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jira-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = await saveJiraTicketEvidence({ tracker: makeTracker('2'), baseUrl, key: 'TEAM-7', directory, outputPath: join(directory, 'manifest.json'), ids: ['1', '2'] });
  assert.equal(result.complete, false);
  assert.equal(result.manifest, null);
  assert.equal(await readFile(join(directory, '1.bin'), 'utf8'), 'abc');
  await assert.rejects(saveJiraTicketEvidence({ tracker: makeTracker(), baseUrl, key: 'TEAM-7', directory, outputPath: join(directory, '2.bin'), ids: ['2'] }), /conflicts/);
  await assert.rejects(saveJiraTicketEvidence({ tracker: makeTracker(), baseUrl: 'https://evil.example', key: 'TEAM-7', directory, outputPath: join(directory, 'safe.json'), ids: ['2'] }), /source/);
});
