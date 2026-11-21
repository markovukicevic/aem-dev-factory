import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ignored = new Set(['.git', '.ai', 'node_modules', 'target', 'dist', 'build']);
const sourceFile = /(?:\.content\.xml|\.html|\.js|\.ts|\.scss|\.css|\.java)$/;

/** Locate source candidates by exact component directory name without following symlinks. */
export async function findAemComponents({ cwd, name, maxEntries = 50000 }) {
  if (typeof cwd !== 'string' || !cwd.trim() || !(await stat(cwd)).isDirectory()) throw new TypeError('A repository directory is required');
  if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new TypeError('A simple component name is required');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new TypeError('maxEntries must be positive');
  let count = 0;
  const found = [];
  async function walk(directory, underComponents, active) {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    count += entries.length;
    if (count > maxEntries) throw new Error('Repository search limit reached; results are incomplete');
    for (const entry of entries) {
      const child = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink() && !ignored.has(entry.name)) {
        const isCandidate = underComponents && entry.name.toLowerCase() === name.toLowerCase();
        const candidate = isCandidate ? { absolute: child, files: [] } : null;
        if (candidate) found.push(candidate);
        await walk(child, underComponents || entry.name === 'components', candidate ? [...active, candidate] : active);
      } else if (entry.isFile() && sourceFile.test(entry.name)) {
        for (const candidate of active) candidate.files.push(relative(candidate.absolute, child));
      }
    }
  }
  await walk(cwd, false, []);
  const candidates = found.filter(candidate => candidate.files.includes('.content.xml') || candidate.files.includes(join('_cq_dialog', '.content.xml'))).map(candidate => {
    const directory = relative(cwd, candidate.absolute);
    return {
      directory,
      definition: candidate.files.includes('.content.xml') ? join(directory, '.content.xml') : null,
      dialog: candidate.files.includes(join('_cq_dialog', '.content.xml')) ? join(directory, '_cq_dialog', '.content.xml') : null,
      files: candidate.files.map(path => join(directory, path)),
    };
  });
  return { name, candidates, scope: 'Local source candidates only; external models, authored pages and runtime behavior were not checked.' };
}
