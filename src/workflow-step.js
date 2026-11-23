import { join } from 'node:path';
import { lstat, writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { inspectWorkflowStatus } from './workflow-status.js';
import { transitionPlanFile } from './plan-transition.js';
import { readPlanStatus } from './plan-status.js';
import { checkPlanReview } from './plan-review.js';

/** Preview a step start using local, editable review records and plan status. */
export async function previewWorkflowStep({ path, step }) {
  if (!Number.isSafeInteger(step) || step < 1) throw new TypeError('Invalid plan step');
  const workflow = await inspectWorkflowStatus({ path });
  return { step, allowed: workflow.phase === 'execute-next-step' && workflow.nextStep?.number === step, phase: workflow.phase, planDigest: workflow.plan?.digest ?? null, review: workflow.review, scope: 'Local declared status and editable review records only; actual review, source authenticity and requirements are not verified.' };
}

/** Start one step using an explicit current digest, with a post-transition evidence recheck. */
export async function startWorkflowStep({ path, step, expectedDigest }) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('A current plan digest is required');
  const preview = await previewWorkflowStep({ path, step });
  if (!preview.allowed || preview.planDigest !== expectedDigest) return { started: false, preview, reason: 'workflow-or-digest-blocked' };
  const planPath = join(path, 'implement.md'), reportPath = join(path, 'validation-report.md');
  const transition = await transitionPlanFile({ path: planPath, step, from: 'pending', to: 'in-progress', expectedDigest });
  let evidenceCurrent = false;
  try {
    const [review, plan] = await Promise.all([checkPlanReview({ planPath, reportPath }), readPlanStatus(planPath)]);
    evidenceCurrent = review.verdict === 'ready' && review.planMatches && review.contextMatches === true && review.identityMatches === true && plan.digest === transition.digest && plan.steps.some(item => item.number === step && item.status === 'in-progress');
  } catch { /* Preserve the transition and report the missing recheck. */ }
  return { started: true, evidenceCurrent, transition, scope: 'Declared state transition and editable local review comparison only; actual review and requirements are not verified. Concurrent changes remain possible. If evidenceCurrent is false, stop and inspect the in-progress step before continuing.' };
}


function evidenceText(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new TypeError('Invalid step evidence text');
  return value;
}

function parseStepEvidence(input, outcome) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Array.isArray(input.checks) || input.checks.length > 30 || !Array.isArray(input.limitations) || input.limitations.length > 30) throw new TypeError('Invalid step evidence');
  const checks = input.checks.map(item => {
    if (!item || !['passed', 'failed', 'not-run'].includes(item.result)) throw new TypeError('Invalid step check');
    return { name: evidenceText(item.name, 512), result: item.result, evidence: evidenceText(item.evidence, 8192) };
  });
  const limitations = input.limitations.map(item => evidenceText(item, 8192));
  if (outcome === 'done' && (!checks.length || checks.some(item => item.result === 'failed') || (checks.some(item => item.result === 'not-run') && !limitations.length))) throw new TypeError('Done requires observed checks and disclosed unrun checks');
  return { summary: evidenceText(input.summary, 8192), checks, limitations };
}

async function reviewCurrent(planPath, reportPath) {
  try {
    const review = await checkPlanReview({ planPath, reportPath });
    return review.verdict === 'ready' && review.planMatches && review.contextMatches === true && review.identityMatches === true;
  } catch { return false; }
}

/** Record supplied step evidence and transition an explicit in-progress step. */
export async function finishWorkflowStep({ path, step, outcome, inputPath, outputPath, expectedDigest }) {
  if (typeof path !== 'string' || !path.trim() || !Number.isSafeInteger(step) || step < 1 || !['done', 'blocked'].includes(outcome) || typeof outputPath !== 'string' || !outputPath.trim() || typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid step finish request');
  const directory = await lstat(path), planPath = join(path, 'implement.md'), reportPath = join(path, 'validation-report.md');
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const planInfo = await lstat(planPath);
  if (!planInfo.isFile() || planInfo.isSymbolicLink()) throw new Error('Invalid plan file');
  try { await lstat(outputPath); throw Object.assign(new Error('Evidence exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const evidence = parseStepEvidence(JSON.parse((await readLimitedFile(inputPath, 262144)).toString('utf8')), outcome);
  const plan = await readPlanStatus(planPath);
  const active = plan.steps.filter(item => item.status === 'in-progress');
  if (plan.digest !== expectedDigest || active.length !== 1 || active[0].number !== step) return { recorded: false, transitioned: false, reason: 'plan-state-or-digest-changed' };
  if (outcome === 'done' && !await reviewCurrent(planPath, reportPath)) return { recorded: false, transitioned: false, reason: 'plan-review-not-current' };
  const record = { version: 1, step, outcome, planDigest: expectedDigest, recordedAt: new Date().toISOString(), ...evidence, scope: 'Supplied observations only; this editable record does not prove checks ran or establish correctness.' };
  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > 262144) throw new Error('Step evidence exceeds size limit');
  await writeFile(outputPath, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (outcome === 'done' && !await reviewCurrent(planPath, reportPath)) return { recorded: true, transitioned: false, evidencePath: outputPath, reason: 'plan-review-changed', scope: 'Evidence was retained; the plan was not transitioned. Inspect before retrying.' };
  let transition;
  try { transition = await transitionPlanFile({ path: planPath, step, from: 'in-progress', to: outcome, expectedDigest }); }
  catch { return { recorded: true, transitioned: false, evidencePath: outputPath, reason: 'plan-transition-failed', scope: 'Evidence was retained; inspect the plan and lock before retrying.' }; }
  let evidenceCurrent = null;
  if (outcome === 'done') {
    try { evidenceCurrent = await reviewCurrent(planPath, reportPath) && (await readPlanStatus(planPath)).digest === transition.digest; }
    catch { evidenceCurrent = false; }
  }
  return { recorded: true, transitioned: true, evidencePath: outputPath, transition, evidenceCurrent, scope: 'Declared status and supplied observations only; checks, review and correctness are not proven. Concurrent changes remain possible. If evidenceCurrent is false, inspect the completed step before continuing.' };
}
