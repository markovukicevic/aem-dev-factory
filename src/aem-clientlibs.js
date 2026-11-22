import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readLimitedFile } from './read-limited.js';

/** Inspect explicit local client library XML without inferring runtime behavior. */
export async function inspectAemClientlibs({ path, maxEntries = 5000, maxDepth = 12 }) {
  if (typeof path !== 'string' || !path.trim() || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000 || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 30) throw new TypeError('Invalid client library inspection');
  const root = await lstat(path);
  if (!root.isDirectory() || root.isSymbolicLink()) throw new Error('Client library root must be a local directory');
  const stack = [{ directory: path, relative: '', depth: 0 }], libraries = [], skipped = [];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    const entries = await readdir(current.directory, { withFileTypes: true });
    count += entries.length;
    if (count > maxEntries) throw new Error('Client library inspection limit exceeded');
    for (const entry of entries) {
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      const full = join(current.directory, entry.name);
      if (entry.isSymbolicLink()) { skipped.push({ path: relative, reason: 'symlink' }); continue; }
      if (entry.isDirectory()) {
        if (current.depth >= maxDepth) skipped.push({ path: relative, reason: 'depth-limit' });
        else stack.push({ directory: full, relative, depth: current.depth + 1 });
      } else if (entry.isFile() && entry.name === '.content.xml') {
        try {
          const xml = (await readLimitedFile(full, 1024 * 1024)).toString('utf8');
          if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid XML');
          const document = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, processEntities: true }).parse(xml);
          const node = document['jcr:root'];
          if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error('Missing root');
          if (node['@_jcr:primaryType'] !== 'cq:ClientLibraryFolder') continue;
          const attribute = name => typeof node[`@_${name}`] === 'string' ? node[`@_${name}`] : null;
          libraries.push({ path: relative, categories: attribute('categories'), dependencies: attribute('dependencies'), embed: attribute('embed'), allowProxy: attribute('allowProxy') });
        } catch { skipped.push({ path: relative, reason: 'invalid-or-unreadable-xml' }); }
      }
    }
  }
  libraries.sort((a, b) => a.path.localeCompare(b.path)); skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { libraries, skipped, scope: 'Explicit local cq:ClientLibraryFolder XML attributes only. Values are not interpreted; build output, inherited definitions, runtime inclusion, dependencies and rendered behavior are not verified.' };
}
