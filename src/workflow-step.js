import { join } from 'node:path';
import { isPlanStepId, canRunCorrectiveStep } from './plan-step-id.js';
import { lstat, writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { inspectWorkflowStatus } from './workflow-status.js';
import { transitionPlanFile } from './plan-transition.js';
import { readPlanStatus } from './plan-status.js';
import { checkPlanReview, readPlanReviewDigest } from './plan-review.js';

/** Preview a step start using local, editable review records and plan status. */
export async function previewWorkflowStep({ path, step }) {
  if (!isPlanStepId(step)) throw new TypeError('Invalid plan step');
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

async function currentReview(planPath, reportPath) {
  try {
    const review = await checkPlanReview({ planPath, reportPath });
    return review.verdict === 'ready' && review.planMatches && review.contextMatches === true && review.identityMatches === true ? review : null;
  } catch { return null; }
}

/** Record supplied step evidence and transition an explicit in-progress step. */
export async function finishWorkflowStep({ path, step, outcome, inputPath, outputPath, expectedDigest }) {
  if (typeof path !== 'string' || !path.trim() || !isPlanStepId(step) || !['done', 'blocked'].includes(outcome) || typeof outputPath !== 'string' || !outputPath.trim() || typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid step finish request');
  const directory = await lstat(path), planPath = join(path, 'implement.md'), reportPath = join(path, 'validation-report.md');
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const planInfo = await lstat(planPath);
  if (!planInfo.isFile() || planInfo.isSymbolicLink()) throw new Error('Invalid plan file');
  try { await lstat(outputPath); throw Object.assign(new Error('Evidence exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const evidence = parseStepEvidence(JSON.parse((await readLimitedFile(inputPath, 262144)).toString('utf8')), outcome);
  const plan = await readPlanStatus(planPath);
  const active = plan.steps.filter(item => item.status === 'in-progress');
  const blocked = plan.steps.filter(item => item.status === 'blocked');
  const repairsBlockedParent = canRunCorrectiveStep(plan.steps, step);
  if (plan.digest !== expectedDigest || active.length !== 1 || active[0].number !== step || (outcome === 'done' && blocked.length > 0 && !repairsBlockedParent)) return { recorded: false, transitioned: false, reason: 'plan-state-or-digest-changed' };
  const review = outcome === 'done' ? await currentReview(planPath, reportPath) : null;
  if (outcome === 'done' && !review) return { recorded: false, transitioned: false, reason: 'plan-review-not-current' };
  const planContentDigest = await readPlanReviewDigest(planPath);
  if ((await readPlanStatus(planPath)).digest !== expectedDigest || (review && review.planContentDigest !== planContentDigest)) return { recorded: false, transitioned: false, reason: 'plan-state-or-digest-changed' };
  const record = { version: 1, step, outcome, planDigest: expectedDigest, planContentDigest, reviewDigest: review?.reviewDigest ?? null, recordedAt: new Date().toISOString(), ...evidence, scope: 'Supplied observations only; this editable record does not prove checks ran or establish correctness.' };
  const json = `${JSON.stringify(record, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > 262144) throw new Error('Step evidence exceeds size limit');
  await writeFile(outputPath, json, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (outcome === 'done') {
    const afterReview = await currentReview(planPath, reportPath);
    if (!afterReview || afterReview.reviewDigest !== review.reviewDigest || afterReview.planContentDigest !== planContentDigest) return { recorded: true, transitioned: false, evidencePath: outputPath, reason: 'plan-review-changed', scope: 'Evidence was retained; the plan was not transitioned. Inspect before retrying.' };
  }
  let transition;
  try { transition = await transitionPlanFile({ path: planPath, step, from: 'in-progress', to: outcome, expectedDigest }); }
  catch { return { recorded: true, transitioned: false, evidencePath: outputPath, reason: 'plan-transition-failed', scope: 'Evidence was retained; inspect the plan and lock before retrying.' }; }
  let evidenceCurrent = null;
  if (outcome === 'done') {
    try { const afterReview = await currentReview(planPath, reportPath); evidenceCurrent = !!afterReview && afterReview.reviewDigest === review.reviewDigest && afterReview.planContentDigest === planContentDigest && (await readPlanStatus(planPath)).digest === transition.digest; }
    catch { evidenceCurrent = false; }
  }
  return { recorded: true, transitioned: true, evidencePath: outputPath, transition, evidenceCurrent, scope: 'Declared status and supplied observations only; checks, review and correctness are not proven. Concurrent changes remain possible. If evidenceCurrent is false, inspect the completed step before continuing.' };
}


/** Compare an editable step record with declared status, plan content and review. */
export async function checkWorkflowStepEvidence({ path, step, evidencePath }) {
  if (typeof path !== 'string' || !path.trim() || !isPlanStepId(step)) throw new TypeError('Invalid step evidence check');
  const directory = await lstat(path);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const record = JSON.parse((await readLimitedFile(evidencePath, 262144)).toString('utf8'));
  if (!record || record.version !== 1 || record.step !== step || !['done', 'blocked'].includes(record.outcome) || typeof record.planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.planDigest) || typeof record.recordedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(record.recordedAt)) throw new Error('Invalid step evidence record');
  parseStepEvidence(record, record.outcome);
  const legacy = record.planContentDigest === undefined && record.reviewDigest === undefined;
  if (!legacy && (typeof record.planContentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.planContentDigest) || (record.outcome === 'done' ? typeof record.reviewDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.reviewDigest) : record.reviewDigest !== null))) throw new Error('Invalid step evidence fingerprints');
  const planPath = join(path, 'implement.md'), plan = await readPlanStatus(planPath);
  const statusMatches = plan.steps.some(item => item.number === step && item.status === record.outcome);
  const planContentMatches = legacy ? null : await readPlanReviewDigest(planPath) === record.planContentDigest;
  let reviewMatches = null;
  if (record.outcome === 'done' && !legacy) {
    const review = await currentReview(planPath, join(path, 'validation-report.md'));
    reviewMatches = review ? review.reviewDigest === record.reviewDigest && review.planContentDigest === record.planContentDigest : false;
  }
  return { step, outcome: record.outcome, statusMatches, planContentMatches, reviewMatches, consistent: statusMatches && planContentMatches === true && (record.outcome === 'blocked' || reviewMatches === true), scope: 'Editable supplied record and current local state comparison only; actual checks, review, source authenticity and correctness are not verified. Files may change afterward.' };
}
