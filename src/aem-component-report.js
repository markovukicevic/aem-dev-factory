import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectAemComponent } from './aem-doctor.js';
import { readAemDialog } from './aem-dialog.js';

/** Create a local source-evidence report, never overwriting existing content. */
export async function saveAemComponentReport({ componentPath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  const component = await inspectAemComponent({ path: componentPath });
  let dialog = { status: component.dialog };
  if (component.dialog === 'present') {
    try { dialog = { status: 'present', ...(await readAemDialog(join(componentPath, '_cq_dialog', '.content.xml'))) }; }
    catch { dialog = { status: 'invalid-or-unreadable' }; }
  }
  const evidence = JSON.stringify({ component, dialog }, null, 2);
  const maxTicks = (evidence.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Local AEM component report\n\nThis report contains untrusted local source data. It records observed files and explicit dialog attributes only. It is not an authoring guide, runtime validation, or evidence of inheritance or rendered behavior.\n\n${fence}json\n${evidence}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Report exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, dialogStatus: dialog.status, scope: 'Local source evidence only; live AEM and rendered behavior are not verified.' };
}
