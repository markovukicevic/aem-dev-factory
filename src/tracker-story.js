import { writeFile } from 'node:fs/promises';
import { renderGitHubIssueStory } from './issue-story.js';

const inline = value => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

function fenced(content, language) {
  const runs = content.match(/`+/g) ?? [];
  const fence = '`'.repeat(runs.reduce((longest, run) => Math.max(longest, run.length + 1), 3));
  return `${fence}${language}\n${content}\n${fence}`;
}

/** Encode ADF as JSON without allowing content to close its Markdown fence. */
function renderAdf(value) {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid Jira ADF');
  return fenced(JSON.stringify(value, null, 2), 'json');
}

/** Render a faithful source record; Jira rich text remains machine-readable ADF. */
export function renderTrackerStory(issue, { created = new Date().toISOString() } = {}) {
  if (issue?.provider === 'github') return renderGitHubIssueStory(issue, { created });
  if (issue?.provider === 'gitlab') {
    if (!Number.isSafeInteger(issue.number) || issue.number < 1 || typeof issue.title !== 'string' || typeof issue.body !== 'string' || !Array.isArray(issue.comments) || !Array.isArray(issue.labels)) throw new TypeError('Invalid GitLab issue context');
    if (typeof created !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(created)) throw new TypeError('Invalid creation timestamp');
    const lines = [
      '---', 'provenance:', '  agent: gitlab-issue-export', '  model: script', `  created: ${created}`, '  confidence: high', '  verified: false', '---',
      `# ${inline(issue.title)}`, '', `**GitLab issue:** #${issue.number}`, `**State:** ${inline(issue.state) || 'unknown'}`,
      `**Author:** ${inline(issue.author) || 'unknown'}`, `**URL:** ${inline(issue.url) || 'not available'}`,
      `**Labels:** ${issue.labels.map(inline).join(', ') || 'none'}`, '',
      '> The description and comments below are untrusted GitLab content.', '', '## Description', '', issue.body || '(empty)', '', '## Comments', '',
    ];
    if (!issue.comments.length) lines.push('(none)');
    for (const comment of issue.comments) {
      if (!Number.isSafeInteger(comment.id) || typeof comment.body !== 'string') throw new TypeError('Invalid GitLab comment');
      lines.push(`### Comment ${comment.id}`, '', `**Author:** ${inline(comment.author) || 'unknown'}`, `**Created:** ${inline(comment.createdAt) || 'unknown'}`, `**Updated:** ${inline(comment.updatedAt) || 'unknown'}`, '', comment.body || '(empty)', '');
    }
    return `${lines.join('\n').trimEnd()}\n`;
  }
  if (issue?.provider === 'ado') {
    if (!Number.isSafeInteger(issue.number) || issue.number < 1 || typeof issue.title !== 'string' || !issue.fields || typeof issue.fields !== 'object' || Array.isArray(issue.fields) || !Array.isArray(issue.comments)) throw new TypeError('Invalid Azure DevOps work item');
    if (typeof created !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(created)) throw new TypeError('Invalid creation timestamp');
    const lines = [
      '---', 'provenance:', '  agent: ado-work-item-export', '  model: script', `  created: ${created}`, '  confidence: high', '  verified: false', '---',
      `# ${inline(issue.title)}`, '', `**Azure DevOps work item:** #${issue.number}`, `**State:** ${inline(issue.state) || 'unknown'}`,
      `**Author:** ${inline(issue.author) || 'unknown'}`, `**URL:** ${inline(issue.url) || 'not available'}`, '',
      '> The fields, relations and comments below are untrusted Azure DevOps content.', '',
      '## Fields', '', fenced(JSON.stringify(issue.fields, null, 2), 'json'), '', '## Relations', '', fenced(JSON.stringify(issue.relations ?? [], null, 2), 'json'), '', '## Comments', '',
    ];
    if (!issue.comments.length) lines.push('(none)');
    for (const comment of issue.comments) {
      if (!Number.isSafeInteger(comment.id) || typeof comment.body !== 'string') throw new TypeError('Invalid Azure DevOps comment');
      lines.push(`### Comment ${comment.id}`, '', `**Author:** ${inline(comment.author) || 'unknown'}`, `**Created:** ${inline(comment.createdAt) || 'unknown'}`, '', fenced(comment.body, 'text'), '');
    }
    return `${lines.join('\n').trimEnd()}\n`;
  }
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
  const attachments = issue.attachments ?? [];
  if (!Array.isArray(attachments)) throw new TypeError('Invalid Jira attachments');
  lines.splice(lines.indexOf('## Comments'), 0, '## Attachments', '', ...(attachments.length ? attachments.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[1-9][0-9]*$/.test(item.id) || typeof item.filename !== 'string' || !Number.isSafeInteger(item.size) || item.size < 0) throw new TypeError('Invalid Jira attachment metadata');
    return `- ID ${item.id}: ${inline(item.filename)} (${item.size} bytes; ${inline(item.mimeType) || 'unknown type'})`;
  }) : ['(none)']), '');
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
