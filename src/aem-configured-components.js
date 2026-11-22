import { dirname, join } from 'node:path';
import { inspectAemProjectSettings } from './aem-project-layout.js';
import { findAemComponents } from './aem-components.js';

/** Search explicit local component roots without inferring live AEM state. */
export async function searchConfiguredAemComponents({ cwd, name }) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new TypeError('A simple component name is required');
  const settings = await inspectAemProjectSettings({ cwd });
  const projectRoot = dirname(dirname(settings.path));
  const roots = settings.roots.filter(item => item.kind === 'componentRoots');
  const results = [];
  for (const [index, root] of roots.entries()) {
    if (index >= 10) { results.push({ root: root.path, status: 'not-inspected' }); continue; }
    if (root.status !== 'present') { results.push({ root: root.path, status: root.status }); continue; }
    try {
      const found = await findAemComponents({ cwd: join(projectRoot, ...root.path.split('/')), name, maxEntries: 5000, insideComponents: true });
      results.push({ root: root.path, status: 'inspected', candidates: found.candidates });
    } catch { results.push({ root: root.path, status: 'unavailable-or-limited' }); }
  }
  return { name, results, allRootsInspected: results.length > 0 && results.every(item => item.status === 'inspected'), scope: 'Configured local component directories only; symlinks and ignored build directories are skipped. Live AEM, inheritance and later filesystem changes are not verified.' };
}
