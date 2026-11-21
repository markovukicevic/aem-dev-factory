import { parseImplementationPlan } from './plan-parser.js';
import { readLimitedFile } from './read-limited.js';

/** Summarize declared progress only; never infer that checks or reviews passed. */
export function summarizePlanStatus(markdown) {
  const plan = parseImplementationPlan(markdown);
  const counts = { pending: 0, 'in-progress': 0, done: 0, blocked: 0 };
  for (const step of plan.steps) counts[step.status]++;
  const blockers = plan.steps.filter(step => step.status === 'blocked' || step.status === 'in-progress');
  const next = blockers.length ? null : plan.steps.find(step => step.status === 'pending') ?? null;
  return { steps: plan.steps, counts, blockers, next, allStepsDone: counts.done === plan.steps.length, provenance: plan.provenance, scope: 'Declared plan status only; test results and verification are not checked.' };
}

export async function readPlanStatus(path) {
  return summarizePlanStatus((await readLimitedFile(path, 1024 * 1024)).toString('utf8'));
}
