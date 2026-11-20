import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderGitHubIssueStory, saveGitHubIssueStory } from '../src/issue-story.js';

const issue = { provider: 'github', number: 7, title: 'Fix\nproblem', state: 'open', author: 'user', url: 'https://github.com/team/repo/issues/7', labels: ['bug'], body: 'Exact **description**.', comments: [{ id: 1, author: 'reviewer', body: 'Exact comment.' }] };

test('preserves issue content without inventing acceptance criteria', () => {
  const text = renderGitHubIssueStory(issue, { created: '2026-11-20T12:00:00Z' });
  assert.match(text, /# Fix problem/);
  assert.match(text, /Exact \*\*description\*\*/);
  assert.match(text, /Exact comment/);
  assert.match(text, /untrusted content/);
  assert.doesNotMatch(text, /Acceptance Criteria/);
});

test('creates a new story but does not overwrite existing content', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'devflow-story-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'raw-story.md');
  await saveGitHubIssueStory(issue, path);
  assert.match(await readFile(path, 'utf8'), /Exact comment/);
  await writeFile(path, 'User changes');
  await assert.rejects(saveGitHubIssueStory(issue, path), { code: 'EEXIST' });
  assert.equal(await readFile(path, 'utf8'), 'User changes');
});
