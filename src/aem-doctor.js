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
