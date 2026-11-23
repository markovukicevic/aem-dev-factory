import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';

function text(value, limit) { return typeof value === 'string' && value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value) ? value : null; }
function target(value) {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw new Error('Invalid axe target');
  return value.map(part => {
    if (typeof part === 'string' && text(part, 2048) && part.trim()) return part;
    if (Array.isArray(part) && part.length > 0 && part.length <= 20 && part.every(item => typeof item === 'string' && text(item, 2048) && item.trim())) return [...part];
    throw new Error('Invalid axe selector');
  });
}
/** Normalize the relevant parts of one supplied axe-core result without DOM snippets. */
export function summarizeAxeResult(input) {
  if (!input || input.testEngine?.name !== 'axe-core' || !text(input.testEngine.version, 128) || !Array.isArray(input.violations) || !Array.isArray(input.incomplete)) throw new Error('Unsupported axe result');
  let page = null;
  if (typeof input.url === 'string' && input.url.length <= 4096) {
    try { const url = new URL(input.url); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) page = `${url.origin}${url.pathname}`; } catch { /* Unknown page remains explicit. */ }
  }
  let nodes = 0;
  const normalize = rules => {
    if (rules.length > 500) throw new Error('Axe rule limit exceeded');
    const ids = new Set();
    return rules.map(rule => {
      if (!rule || typeof rule.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/i.test(rule.id) || ids.has(rule.id) || !Array.isArray(rule.nodes)) throw new Error('Invalid axe rule');
      ids.add(rule.id); nodes += rule.nodes.length;
      if (nodes > 5000) throw new Error('Axe node limit exceeded');
      const impact = ['minor', 'moderate', 'serious', 'critical'].includes(rule.impact) ? rule.impact : null;
      return { id: rule.id, impact, help: text(rule.help, 2048), nodes: rule.nodes.map(item => ({ target: target(item?.target), impact: ['minor', 'moderate', 'serious', 'critical'].includes(item?.impact) ? item.impact : null })) };
    });
  };
  const violations = normalize(input.violations), incomplete = normalize(input.incomplete);
  const passes = Array.isArray(input.passes) ? input.passes.length : null, inapplicable = Array.isArray(input.inapplicable) ? input.inapplicable.length : null;
  const meta = input.aemDevFlowRun;
  const declaredRun = meta?.version === 1 && Number.isSafeInteger(meta.blockedRequests) && meta.blockedRequests >= 0 && Array.isArray(meta.axeTags) && meta.axeTags.length <= 20 && meta.axeTags.every(tag => typeof tag === 'string' && /^[a-z0-9-]{1,64}$/i.test(tag)) ? { blockedRequests: meta.blockedRequests, axeTags: [...meta.axeTags] } : null;

  return { engine: { name: 'axe-core', version: input.testEngine.version }, page, violations, incomplete, passes, inapplicable, declaredRun, scope: 'Supplied axe-core results only; scan execution, complete coverage, manual accessibility and WCAG conformance are not verified. Page query and fragment and DOM snippets are omitted; selectors may still be sensitive.' };
}
export async function readAxeResult(path) {
  const bytes = await readLimitedFile(path, 8 * 1024 * 1024);
  return summarizeAxeResult(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
/** Compare rule/selector observations, not accessibility fixes. */
export function compareAxeResults(before, after) {
  const rows = result => { const values = new Map(); for (const rule of result.violations) for (const node of rule.nodes) { const key = JSON.stringify([rule.id, node.target]); const existing = values.get(key); values.set(key, { rule: rule.id, target: node.target, count: (existing?.count ?? 0) + 1 }); } return values; };
  const old = rows(before), next = rows(after), added = [], noLongerReported = [];
  for (const [key, item] of next) { const difference = item.count - (old.get(key)?.count ?? 0); if (difference > 0) added.push({ ...item, count: difference }); }
  for (const [key, item] of old) { const difference = item.count - (next.get(key)?.count ?? 0); if (difference > 0) noLongerReported.push({ ...item, count: difference }); }
  return { samePage: before.page && after.page ? before.page === after.page : null, sameEngineVersion: before.engine.version === after.engine.version, sameDeclaredTags: before.declaredRun && after.declaredRun ? JSON.stringify([...before.declaredRun.axeTags].sort()) === JSON.stringify([...after.declaredRun.axeTags].sort()) : null, blockedBefore: before.declaredRun?.blockedRequests ?? null, blockedAfter: after.declaredRun?.blockedRequests ?? null, added, noLongerReported, incompleteBefore: before.incomplete.length, incompleteAfter: after.incomplete.length, scope: 'Rule/selector differences in supplied files only; scan configuration, dynamic state, coverage, actual fixes and WCAG conformance are not established.' };
}
const escape = value => String(value).replace(/([\\`*_{}\[\]()#+.!|<>-])/g, '\\$1');
/** Save a local report without overwriting or claiming the scan ran. */
export async function saveAxeReport({ inputPath, outputPath }) {
  const result = await readAxeResult(inputPath);
  const lines = ['# Accessibility scan observations', '', 'This report formats supplied axe-core output. It does not establish scan execution, complete accessibility coverage or conformance.', '', `- Page: ${result.page ? escape(result.page) : 'unknown'}`, `- Engine: axe-core ${escape(result.engine.version)}`, `- Passing rules reported: ${result.passes ?? 'unknown'}`, `- Declared blocked requests: ${result.declaredRun?.blockedRequests ?? 'unknown'}`, `- Declared axe tags: ${result.declaredRun ? (result.declaredRun.axeTags.map(escape).join(', ') || 'all configured rules') : 'unknown'}`, '', '## Reported violations', ''];
  for (const rule of result.violations) { lines.push(`### ${escape(rule.id)}`, '', `Impact: ${rule.impact ?? 'unknown'}`, '', ...(rule.help ? [`${escape(rule.help)}`, ''] : [])); for (const node of rule.nodes) lines.push(`- ${escape(JSON.stringify(node.target))}`); lines.push(''); }
  if (!result.violations.length) lines.push('No violations were supplied.', '');
  lines.push('## Needs manual review', '');
  for (const rule of result.incomplete) { lines.push(`### ${escape(rule.id)}`, ''); for (const node of rule.nodes) lines.push(`- ${escape(JSON.stringify(node.target))}`); lines.push(''); }
  if (!result.incomplete.length) lines.push('No incomplete rules were supplied.', '');
  const report = `${lines.join('\n').trimEnd()}\n`;
  if (Buffer.byteLength(report) > 8 * 1024 * 1024) throw new Error('Axe report exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, violations: result.violations.length, incomplete: result.incomplete.length, scope: result.scope };
}
