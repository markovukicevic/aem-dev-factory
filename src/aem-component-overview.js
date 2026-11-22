import { join } from 'node:path';
import { lstat, writeFile } from 'node:fs/promises';
import { inspectAemComponent } from './aem-doctor.js';
import { auditAemDialog } from './aem-dialog-audit.js';
import { inspectLocalSupertype } from './aem-supertype.js';

/** Combine local observations without claiming AEM runtime or inheritance health. */
export async function inspectAemComponentOverview({ path, jcrRoot }) {
  if (jcrRoot !== undefined && (typeof jcrRoot !== 'string' || !jcrRoot.trim())) throw new TypeError('Invalid JCR root');
  const component = await inspectAemComponent({ path });
  let dialog = { status: component.dialog };
  if (component.dialog === 'present') {
    try { dialog = { status: 'inspected', ...(await auditAemDialog(join(path, '_cq_dialog', '.content.xml'))) }; }
    catch { dialog = { status: 'invalid-or-unreadable' }; }
  }
  let supertype = { status: 'not-requested' };
  if (jcrRoot !== undefined) {
    try { supertype = { status: 'inspected', ...(await inspectLocalSupertype({ componentPath: path, jcrRoot })) }; }
    catch { supertype = { status: 'invalid-or-unreadable' }; }
  }
  const limitations = ['Local files only; runtime behavior, rendered output, effective inheritance and accessibility are not verified.', 'Missing files and dialog audit candidates are not necessarily defects.', 'Files may change during inspection.'];
  if (jcrRoot === undefined) limitations.push('Local supertype candidates were not requested.');
  return { component, dialog, supertype, limitations };
}


/** Save local component observations without replacing an existing report. */
export async function saveAemComponentOverview({ path, jcrRoot, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const overview = await inspectAemComponentOverview({ path, jcrRoot });
  const json = JSON.stringify(overview, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Local AEM component overview\n\nUntrusted local source observations follow. This report does not establish runtime behavior, accessibility or effective inheritance. Files may change after inspection.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Overview report exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, dialogStatus: overview.dialog.status, supertypeStatus: overview.supertype.status, scope: 'Local source observations only; runtime and effective inheritance are not verified.' };
}
