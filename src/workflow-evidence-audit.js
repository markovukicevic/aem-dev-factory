import { lstat } from 'node:fs/promises';
import { isPlanStepId } from './plan-step-id.js';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { readPlanStatus } from './plan-status.js';
import { checkWorkflowStepEvidence } from './workflow-step.js';

/** Inspect explicitly listed step records; do not discover files or run checks. */
export async function auditWorkflowEvidence({ path, indexPath }) {
  const directory = await lstat(path);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const index = JSON.parse((await readLimitedFile(indexPath, 262144)).toString('utf8'));
  if (!index || index.version !== 1 || !Array.isArray(index.records) || index.records.length > 200) throw new Error('Invalid evidence index');
  const seenSteps = new Set(), seenPaths = new Set();
  for (const item of index.records) {
    if (!item || !isPlanStepId(item.step) || typeof item.path !== 'string' || item.path.length > 1024 || !item.path || item.path.includes('\\') || item.path.split('/').some(part => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f]/.test(part)) || seenSteps.has(item.step) || seenPaths.has(item.path)) throw new Error('Invalid evidence index entry');
    seenSteps.add(item.step); seenPaths.add(item.path);
  }
  const planPath = join(path, 'implement.md');
  const planInfo = await lstat(planPath);
  if (!planInfo.isFile() || planInfo.isSymbolicLink()) throw new Error('Invalid plan file');
  const plan = await readPlanStatus(planPath), results = [];
  for (const item of index.records) {
    if (!plan.steps.some(step => step.number === item.step)) { results.push({ ...item, status: 'unknown-step' }); continue; }
    try {
      let current = path;
      for (const [i, part] of item.path.split('/').entries()) {
        current = join(current, part);
        const info = await lstat(current), last = i === item.path.split('/').length - 1;
        if (info.isSymbolicLink() || (last ? !info.isFile() : !info.isDirectory())) throw new Error('Unsafe record path');
      }
      const check = await checkWorkflowStepEvidence({ path, step: item.step, evidencePath: current });
      results.push({ ...item, status: check.consistent ? 'consistent' : 'needs-inspection', statusMatches: check.statusMatches, planContentMatches: check.planContentMatches, reviewMatches: check.reviewMatches });
    } catch (error) { results.push({ ...item, status: error?.code === 'ENOENT' ? 'missing' : 'unavailable-or-invalid' }); }
  }
  const unlisted = plan.steps.filter(step => ['done', 'blocked'].includes(step.status) && !seenSteps.has(step.number)).map(step => ({ step: step.number, status: step.status }));
  const planUnchanged = plan.digest === (await readPlanStatus(planPath)).digest;
  return { records: results, unlisted, planUnchanged, consistent: planUnchanged && unlisted.length === 0 && results.every(item => item.status === 'consistent'), scope: 'Explicit editable records and declared local state only; no checks, source authenticity, review or readiness are verified. Files may change while or after the audit runs.' };
}
