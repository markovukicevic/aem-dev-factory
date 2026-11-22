import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTrackerStory, saveTrackerStory } from '../src/tracker-story.js';

const adf = { type: 'doc', version: 1, content: [{ type: 'text', text: 'Original ``` markup' }] };
const issue = { provider: 'jira', key: 'TEAM-12', title: 'Story', state: 'Open', author: 'Alex', url: 'https://team.atlassian.net/browse/TEAM-12', labels: [], body: adf, comments: [{ id: '11', author: 'Sam', body: adf }] };

test('preserves Jira description and comment ADF in fences that cannot be closed by content', () => {
  const text = renderTrackerStory(issue, { created: '2026-11-21T12:00:00Z' });
  assert.match(text, /````json/);
  assert.match(text, /Original ``` markup/);
  assert.match(text, /untrusted Jira content/);
  assert.doesNotMatch(text, /Acceptance Criteria/);
});

test('preserves Azure work item fields, relations and comment text as untrusted source data', () => {
  const ado = { provider: 'ado', number: 12, title: 'Fix', fields: { 'System.Title': 'Fix', 'Microsoft.VSTS.Common.AcceptanceCriteria': '<p>Keep</p>' }, relations: [{ rel: 'parent' }], comments: [{ id: 1, body: 'Comment ``` content' }] };
  const story = renderTrackerStory(ado, { created: '2026-11-21T12:00:00Z' });
  assert.match(story, /Azure DevOps work item/);
  assert.match(story, /Microsoft.VSTS.Common.AcceptanceCriteria/);
  assert.match(story, /````text/);
  assert.match(story, /untrusted Azure DevOps content/);
});

test('exports GitLab issue text and comments without inventing requirements', () => {
  const gitlab = { provider: 'gitlab', number: 7, title: 'Bug', body: 'Original **text**', state: 'opened', labels: [], comments: [{ id: 1, body: 'Original note' }] };
  const story = renderTrackerStory(gitlab, { created: '2026-11-21T12:00:00Z' });
  assert.match(story, /GitLab issue/);
  assert.match(story, /Original \*\*text\*\*/);
  assert.match(story, /Original note/);
  assert.doesNotMatch(story, /Acceptance Criteria/);
});

test('records Jira attachment metadata without downloading or inventing content', () => {
  const story = renderTrackerStory({ ...issue, attachments: [{ id: '42', filename: 'image.png', size: 3, mimeType: 'image/png' }] }, { created: '2026-11-21T12:00:00Z' });
  assert.match(story, /ID 42: image.png \(3 bytes; image\/png\)/);
});
