import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readFigmaEvidence } from './figma-node.js';
const hash = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
const fields = {
  identity: node => [node.name, node.type, node.visible],
  hierarchy: (node, parent, index) => [parent, index],
  geometry: node => [node.absoluteBoundingBox, node.absoluteRenderBounds, node.constraints, node.relativeTransform],
  layout: node => [node.layoutMode, node.itemSpacing, node.paddingLeft, node.paddingRight, node.paddingTop, node.paddingBottom, node.layoutSizingHorizontal, node.layoutSizingVertical, node.primaryAxisAlignItems, node.counterAxisAlignItems],
  text: node => [node.characters, node.style, node.characterStyleOverrides, node.styleOverrideTable],
  appearance: node => [node.fills, node.strokes, node.strokeWeight, node.cornerRadius, node.rectangleCornerRadii, node.opacity, node.effects, node.blendMode],
};
function flatten(document) {
  const pending = [{ node: document, parent: null, index: 0 }], nodes = new Map();
  while (pending.length) {
    if (nodes.size >= 2000) throw new Error('Node comparison limit exceeded');
    const { node, parent, index } = pending.pop();
    if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string' || !node.id || node.id.length > 200 || typeof node.type !== 'string' || nodes.has(node.id) || (node.children !== undefined && !Array.isArray(node.children))) throw new Error('Invalid node tree');
    const categories = Object.fromEntries(Object.entries(fields).map(([key, get]) => [key, hash(get(node, parent, index))]));
    nodes.set(node.id, { id: node.id, name: typeof node.name === 'string' ? node.name.slice(0, 300) : null, type: node.type.slice(0, 100), categories });
    if (node.children?.length > 10000) throw new Error('Child limit exceeded');
    for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--) pending.push({ node: node.children[i], parent: node.id, index: i });
  }
  return nodes;
}

/** Compare selected properties of two editable observations, with no network calls. */
export async function compareFigmaNodes({ beforePath, afterPath }) {
  const before = await readFigmaEvidence(beforePath), after = await readFigmaEvidence(afterPath);
  if (before.fileKey !== after.fileKey || before.nodeId !== after.nodeId || before.depth !== after.depth) throw new Error('Figma evidence identity or depth differs');
  const a = flatten(before.node.document), b = flatten(after.node.document), changes = [];
  for (const [id, previous] of a) {
    const next = b.get(id);
    if (!next) changes.push({ id, type: previous.type, name: previous.name, status: 'absent-after' });
    else { const changed = Object.keys(fields).filter(key => previous.categories[key] !== next.categories[key]); if (changed.length) changes.push({ id, type: next.type, name: next.name, status: 'changed', categories: changed }); }
  }
  for (const [id, next] of b) if (!a.has(id)) changes.push({ id, type: next.type, name: next.name, status: 'absent-before' });
  return { fileKey: before.fileKey, nodeId: before.nodeId, depth: before.depth, beforeSha256: before.sha256, afterSha256: after.sha256, observedBefore: a.size, observedAfter: b.size, changeCount: changes.length, changes: changes.slice(0, 200), changeListTruncated: changes.length > 200, scope: 'Selected properties of two depth-limited, editable observations only. Absent nodes may lie outside the observed subtree; unrelated properties, images, actual rendering, authenticity and approval were not checked.' };
}

export async function saveFigmaComparison({ beforePath, afterPath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  const comparison = await compareFigmaNodes({ beforePath, afterPath }), json = JSON.stringify(comparison, null, 2), maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0), fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const markdown = `# Figma observation comparison\n\nUntrusted, editable snapshots are compared for selected properties only. This is not a rendered or approved design comparison.\n\n${fence}json\n${json}\n${fence}\n`;
  await writeFile(outputPath, markdown, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, changeCount: comparison.changeCount, changeListTruncated: comparison.changeListTruncated, scope: comparison.scope };
}
