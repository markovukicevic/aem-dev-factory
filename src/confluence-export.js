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
