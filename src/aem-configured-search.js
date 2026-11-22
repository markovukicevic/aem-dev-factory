import { dirname, join } from 'node:path';
import { inspectAemProjectSettings } from './aem-project-layout.js';
import { findAemSourceUsage } from './aem-source-usage.js';

/** Search explicitly configured local content roots without assuming JCR mappings. */
export async function searchConfiguredAemContent({ cwd, resourceType }) {
  if (typeof resourceType !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_./:-]{0,511}$/.test(resourceType) || resourceType.split('/').some(part => !part || part === '.' || part === '..')) throw new TypeError('Invalid AEM resource type');
  const settings = await inspectAemProjectSettings({ cwd });
  const projectRoot = dirname(dirname(settings.path));
  const roots = settings.roots.filter(item => item.kind === 'contentRoots');
  const results = [];
  for (const [index, root] of roots.entries()) {
    if (index >= 10) { results.push({ root: root.path, status: 'not-inspected' }); continue; }
    if (root.status !== 'present') { results.push({ root: root.path, status: root.status }); continue; }
    try {
      const mapping = settings.contentMappings.find(item => item.root === root.path);
      const found = await findAemSourceUsage({ path: join(projectRoot, ...root.path.split('/')), resourceType, ...(mapping ? { jcrBase: mapping.jcrBase } : {}) });
      results.push({ root: root.path, jcrBase: found.jcrBase, status: found.limited || found.skipped.length ? 'partial' : 'inspected', matches: found.matches, skipped: found.skipped, limited: found.limited });
    } catch { results.push({ root: root.path, status: 'unavailable' }); }
  }
  return { resourceType, results, complete: results.length > 0 && results.every(item => item.status === 'inspected'), scope: 'Configured local content roots and explicit user-supplied mappings only; mapping correctness, live page usage, inheritance and later changes are not established.' };
}
