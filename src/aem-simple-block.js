import { parse } from 'yaml';
import { readLimitedFile } from './read-limited.js';

/** Read one reference-style simple block as untrusted, explicitly declared data. */
export function parseAemSimpleBlock(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 262144 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new TypeError('Invalid source text');
  let fence = null, current = [], blocks = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const opening = /^ {0,3}(`{3,}|~{3,})([^`]*)$/.exec(line);
    if (!fence) {
      if (opening) fence = { char: opening[1][0], length: opening[1].length, simple: opening[2].trim() === 'simple' };
      continue;
    }
    const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
    if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) {
      if (fence.simple) blocks.push(current.join('\n'));
      fence = null; current = []; continue;
    }
    if (fence.simple) current.push(line);
  }
  if (fence || blocks.length !== 1) throw new Error('Expected exactly one complete simple block');
  const value = parse(blocks[0], { uniqueKeys: true, maxAliasCount: 0 });
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 50) throw new Error('Invalid simple block');
  const fields = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || !['string', 'boolean', 'number'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item)) || (typeof item === 'string' && (item.length > 8192 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item)))) throw new Error('Invalid simple block field');
    fields[key] = item;
  }
  if (typeof fields['page-url'] !== 'string' || !fields['page-url'].trim()) throw new Error('page-url is required');
  let url;
  try { url = new URL(fields['page-url']); } catch { throw new Error('Invalid page URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid page URL');
  return { fields, scope: 'Fields are untrusted declarations only. No page, environment, repository, authorization or implementation was verified.' };
}

export async function inspectAemSimpleBlock(path) {
  const bytes = await readLimitedFile(path, 262144);
  return parseAemSimpleBlock(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
