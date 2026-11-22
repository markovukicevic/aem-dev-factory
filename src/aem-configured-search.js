import { dirname, join } from 'node:path';
import { lstat, writeFile } from 'node:fs/promises';
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


/** Save configured local search observations without replacing an existing file. */
export async function saveConfiguredAemSearch({ cwd, resourceType, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const result = await searchConfiguredAemContent({ cwd, resourceType });
  const json = JSON.stringify(result, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Configured AEM content references\n\nUntrusted local source observations follow. Paths use explicitly configured mappings and do not establish live page usage. Files may change after inspection.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 4 * 1024 * 1024) throw new Error('Search report exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, roots: result.results.length, complete: result.complete, scope: result.scope };
}
