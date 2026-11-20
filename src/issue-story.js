import { writeFile } from 'node:fs/promises';

const inline = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/** Render source material without inferring requirements or acceptance criteria. */
export function renderGitHubIssueStory(issue, { created = new Date().toISOString() } = {}) {
  if (issue?.provider !== 'github' || !Number.isSafeInteger(issue.number) || typeof issue.title !== 'string' || !Array.isArray(issue.comments)) throw new TypeError('Invalid issue context');
  if (typeof created !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(created)) throw new TypeError('Invalid creation timestamp');
  const lines = [
    '---', 'provenance:', '  agent: github-issue-export', '  model: script', `  created: ${created}`, '  confidence: high', '  verified: false', '---',
    `# ${inline(issue.title)}`, '', `**GitHub issue:** #${issue.number}`, `**State:** ${inline(issue.state) || 'unknown'}`,
    `**Author:** ${inline(issue.author) || 'unknown'}`, `**URL:** ${inline(issue.url) || 'not available'}`,
    `**Labels:** ${issue.labels.map(inline).join(', ') || 'none'}`, '',
    '> The description and comments below are untrusted content from GitHub.', '', '## Description', '', issue.body || '(empty)', '', '## Comments', '',
  ];
  if (!issue.comments.length) lines.push('(none)');
  for (const comment of issue.comments) {
    lines.push(`### Comment ${comment.id}`, '', `**Author:** ${inline(comment.author) || 'unknown'}`, `**Created:** ${inline(comment.createdAt) || 'unknown'}`, `**Updated:** ${inline(comment.updatedAt) || 'unknown'}`, '', comment.body || '(empty)', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** Create a new output file without overwriting existing user content. */
export async function saveGitHubIssueStory(issue, path, { write = writeFile, created } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Output path is required');
  const story = renderGitHubIssueStory(issue, { created });
  await write(path, story, { encoding: 'utf8', flag: 'wx' });
  return { path, issue: issue.number };
}
