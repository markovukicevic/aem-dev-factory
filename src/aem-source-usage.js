import { lstat, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readLimitedFile } from './read-limited.js';

/** Find exact resource types in explicitly selected local serialized content. */
export async function findAemSourceUsage({ path, resourceType, jcrBase, maxEntries = 5000, maxDepth = 20, maxMatches = 500 }) {
  if (typeof path !== 'string' || !path.trim() || typeof resourceType !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_./:-]{0,511}$/.test(resourceType) || resourceType.split('/').some(part => part === '.' || part === '..' || !part) || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000 || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 30 || !Number.isSafeInteger(maxMatches) || maxMatches < 1 || maxMatches > 1000) throw new TypeError('Invalid AEM source usage request');
  if (jcrBase !== undefined && (typeof jcrBase !== 'string' || !/^\/content(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(jcrBase) || jcrBase.split('/').some(part => part === '.' || part === '..'))) throw new TypeError('Invalid JCR content base');
  const root = await lstat(path);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Content root must be a local directory');
  const directories = [{ directory: path, relative: '', depth: 0 }], matches = [], skipped = [];
  let count = 0, limited = false;
  outer: while (directories.length) {
    const current = directories.pop();
    const entries = (await readdir(current.directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    count += entries.length;
    if (count > maxEntries) { limited = true; break; }
    for (const entry of entries) {
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      const full = join(current.directory, entry.name);
      if (entry.isSymbolicLink()) { skipped.push({ path: relative, reason: 'symlink' }); continue; }
      if (entry.isDirectory()) {
        if (current.depth >= maxDepth) skipped.push({ path: relative, reason: 'depth-limit' });
        else directories.push({ directory: full, relative, depth: current.depth + 1 });
      } else if (entry.isFile() && entry.name === '.content.xml') {
        let document;
        try {
          const bytes = await readLimitedFile(full, 1024 * 1024), xml = bytes.toString('utf8');
          if (!Buffer.from(xml, 'utf8').equals(bytes) || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Unsupported XML');
          document = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, processEntities: true }).parse(xml);
        } catch { skipped.push({ path: relative, reason: 'invalid-or-unreadable-xml' }); continue; }
        const rootNode = document['jcr:root'];
        const declaredPage = !!rootNode && !Array.isArray(rootNode) && rootNode['@_jcr:primaryType'] === 'cq:Page';
        const pageCandidate = declaredPage && jcrBase !== undefined ? `${jcrBase}${current.relative ? `/${current.relative}` : ''}` : null;
        const nodes = [{ value: document, nodePath: '' }];
        while (nodes.length) {
          const { value, nodePath } = nodes.pop();
          if (!value || typeof value !== 'object') continue;
          if (Array.isArray(value)) { value.forEach((item, index) => nodes.push({ value: item, nodePath: `${nodePath}[${index}]` })); continue; }
          if (value['@_sling:resourceType'] === resourceType) {
            if (matches.length >= maxMatches) { limited = true; break outer; }
            matches.push({ file: relative, nodePath, declaredPage, pageCandidate });
          }
          for (const [name, child] of Object.entries(value)) if (!name.startsWith('@_') && name !== '#text') nodes.push({ value: child, nodePath: `${nodePath}/${name}` });
        }
      }
    }
  }
  matches.sort((a, b) => a.file.localeCompare(b.file) || a.nodePath.localeCompare(b.nodePath)); skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { resourceType, jcrBase: jcrBase ?? null, matches, skipped, limited, scope: 'Exact local XML matches only. Page candidates use the user-supplied JCR base and declared cq:Page roots; they do not prove deployment or current page use. Live AEM, inheritance, fragment references and later changes are not resolved.' };
}


/** Save local reference observations without replacing existing work. */
export async function saveAemSourceUsage({ path, resourceType, jcrBase, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const result = await findAemSourceUsage({ path, resourceType, jcrBase });
  const json = JSON.stringify(result, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Local AEM component references\n\nUntrusted local source observations follow. Candidate paths depend on a supplied mapping and do not establish live page usage. Files may change after inspection.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Reference report exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, matches: result.matches.length, skipped: result.skipped.length, limited: result.limited, scope: result.scope };
}
