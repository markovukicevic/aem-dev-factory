import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareResponseDraft, saveResponseDraft } from '../src/pr-response-draft.js';

const contexts = [
  { provider: 'github', pullRequest: {}, discussionComplete: true, comments: [{ id: 1, body: 'Please clarify', user: { login: 'reviewer' } }], reviewComments: [{ id: 2, body: '```\nchange\n```' }], reviews: [{ id: 3, body: null }] },
  { provider: 'gitlab', pullRequest: {}, discussionComplete: true, comments: [{ id: 4, body: 'Note', author: { username: 'reviewer' } }] },
  { provider: 'bitbucket-cloud', pullRequest: {}, discussionComplete: true, comments: [{ id: 5, content: { raw: 'Comment' }, user: { display_name: 'Reviewer' } }] },
  { provider: 'ado', pullRequest: {}, discussionComplete: null, threads: [{ id: 9, comments: [{ id: 6, content: 'Thread', author: { displayName: 'Reviewer' } }] }] },
];

test('preserves provider discussion as untrusted data without inventing replies', () => {
  for (const context of contexts) {
    const result = prepareResponseDraft(context);
    assert.equal(result.count, context.provider === 'github' ? 3 : 1);
    assert.match(result.report, /No responses drafted yet/);
    assert.match(result.report, /untrusted source data/);
    if (context.provider === 'github') assert.match(result.report, /````json/);
    if (context.provider === 'ado') assert.match(result.report, /"discussionComplete": null/);
  }
  assert.throws(() => prepareResponseDraft({ provider: 'github', pullRequest: {}, comments: [] }), /Missing/);
});

test('creates a new workspace and refuses to overwrite it', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'pr-response-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const inputPath = join(dir, 'context.json'), outputPath = join(dir, 'draft.md');
  await writeFile(inputPath, JSON.stringify(contexts[0]));
  const result = await saveResponseDraft({ inputPath, outputPath });
  assert.equal(result.count, 3);
  const original = await readFile(outputPath, 'utf8');
  await assert.rejects(saveResponseDraft({ inputPath, outputPath }), { code: 'EEXIST' });
  assert.equal(await readFile(outputPath, 'utf8'), original);
});
