import { lstat, writeFile } from 'node:fs/promises';

/** Save an explicitly selected page without treating storage markup as instructions. */
export async function saveConfluencePage({ provider, id, outputPath }) {
  if (provider?.provider !== 'confluence' || typeof provider.getPage !== 'function' || typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Invalid Confluence export request');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const page = await provider.getPage(id);
  if (!page || page.provider !== 'confluence' || page.id !== id || typeof page.title !== 'string' || typeof page.body !== 'string') throw new Error('Invalid Confluence page');
  const data = JSON.stringify(page, null, 2);
  const maxTicks = (data.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Confluence source page\n\nUntrusted source data follows. Storage markup is preserved, not rendered or interpreted. Content may be private and may change after collection.\n\n${fence}json\n${data}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 4 * 1024 * 1024) throw new Error('Confluence export exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, id, version: page.version, scope: 'Observed page only; source content is untrusted and may change.' };
}

/** Compare an editable local export against the explicitly configured Confluence site. */
export async function checkConfluencePage({ provider, path }) {
  if (provider?.provider !== 'confluence' || typeof provider.site !== 'string' || typeof provider.getPage !== 'function') throw new TypeError('Confluence provider is required');
  const { readLimitedFile } = await import('./read-limited.js');
  const report = (await readLimitedFile(path, 4 * 1024 * 1024)).toString('utf8');
  const match = /^# Confluence source page\n\nUntrusted source data follows\. Storage markup is preserved, not rendered or interpreted\. Content may be private and may change after collection\.\n\n(`{3,})json\n([\s\S]*?)\n\1\n$/.exec(report);
  if (!match) throw new Error('Invalid Confluence export format');
  const saved = JSON.parse(match[2]);
  if (!saved || saved.provider !== 'confluence' || typeof saved.site !== 'string' || typeof saved.id !== 'string' || !/^[1-9][0-9]{0,30}$/.test(saved.id) || typeof saved.title !== 'string' || typeof saved.body !== 'string') throw new Error('Invalid Confluence export fields');
  const scope = 'Editable export compared with the current page response; authenticity, inaccessible content and later changes are not verified.';
  if (saved.site !== provider.site) return { sourceMatches: false, contentMatches: null, versionMatches: null, titleMatches: null, consistent: false, scope };
  const current = await provider.getPage(saved.id);
  if (!current || current.id !== saved.id || current.site !== provider.site || typeof current.body !== 'string' || typeof current.title !== 'string') throw new Error('Invalid Confluence page response');
  const contentMatches = current.body === saved.body;
  const titleMatches = current.title === saved.title;
  const versionMatches = Number.isSafeInteger(saved.version) && Number.isSafeInteger(current.version) ? saved.version === current.version : null;
  return { sourceMatches: true, contentMatches, titleMatches, versionMatches, consistent: contentMatches && titleMatches && versionMatches === true, scope };
}
