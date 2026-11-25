import { open, writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { parseImplementationPlan } from './plan-parser.js';

/** Extract a named level-two section while ignoring fenced code and HTML comments. */
export function extractSection(markdown, headings) {
  if (typeof markdown !== 'string' || !Array.isArray(headings)) throw new TypeError('Invalid source');
  let fenced = false;
  let marker;
  let fenceLength;
  let inComment = false;
  let collecting = false;
  const lines = [];
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    let visible = line;
    while (visible.includes('<!--') || inComment) {
      if (inComment) {
        const end = visible.indexOf('-->');
        if (end < 0) { visible = ''; break; }
        visible = visible.slice(end + 3);
        inComment = false;
      } else {
        const start = visible.indexOf('<!--');
        const end = visible.indexOf('-->', start + 4);
        if (end < 0) { visible = visible.slice(0, start); inComment = true; break; }
        visible = visible.slice(0, start) + visible.slice(end + 3);
      }
    }
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(visible);
    if (fence) {
      if (!fenced) { fenced = true; marker = fence[1][0]; fenceLength = fence[1].length; }
      else if (fence[1][0] === marker && fence[1].length >= fenceLength) fenced = false;
      if (collecting) lines.push(line);
      continue;
    }
    if (!fenced) {
      const heading = /^(#{1,2})\s+(.+?)\s*#*\s*$/.exec(visible);
      if (heading) {
        if (collecting) break;
        if (heading[1] === '##' && headings.some(name => name.toLowerCase() === heading[2].toLowerCase())) { collecting = true; continue; }
      }
    }
    if (collecting) lines.push(visible);
  }
  if (fenced || inComment) throw new Error('Malformed source Markdown');
  return lines.join('\n').trim();
}

export function buildPullRequestDescription({ sharePlan, explanation, plan, verification }) {
  if (typeof plan !== 'string' || typeof verification !== 'string' || !verification.trim()) throw new TypeError('Plan and verification evidence are required');
  const parsed = parseImplementationPlan(plan);
  if (parsed.steps.some(step => step.status !== 'done')) throw new Error('Implementation plan is incomplete');
  const summary = (typeof sharePlan === 'string' && extractSection(sharePlan, ['Summary'])) || (typeof explanation === 'string' && extractSection(explanation, ['What & Why', 'Summary']));
  if (!summary) throw new Error('A summary section is required');
  const changes = (typeof sharePlan === 'string' && extractSection(sharePlan, ['Changes'])) || parsed.steps.map(step => `- ${step.title}`).join('\n');
  return `## Summary\n${summary}\n\n## Changes\n${changes}\n\n## Test plan and verification\n${verification.trim()}\n`;
}

async function readSource(path) {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 262144) throw new Error('Invalid PR source file');
    const buffer = Buffer.alloc(262145);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > 262144) throw new Error('Invalid PR source file');
    return buffer.subarray(0, offset).toString('utf8');
  } finally { await file.close(); }
}

/** Render a link from a locally recorded tracker identity, without closing the ticket. */
export function ticketReference(identity) {
  if (!identity || identity.version !== 1 || typeof identity.source !== 'string' || typeof identity.id !== 'string') throw new Error('Invalid ticket identity');
  if (identity.provider === 'jira') {
    const source = new URL(identity.source);
    if (source.protocol !== 'https:' || source.origin !== identity.source || source.username || source.password || !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(identity.id)) throw new Error('Invalid Jira identity');
    return `${source.origin}/browse/${identity.id}`;
  }
  if (identity.provider === 'github') {
    const source = /^([a-z0-9](?:[a-z0-9-]{0,38}))\/([a-z0-9_.-]+)$/.exec(identity.source);
    const id = /^github-([1-9][0-9]*)$/.exec(identity.id);
    if (!source || !id || source[2] === '.' || source[2] === '..') throw new Error('Invalid GitHub issue identity');
    return `https://github.com/${source[1]}/${source[2]}/issues/${id[1]}`;
  }
  throw new Error('Unsupported ticket identity');
}

/** Write a new reviewable PR description without changing remote state. */
export async function savePullRequestDescription({ sharePlanPath, explanationPath, planPath, verificationPath, outputPath, ticketIdentityPath }) {
  if ([planPath, verificationPath, outputPath].some(path => typeof path !== 'string' || !path.trim()) || (!sharePlanPath && !explanationPath)) throw new TypeError('PR description source paths are required');
  const [sharePlan, explanation, plan, verification] = await Promise.all([
    sharePlanPath ? readSource(sharePlanPath) : null,
    explanationPath ? readSource(explanationPath) : null,
    readSource(planPath), readSource(verificationPath),
  ]);
  let description = buildPullRequestDescription({ sharePlan, explanation, plan, verification });
  if (ticketIdentityPath) {
    const identity = JSON.parse((await readLimitedFile(ticketIdentityPath, 16384)).toString('utf8'));
    description += `\n## Ticket\n${ticketReference(identity)}\n`;
  }
  await writeFile(outputPath, description, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath };
}
