import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveJiraTicketEvidence } from '../src/jira-ticket-evidence.js';
import { checkAttachmentManifest } from '../src/attachment-manifest.js';
const baseUrl = 'https://team.atlassian.net';
function makeTracker(failing) {
  return { provider: 'jira', getTicket: async key => ({ provider: 'jira', key, attachments: [{ id: '1' }, { id: '2' }] }), getAttachmentMetadata: async id => ({ id, filename: 'remote', size: 3 }), saveAttachment: async (id, path) => { if (id === failing) throw new Error('failed'); await writeFile(path, 'abc', { flag: 'wx' }); return { id, path, size: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }; } };
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


test('does not create a manifest when saved bytes differ from the downloaded hash', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'jira-evidence-race-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tracker = { ...makeTracker(), saveAttachment: async (id, path) => { await writeFile(path, 'def', { flag: 'wx' }); return { id, path, size: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }; } };
  const outputPath = join(directory, 'manifest.json');
  const result = await saveJiraTicketEvidence({ tracker, baseUrl, key: 'TEAM-7', directory, outputPath, ids: ['1'] });
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'manifest-write-or-inspection-failed');
  await assert.rejects(readFile(outputPath), { code: 'ENOENT' });
  assert.equal(await readFile(join(directory, '1.bin'), 'utf8'), 'def');
});


test('runs issue-bound attachment evidence through the real Jira adapter using simulated HTTP', async t => {
  const { createJiraTracker } = await import('../src/jira.js');
  const directory = await mkdtemp(join(tmpdir(), 'jira-evidence-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const requests = [];
  const tracker = createJiraTracker({ baseUrl, email: 'user@example.com', token: 'secret', fetchImpl: async (url, options) => {
    requests.push({ url, redirect: options.redirect });
    if (url.includes('/comment?')) return { ok: true, json: async () => ({ startAt: 0, total: 0, comments: [] }) };
    if (url.includes('/issue/')) return { ok: true, json: async () => ({ key: 'TEAM-7', fields: { summary: 'Issue', attachment: [{ id: '1', filename: 'file', size: 3 }] } }) };
    if (url.includes('/attachment/content/')) return { ok: true, status: 200, headers: { get: name => name === 'content-length' ? '3' : null }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('abc')); controller.close(); } }) };
    if (url.includes('/attachment/1')) return { ok: true, json: async () => ({ id: '1', filename: 'file', size: 3 }) };
    throw new Error('Unexpected URL');
  } });
  const outputPath = join(directory, 'manifest.json');
  const result = await saveJiraTicketEvidence({ tracker, baseUrl, key: 'TEAM-7', directory, outputPath, ids: ['1'] });
  assert.equal(result.complete, true);
  assert.equal(result.saved[0].sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal((await checkAttachmentManifest({ directory, manifestPath: outputPath })).consistent, true);
  assert.equal(requests.length, 4);
  assert.ok(requests.every(item => item.redirect === 'error' && item.url.startsWith(baseUrl)));
});
