import { join } from 'node:path';
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
