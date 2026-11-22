import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readLimitedFile } from './read-limited.js';

async function kind(path, expected) {
  try {
    const info = await lstat(path);
    return !info.isSymbolicLink() && (expected === 'file' ? info.isFile() : info.isDirectory()) ? 'present' : 'unsupported';
  } catch (error) { if (error?.code === 'ENOENT') return 'missing'; throw error; }
}

/** Inspect one explicit local component directory; do not infer live AEM state. */
export async function inspectAemComponent({ path }) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Component path is required');
  if (await kind(path, 'directory') !== 'present') throw new Error('Component must be a local directory');
  const definitionPath = join(path, '.content.xml');
  let definition = { status: await kind(definitionPath, 'file') };
  if (definition.status === 'present') {
    try {
      const xml = (await readLimitedFile(definitionPath, 1024 * 1024)).toString('utf8');
      if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Unsupported XML');
      const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, processEntities: true }).parse(xml);
      const root = parsed['jcr:root'];
      if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('Missing root');
      definition = { status: 'present', primaryType: root['@_jcr:primaryType'] ?? null, componentGroup: root['@_componentGroup'] ?? null, superType: root['@_sling:resourceSuperType'] ?? null };
    } catch { definition = { status: 'invalid-or-unreadable' }; }
  }
  const dialogDir = join(path, '_cq_dialog');
  const dialogDirectory = await kind(dialogDir, 'directory');
  const dialog = dialogDirectory === 'present' ? await kind(join(dialogDir, '.content.xml'), 'file') : dialogDirectory;
  const entries = await readdir(path, { withFileTypes: true });
  if (entries.length > 10000) throw new Error('Component directory limit exceeded');
  const templates = entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.html')).map(entry => entry.name).sort();
  const warnings = [];
  if (definition.status !== 'present') warnings.push('Component definition is missing or could not be inspected.');
  else {
    if (!definition.primaryType) warnings.push('No explicit jcr:primaryType was found.');
    if (!definition.componentGroup) warnings.push('No explicit componentGroup was found; hidden or inherited components may intentionally omit it.');
    if (definition.superType) warnings.push('Resource supertype is declared but was not resolved.');
  }
  if (dialog !== 'present') warnings.push('No inspectable local dialog definition was found; a component may intentionally omit or inherit it.');
  if (!templates.length) warnings.push('No immediate local HTML template was found; rendering may be inherited or implemented elsewhere.');
  return { path, definition, dialog, templates, warnings, scope: 'Explicit local component files only; XML semantics, inheritance, runtime AEM, OSGi and dispatcher are not verified.' };
}

/** Inspect JSON syntax of local OSGi configs, without reporting configuration values. */
export async function inspectOsgiConfigs({ path, maxEntries = 5000, maxDepth = 12 }) {
  if (typeof path !== 'string' || !path.trim() || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000 || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 30) throw new TypeError('Invalid OSGi inspection options');
  if (await kind(path, 'directory') !== 'present') throw new Error('OSGi path must be a local directory');
  const queue = [{ dir: path, relative: '', depth: 0 }];
  const files = [];
  const skipped = [];
  let scanned = 0;
  while (queue.length) {
    const current = queue.pop();
    const entries = await readdir(current.dir, { withFileTypes: true });
    scanned += entries.length;
    if (scanned > maxEntries) throw new Error('OSGi inspection limit exceeded');
    for (const entry of entries) {
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      const full = join(current.dir, entry.name);
      if (entry.isSymbolicLink()) { skipped.push({ path: relative, reason: 'symlink' }); continue; }
      if (entry.isDirectory()) {
        if (current.depth >= maxDepth) skipped.push({ path: relative, reason: 'depth-limit' });
        else queue.push({ dir: full, relative, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.config')) { files.push({ path: relative, status: 'unsupported-format' }); continue; }
      if (!entry.name.endsWith('.cfg.json')) continue;
      try {
        const data = JSON.parse((await readLimitedFile(full, 1024 * 1024)).toString('utf8'));
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Configuration must be an object');
        files.push({ path: relative, status: 'valid-json-object' });
      } catch { files.push({ path: relative, status: 'invalid-or-unreadable' }); }
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  const groups = new Map();
  for (const file of files) {
    if (!file.path.endsWith('.cfg.json')) continue;
    const parts = file.path.split('/');
    const filename = parts.pop();
    const runmode = [...parts].reverse().find(part => /^config(?:\.[A-Za-z0-9_.-]+)?$/.test(part));
    if (!runmode) continue;
    const key = `${runmode}\0${filename}`;
    if (!groups.has(key)) groups.set(key, { runmode, filename, paths: [] });
    groups.get(key).paths.push(file.path);
  }
  const duplicateCandidates = [...groups.values()].filter(group => group.paths.length > 1).sort((a, b) => a.runmode.localeCompare(b.runmode) || a.filename.localeCompare(b.filename));
  return { path, files, skipped, duplicateCandidates, scope: 'Local JSON syntax and same-named configuration candidates only; installation precedence, runmode correctness, values, secrets and live OSGi services were not verified.' };
}
