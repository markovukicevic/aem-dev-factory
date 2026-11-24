import { writeFile } from 'node:fs/promises';
import { readFigmaEvidence } from './figma-node.js';
const str = (value, limit = 300) => typeof value === 'string' ? value.slice(0, limit) : null;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
function box(value) {
  if (!value || typeof value !== 'object') return null;
  const result = Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, finite(value[key])]));
  return Object.values(result).every(v => v !== null) ? result : null;
}
function paints(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map(paint => {
    const result = { type: str(paint?.type, 50), visible: typeof paint?.visible === 'boolean' ? paint.visible : null, opacity: finite(paint?.opacity) };
    if (paint?.type === 'SOLID' && paint.color && ['r', 'g', 'b'].every(key => finite(paint.color[key]) !== null)) result.color = Object.fromEntries(['r', 'g', 'b', 'a'].map(key => [key, finite(paint.color[key])]));
    return result;
  });
}
function summarize(node, level) {
  if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string' || typeof node.type !== 'string') throw new Error('Invalid design node');
  const style = node.style && typeof node.style === 'object' ? node.style : {};
  return { id: str(node.id, 200), type: str(node.type, 100), name: str(node.name), level, visible: typeof node.visible === 'boolean' ? node.visible : null, bounds: box(node.absoluteBoundingBox), layoutMode: str(node.layoutMode, 40), spacing: finite(node.itemSpacing), fills: paints(node.fills), fillsTruncated: Array.isArray(node.fills) && node.fills.length > 10, text: str(node.characters, 512), textTruncated: typeof node.characters === 'string' && node.characters.length > 512, typography: { fontFamily: str(style.fontFamily), fontWeight: finite(style.fontWeight), fontSize: finite(style.fontSize), lineHeightPx: finite(style.lineHeightPx), letterSpacing: finite(style.letterSpacing) } };
}

/** Save a bounded, unrendered summary of one editable design observation. */
export async function saveFigmaNodeReport({ evidencePath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  const evidence = await readFigmaEvidence(evidencePath), pending = [{ node: evidence.node.document, level: 0 }], nodes = [];
  while (pending.length && nodes.length < 300) {
    const { node, level } = pending.pop(); nodes.push(summarize(node, level));
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error('Invalid node children');
    if (Array.isArray(node.children)) { if (node.children.length > 10000) throw new Error('Node child limit exceeded'); for (let index = node.children.length - 1; index >= 0; index--) pending.push({ node: node.children[index], level: level + 1 }); }
  }
  const report = { fileKey: evidence.fileKey, nodeId: evidence.nodeId, depth: evidence.depth, observedVersion: evidence.file.version, evidenceSha256: evidence.sha256, nodeCount: nodes.length, nodeLimitReached: pending.length > 0, nodes };
  const json = JSON.stringify(report, null, 2), maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0), fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const markdown = `# Figma node observation\n\nUntrusted, editable provider data follows. The subtree is depth-limited and may omit assets, mixed styles and other design details. Values do not establish rendered appearance or approval.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(markdown, 'utf8') > 4 * 1024 * 1024) throw new Error('Report size limit exceeded');
  await writeFile(outputPath, markdown, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, nodeCount: nodes.length, nodeLimitReached: pending.length > 0, scope: 'Local unrendered summary only. Internal digest is not evidence authentication; content may be private, incomplete, stale or untrusted.' };
}
