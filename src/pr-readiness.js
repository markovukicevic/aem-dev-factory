/**
 * Evaluate PR prerequisites without running commands or changing remote state.
 * Callers must gather the evidence and refresh it immediately before a push.
 */
export function evaluatePullRequestReadiness({ steps, provenance, checks, branch } = {}) {
  const blockers = [];
  const warnings = [];

  if (!Array.isArray(steps) || steps.length === 0) {
    blockers.push('No implementation steps were provided.');
  } else {
    for (const [index, step] of steps.entries()) {
      if (!step || step.status !== 'done') blockers.push(`Implementation step ${index + 1} is not done.`);
    }
  }
  if (provenance != null) {
    if (provenance.verified !== true) blockers.push('Implementation verification is not complete.');
    if (provenance.confidence === 'low') warnings.push('Implementation plan has low confidence.');
  }
  if (checks?.testsPassed !== true) blockers.push('Project tests have not passed.');
  if (checks?.workingTreeClean !== true) blockers.push('Working tree is not clean.');
  if (typeof branch?.base !== 'string' || !branch.base.trim()) blockers.push('Base branch is missing.');
  if (typeof branch?.head !== 'string' || !branch.head.trim()) blockers.push('Source branch is missing.');
  if (branch?.base && branch?.head && branch.base === branch.head) blockers.push('Source and base branches must differ.');

  return { ready: blockers.length === 0, blockers, warnings };
}
