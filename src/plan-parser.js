import { normalizePlanStepId } from './plan-step-id.js';

const INVALID = 'Unsupported or malformed implementation plan';

/** Parse the restricted reference implement.md format; ambiguous inputs fail closed. */
export function parseImplementationPlan(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('Plan must be text');
  let text = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  let provenance = null;
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4);
    if (end === -1) throw new Error(INVALID);
    const front = text.slice(4, end).split('\n');
    text = text.slice(end + 5);
    if (front.shift() !== 'provenance:') throw new Error(INVALID);
    const fields = {};
    for (const line of front) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const match = /^  (agent|model|created|confidence|verified):\s*([^#\s]+)\s*(?:#.*)?$/.exec(line);
      if (!match || Object.hasOwn(fields, match[1])) throw new Error(INVALID);
      fields[match[1]] = match[2];
    }
    if (!['true', 'false'].includes(fields.verified) || (fields.confidence && !['low', 'medium', 'high'].includes(fields.confidence))) throw new Error(INVALID);
    provenance = { verified: fields.verified === 'true', ...(fields.confidence ? { confidence: fields.confidence } : {}) };
  } else if (/^---(?:\s|$)/.test(text)) {
    throw new Error(INVALID);
  }

  // Ignore examples and comments so they cannot satisfy or disguise a step status.
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  if (text.includes('<!--')) throw new Error(INVALID);
  let fenced = false;
  let fenceChar;
  let fenceLength;
  const steps = [];
  let current = null;
  for (const line of text.split('\n')) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!fenced) { fenced = true; fenceChar = fence[1][0]; fenceLength = fence[1].length; }
      else if (fence[1][0] === fenceChar && fence[1].length >= fenceLength) fenced = false;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const step = /^Step\s+((?:[1-9][0-9]*[a-z]?|R[1-9][0-9]*)):\s+(.+)$/.exec(heading[2]);
      if (step) {
        let id; try { id = normalizePlanStepId(step[1]); } catch { throw new Error(INVALID); }
        if (/\[(pending|in-progress|done|blocked|skipped)\]\s*$/.test(step[2])) throw new Error(INVALID);
        if (steps.some(item => item.number === id)) throw new Error(INVALID);
        current = { number: id, title: step[2], status: null, level: heading[1].length };
        steps.push(current);
      } else {
        if (/^Step\b/i.test(heading[2])) throw new Error(INVALID);
        if (current && heading[1].length <= current.level) current = null;
      }
      continue;
    }
    if (current && /^\s*\*\*Status:\*\*/.test(line)) {
      const status = /^\s*\*\*Status:\*\*\s*(pending|in-progress|done|blocked)\s*$/.exec(line);
      if (!status || current.status !== null) throw new Error(INVALID);
      current.status = status[1];
    }
  }
  if (fenced || !steps.length || steps.some(step => step.status === null)) throw new Error(INVALID);
  return { steps: steps.map(({ number, title, status }) => ({ number, title, status })), provenance };
}
