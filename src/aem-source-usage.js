import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readLimitedFile } from './read-limited.js';

/** Find exact resource types in explicitly selected local serialized content. */
export async function findAemSourceUsage({ path, resourceType, maxEntries = 5000, maxDepth = 20, maxMatches = 500 }) {
  if (typeof path !== 'string' || !path.trim() || typeof resourceType !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_./:-]{0,511}$/.test(resourceType) || resourceType.split('/').some(part => part === '.' || part === '..' || !part) || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000 || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 30 || !Number.isSafeInteger(maxMatches) || maxMatches < 1 || maxMatches > 1000) throw new TypeError('Invalid AEM source usage request');
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
        const nodes = [{ value: document, nodePath: '' }];
        while (nodes.length) {
          const { value, nodePath } = nodes.pop();
          if (!value || typeof value !== 'object') continue;
          if (Array.isArray(value)) { value.forEach((item, index) => nodes.push({ value: item, nodePath: `${nodePath}[${index}]` })); continue; }
          if (value['@_sling:resourceType'] === resourceType) {
            if (matches.length >= maxMatches) { limited = true; break outer; }
            matches.push({ file: relative, nodePath });
          }
          for (const [name, child] of Object.entries(value)) if (!name.startsWith('@_') && name !== '#text') nodes.push({ value: child, nodePath: `${nodePath}/${name}` });
        }
      }
    }
  }
  matches.sort((a, b) => a.file.localeCompare(b.file) || a.nodePath.localeCompare(b.nodePath)); skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { resourceType, matches, skipped, limited, scope: 'Exact matches in selected local .content.xml files only. Live AEM content, inherited components, generated data, experience fragment references and later changes are not resolved.' };
}
