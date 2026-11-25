import { join } from 'node:path';
import { checkTestEvidence } from './test-evidence.js';
import { compareTicketSource } from './ticket-source-refresh.js';
import { inspectWorkflowStatus } from './workflow-status.js';
import { loadReadinessConfig } from './config.js';
import { resolveBaseBranch } from './base-branch.js';
import { readGitState } from './git-state.js';
import { readGitHubOrigin } from './github-origin.js';
import { inspectPublishedBranch } from './published-branch.js';
import { inspectBranchDiff } from './branch-diff.js';

/** Collect actionable observations without running checks or creating a PR. */
export async function inspectGitHubTicketPreflight({ cwd, path, configPath, config, ticket, evidencePath }, overrides = {}) {
  const ops = { checkTestEvidence, compareTicketSource, inspectWorkflowStatus, loadReadinessConfig, resolveBaseBranch, readGitState, readGitHubOrigin, inspectPublishedBranch, inspectBranchDiff, ...overrides };
  const checks = {};
  const observe = async (name, operation) => {
    try { checks[name] = await operation(); }
    catch { checks[name] = { status: 'unknown' }; }
  };
  await observe('ticket', async () => {
    const result = await ops.compareTicketSource({ path, config: config.tracker, ticket });
    return { status: result.matches ? 'match' : 'changed', provider: result.provider, id: result.id };
  });
  await observe('workflow', async () => {
    const result = await ops.inspectWorkflowStatus({ path });
    return { status: 'observed', phase: result.phase, missing: result.missing, unsafe: result.unsafe, review: result.review, plan: result.plan };
  });
  if (evidencePath) await observe('testEvidence', async () => {
    const result = await ops.checkTestEvidence({ cwd, configPath, planPath: join(path, 'implement.md'), evidencePath });
    return { status: result.consistent ? 'consistent' : 'stale-or-failed', checks: result.checks, scope: result.scope };
  });
  else checks.testEvidence = { status: 'not-requested' };
  let git, base, origin;
  await observe('git', async () => {
    git = await ops.readGitState(cwd);
    return { status: git.workingTreeClean ? 'clean' : 'dirty', branch: git.head, commit: git.commit };
  });
  await observe('repository', async () => {
    origin = await ops.readGitHubOrigin(cwd);
    const expected = config.scm;
    if (expected?.provider !== 'github' || typeof expected.owner !== 'string' || typeof expected.repository !== 'string') throw new Error('GitHub SCM configuration required');
    return { status: origin.owner.toLowerCase() === expected.owner.toLowerCase() && origin.repository.toLowerCase() === expected.repository.toLowerCase() ? 'match' : 'mismatch', owner: origin.owner, repository: origin.repository };
  });
  await observe('base', async () => {
    const readiness = await ops.loadReadinessConfig(configPath);
    base = await ops.resolveBaseBranch({ cwd, configuredBase: readiness.scm.baseBranch });
    return { status: 'observed', branch: base, distinctFromHead: git ? base !== git.head : null };
  });
  if (git && checks.repository.status === 'match') await observe('published', async () => {
    const result = await ops.inspectPublishedBranch({ cwd, head: git.head });
    return { status: result.published && result.commit === git.commit ? 'match' : 'not-matched', reason: result.reason ?? null };
  });
  else checks.published = { status: 'unknown' };
  if (git && base) await observe('changes', async () => {
    const result = await ops.inspectBranchDiff({ cwd, base });
    return { status: result.headCommit !== git.commit ? 'changed-during-inspection' : result.hasCommits && result.hasChanges ? 'present' : 'missing', commits: result.count, baseCommit: result.baseCommit };
  });
  else checks.changes = { status: 'unknown' };
  return { checks, scope: 'Read-only observations from editable local artifacts, configured tracker, Git and the current origin branch. No tests, CI, PR lookup or write are performed. Local tracking refs and all observations may become stale; this is not a readiness verdict.' };
}
