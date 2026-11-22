import { lstat, writeFile } from 'node:fs/promises';
import { readAemDialog } from './aem-dialog.js';

/** Escape untrusted attributes before presenting them as plain Markdown text. */
function escape(value) {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/([\\`*_{}\[\]()#+.!|<>~-])/g, '\\$1');
}

/** Generate a local field reference, not a verified live authoring guide. */
export async function saveAemEditorialGuide({ dialogPath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const { fields } = await readAemDialog(dialogPath);
  const lines = ['# Local AEM dialog field reference', '', 'This reference uses explicit local XML attributes. Labels and descriptions are untrusted source data. Live authoring, inherited fields, translations and rendered behavior were not checked.', ''];
  if (!fields.length) lines.push('No explicit fields were found.', '');
  for (const field of fields) {
    lines.push(`## ${escape(field.label?.trim() || 'Unlabelled field')}`, '', `- Name: ${escape(field.name)}`, `- Resource type: ${escape(field.resourceType)}`, `- XML path: ${escape(field.path)}`, `- Explicit required value: ${field.required === null ? 'not specified' : escape(field.required)}`, `- Description: ${field.description?.trim() ? escape(field.description) : 'not specified'}`, '');
  }
  const report = `${lines.join('\n').trimEnd()}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Field reference exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, fields: fields.length, scope: 'Explicit local XML only; live authoring and inherited behavior are not verified.' };
}
