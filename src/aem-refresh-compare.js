import { constants } from 'node:fs';
import { lstat, open, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { previewAemRefresh } from './aem-refresh.js';

async function hashFile(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size > 1024 * 1024) throw new Error('Invalid file');
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    if (offset > 1024 * 1024 || before.size !== offset || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('File changed during inspection');
    return createHash('sha256').update(buffer.subarray(0, offset)).digest('hex');
  } finally { await file.close(); }
}

/** Compare known local source files with existing project files without updating either. */
export async function compareAemRefresh({ source, target }) {
  const plan = await previewAemRefresh({ source, target });
  const entries = [];
  for (const item of plan.entries) {
    let status;
    if (item.sourceStatus === 'missing') status = 'source-missing';
    else if (item.sourceStatus !== 'present' || !['present', 'missing'].includes(item.destinationStatus)) status = 'unavailable';
    else if (item.destinationStatus === 'missing') status = 'new';
    else {
      try {
        const [sourceHash, destinationHash] = await Promise.all([
          hashFile(join(plan.source, ...item.source.split('/'))),
          hashFile(join(plan.target, '.ai', 'project', item.destination)),
        ]);
        status = sourceHash === destinationHash ? 'same' : 'changed';
      } catch { status = 'unavailable'; }
    }
    entries.push({ source: item.source, destination: item.destination, required: item.required, status });
  }
  return { source: plan.source, target: plan.target, entries, inspectionComplete: entries.every(item => item.status !== 'unavailable'), changesFound: entries.some(item => item.status === 'new' || item.status === 'changed'), scope: 'Local byte comparison only; contents and their correctness are not reviewed, existing files are not modified, and paths may change during or after inspection.' };
}

/** Save a comparison without replacing an existing report. */
export async function saveAemRefreshComparison({ source, target, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const result = await compareAemRefresh({ source, target });
  const json = JSON.stringify(result, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# AEM project knowledge comparison\n\nLocal byte comparisons follow. This report does not review contents or establish that files are current or safe to replace.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 262144) throw new Error('Comparison exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, inspectionComplete: result.inspectionComplete, changesFound: result.changesFound, scope: result.scope };
}
