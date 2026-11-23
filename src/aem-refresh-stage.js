import { lstat, mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { previewAemRefresh, importAemRefresh } from './aem-refresh.js';
import { compareAemRefresh, saveAemRefreshComparison } from './aem-refresh-compare.js';

function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** Stage explicit local knowledge in a new separate directory without touching project files. */
export async function stageAemRefresh({ source, target, stage }) {
  if (typeof stage !== 'string' || !stage.trim()) throw new TypeError('Staging directory is required');
  const requested = resolve(stage), parent = dirname(requested), name = basename(requested);
  if (!name || name === '.' || name === '..') throw new TypeError('Invalid staging directory');
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) throw new Error('Staging parent must be a local directory');
  const stagePath = join(await realpath(parent), name);
  try { await lstat(stagePath); throw Object.assign(new Error('Staging path exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const plan = await previewAemRefresh({ source, target });
  if (inside(plan.source, stagePath) || inside(plan.target, stagePath)) throw new Error('Staging directory must be separate from source and target');
  if (plan.entries.some(item => (item.required && item.sourceStatus !== 'present') || !['present', 'missing'].includes(item.sourceStatus) || !['present', 'missing'].includes(item.destinationStatus))) return { complete: false, stage: null, reason: 'preflight-blocked', plan };
  await mkdir(stagePath, { mode: 0o700 });
  let imported;
  try {
    imported = await importAemRefresh({ source: plan.source, target: stagePath });
    if (!imported.complete) return { complete: false, stage: stagePath, reason: 'stage-import-failed', imported, scope: 'Staging directory and any partial copies are retained; the target project was not changed.' };
    const staged = await compareAemRefresh({ source: plan.source, target: stagePath });
    const copied = new Set(imported.copied.map(item => item.destination));
    const sourceMatches = staged.inspectionComplete && staged.entries.every(item => copied.has(item.destination) ? item.status === 'same' : !item.required && item.status === 'source-missing');
    if (!sourceMatches) return { complete: false, stage: stagePath, reason: 'source-changed-during-staging', imported, scope: 'Staging directory is retained; target project files were not changed.' };
    const comparison = await saveAemRefreshComparison({ source: plan.source, target: plan.target, outputPath: join(stagePath, 'comparison.md') });
    return { complete: comparison.inspectionComplete, stage: stagePath, imported, comparison, scope: 'Local staged copies and byte comparison only; the target project was not changed, content was not reviewed, and files may change later.' };
  } catch {
    return { complete: false, stage: stagePath, reason: 'staging-or-comparison-failed', ...(imported ? { imported } : {}), scope: 'Staging directory and any partial copies are retained; target project files were not changed.' };
  }
}
