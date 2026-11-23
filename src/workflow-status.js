import { join } from 'node:path';
import { inspectTicketDirectory } from './ticket-status.js';
import { checkPlanReview } from './plan-review.js';

/** Suggest a workflow phase from local artifacts and declared statuses only. */
export async function inspectWorkflowStatus({ path }) {
  const ticket = await inspectTicketDirectory(path);
  const status = name => ticket.files.find(item => item.name === name)?.status ?? 'missing';
  const critical = ['source-identity.json', 'raw-story.md', 'dor.md', 'explain.md', 'research.md', 'implement.md', 'validation-report.md', 'verification.md', 'dod.md'];
  const unsafe = critical.filter(name => !['present', 'missing'].includes(status(name)));
  const missing = critical.filter(name => status(name) === 'missing');
  let review = null;
  if (ticket.plan && status('validation-report.md') === 'present') {
    try { review = { format: 'structured', ...(await checkPlanReview({ planPath: join(path, 'implement.md'), reportPath: join(path, 'validation-report.md') })) }; }
    catch { review = { format: 'unstructured-or-invalid' }; }
  }
  let phase, nextStep = null;
  if (unsafe.length) phase = 'inspect-unreadable-artifacts';
  else if (status('raw-story.md') === 'missing') phase = 'collect-source';
  else if (['dor.md', 'explain.md', 'research.md'].some(name => status(name) === 'missing')) phase = 'prepare-requirements';
  else if (status('implement.md') === 'missing') phase = 'prepare-plan';
  else if (status('validation-report.md') === 'missing') phase = 'review-plan';
  else if (!ticket.plan) phase = 'inspect-plan';
  else if (ticket.plan.counts.blocked > 0) phase = 'inspect-blocked-step';
  else if (ticket.plan.counts['in-progress'] > 0) phase = 'inspect-in-progress-step';
  else if (review?.format !== 'structured') phase = 'inspect-plan-review';
  else if (!review.planMatches || review.contextMatches === false || review.identityMatches === false) phase = 'review-plan';
  else if (review.contextMatches !== true || review.identityMatches !== true) phase = 'inspect-plan-review';
  else if (review.verdict !== 'ready') phase = 'resolve-plan-review';
  else if (ticket.plan.next) { phase = 'execute-next-step'; nextStep = ticket.plan.next; }
  else if (status('verification.md') === 'missing') phase = 'verify-change';
  else if (status('dod.md') === 'missing') phase = 'review-definition-of-done';
  else phase = 'review-existing-evidence';
  return { path, phase, nextStep, missing, unsafe, sourceIdentityAvailable: !!ticket.identity, plan: ticket.plan, review, scope: 'Suggestions from local artifact presence and declared statuses only. Requirement readiness, plan approval, completed checks, source identity and release readiness are not verified; inspect the actual evidence before acting.' };
}
