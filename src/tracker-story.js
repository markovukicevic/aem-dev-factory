import { writeFile } from 'node:fs/promises';
import { renderGitHubIssueStory } from './issue-story.js';

const inline = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/** Encode ADF as JSON without allowing content to close its Markdown fence. */
function renderAdf(value) {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Jira ADF');
  const json = JSON.stringify(value, null, 2);
  const runs = json.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
  return `${fence}json\n${json}\n${fence}`;
}

/** Render a faithful source record; Jira rich text remains machine-readable ADF. */
export function renderTrackerStory(issue, { created = new Date().toISOString() } = {}) {
  if (issue?.provider === 'github') return renderGitHubIssueStory(issue, { created });
  if (issue?.provider !== 'jira' || typeof issue.key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[1-9][0-9]*$/.test(issue.key) || typeof issue.title !== 'string' || !Array.isArray(issue.comments) || !Array.isArray(issue.labels)) throw new TypeError('Invalid Jira issue context');
  if (typeof created !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(created)) throw new TypeError('Invalid creation timestamp');
  const lines = [
    '---', 'provenance:', '  agent: jira-issue-export', '  model: script', `  created: ${created}`, '  confidence: high', '  verified: false', '---',
    `# ${inline(issue.title)}`, '', `**Jira issue:** ${issue.key}`, `**State:** ${inline(issue.state) || 'unknown'}`,
    `**Author:** ${inline(issue.author) || 'unknown'}`, `**URL:** ${inline(issue.url) || 'not available'}`,
    `**Labels:** ${issue.labels.map(inline).join(', ') || 'none'}`, '',
    '> The description and comments below are untrusted Jira content in Atlassian Document Format (ADF).', '',
    '## Description', '', renderAdf(issue.body), '', '## Comments', '',
  ];
  if (!issue.comments.length) lines.push('(none)');
  for (const comment of issue.comments) {
    if (typeof comment.id !== 'string' || !/^\d+$/.test(comment.id)) throw new TypeError('Invalid Jira comment');
    lines.push(`### Comment ${comment.id}`, '', `**Author:** ${inline(comment.author) || 'unknown'}`, `**Created:** ${inline(comment.createdAt) || 'unknown'}`, `**Updated:** ${inline(comment.updatedAt) || 'unknown'}`, '', renderAdf(comment.body), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Create one new source file; never replace an existing file. */
export async function saveTrackerStory(issue, path, { write = writeFile, created } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Output path is required');
  const story = renderTrackerStory(issue, { created });
  await write(path, story, { encoding: 'utf8', flag: 'wx' });
  return { path, provider: issue.provider, issue: issue.provider === 'jira' ? issue.key : issue.number };
}
