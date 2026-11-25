import { checkBeforePullRequestWrite } from './final-pr-check.js';
import { inspectSavedTestReadiness, recheckSavedTestEvidence } from './reused-test-readiness.js';
import { inspectConfiguredReadiness, readReadinessConfigDigest } from './configured-readiness.js';
import { inspectPlanReadiness } from './inspect-readiness.js';
import { readGitHubOrigin } from './github-origin.js';
import { inspectPublishedBranch } from './published-branch.js';
import { inspectBranchDiff } from './branch-diff.js';
import { createGitHubClient } from './github.js';
import { createReadyPullRequest } from './pr-workflow.js';

/** Explicit PR creation flow. It never pushes, retries writes, or discovers credentials. */
export async function createGitHubPullRequest(input, dependencies = {}) {
  const inspect = dependencies.inspect ?? inspectConfiguredReadiness;
  const configDigest = dependencies.readConfigDigest ?? readReadinessConfigDigest;
  const refresh = dependencies.refresh ?? inspectPlanReadiness;
  const originReader = dependencies.originReader ?? readGitHubOrigin;
  const publishedReader = dependencies.publishedReader ?? inspectPublishedBranch;
  const makeClient = dependencies.makeClient ?? createGitHubClient;
  const inspectDiff = dependencies.inspectDiff ?? inspectBranchDiff;
  let reviewDigest;
  if (input.reviewCheck) {
    try {
      const review = await input.reviewCheck();
      if (review?.verdict !== 'ready' || review.planMatches !== true || review.contextMatches !== true || review.identityMatches !== true || !/^[a-f0-9]{64}$/.test(review.reviewDigest ?? '')) return { created: false, blockers: ['The structured plan review is missing, stale or not ready.'], warnings: [] };
      reviewDigest = review.reviewDigest;
    } catch { return { created: false, blockers: ['Unable to inspect the structured plan review.'], warnings: [] }; }
  }
  let ticketDigest;
  if (input.ticketCheck) {
    try {
      const ticket = await input.ticketCheck();
      if (!ticket?.matches || !/^[a-f0-9]{64}$/.test(ticket.localDigest ?? '')) return { created: false, blockers: ['The tracker ticket does not match the local source.'], warnings: [] };
      ticketDigest = ticket.localDigest;
    } catch { return { created: false, blockers: ['Unable to verify the tracker ticket against the local source.'], warnings: [] }; }
  }
  const first = input.evidencePath ? await (dependencies.inspectSaved ?? inspectSavedTestReadiness)({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath, evidencePath: input.evidencePath, requireTicketBinding: !!input.ticketCheck }) : await inspect({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath });
  if (!first.ready) return { created: false, blockers: first.blockers, warnings: first.warnings };
  const origin = await originReader(input.cwd);
  if (typeof input.owner !== 'string' || typeof input.repository !== 'string' || origin.owner.toLowerCase() !== input.owner.toLowerCase() || origin.repository.toLowerCase() !== input.repository.toLowerCase()) {
    return { created: false, blockers: ['GitHub repository does not match origin.'], warnings: first.warnings };
  }
  const head = first.readiness.branch.head;
  const published = await publishedReader({ cwd: input.cwd, head });
  if (!published.published) return { created: false, blockers: ['The current commit is not published on the origin branch.'], warnings: first.warnings };
  if (first.readiness.branch.commit !== published.commit) return { created: false, blockers: ['The tested commit differs from the published commit.'], warnings: first.warnings };
  const current = await refresh({ cwd: input.cwd, planPath: input.planPath, testsPassed: true, base: first.readiness.branch.base });
  if (!current.ready || current.readiness.branch.head !== head || current.readiness.branch.commit !== published.commit) return { created: false, blockers: [...current.blockers, ...(current.readiness.branch.head !== head || current.readiness.branch.commit !== published.commit ? ['The current branch or commit changed during inspection.'] : [])], warnings: current.warnings };
  if (!/^[a-f0-9]{64}$/.test(first.readiness.planDigest ?? '') || first.readiness.planDigest !== current.readiness.planDigest) return { created: false, blockers: ['The implementation plan changed after testing.'], warnings: current.warnings };
  if (!/^[a-f0-9]{64}$/.test(first.readiness.configDigest ?? '') || first.readiness.configDigest !== await configDigest(input.configPath)) return { created: false, blockers: ['The readiness configuration changed after testing.'], warnings: current.warnings };
  const last = await publishedReader({ cwd: input.cwd, head });
  if (!last.published || last.commit !== published.commit) return { created: false, blockers: ['The branch changed during inspection.'], warnings: current.warnings };
  const diff = await inspectDiff({ cwd: input.cwd, base: current.readiness.branch.base });
  if (diff.headCommit !== published.commit && diff.hasCommits && diff.hasChanges) return { created: false, blockers: ['The diff does not match the tested commit.'], warnings: current.warnings };
  if (!diff.hasCommits || !diff.hasChanges) return { created: false, blockers: ['There are no file changes beyond the tracked base branch.'], warnings: current.warnings };
  const client = makeClient({ owner: input.owner, repository: input.repository, token: input.token });
  const existing = await client.listOpenPullRequests({ owner: input.owner, head, base: current.readiness.branch.base });
  if (!Array.isArray(existing)) throw new Error('Invalid GitHub pull request response');
  if (existing.length) return { created: false, blockers: ['An open pull request already exists for this branch and base.'], existingPullRequests: existing.map(pr => ({ number: pr.number, url: pr.html_url })), warnings: current.warnings };
  if (input.ticketCheck) {
    try {
      const ticket = await input.ticketCheck();
      if (!ticket?.matches || ticket.localDigest !== ticketDigest) return { created: false, blockers: ['The tracker ticket or local source changed during PR preparation.'], warnings: current.warnings };
    } catch { return { created: false, blockers: ['Unable to recheck the tracker ticket before PR creation.'], warnings: current.warnings }; }
  }
  if (input.reviewCheck) {
    try {
      const review = await input.reviewCheck();
      if (review?.verdict !== 'ready' || review.planMatches !== true || review.contextMatches !== true || review.identityMatches !== true || review.reviewDigest !== reviewDigest) return { created: false, blockers: ['The plan review or its context changed during PR preparation.'], warnings: current.warnings };
    } catch { return { created: false, blockers: ['Unable to recheck the plan review before PR creation.'], warnings: current.warnings }; }
  }
  if (input.evidencePath) {
    try {
      const consistent = await (dependencies.recheckSaved ?? recheckSavedTestEvidence)({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath, evidencePath: input.evidencePath, expectedDigest: first.evidenceDigest, requireTicketBinding: !!input.ticketCheck });
      if (!consistent) return { created: false, blockers: ['Saved test evidence changed or no longer matches the local state.'], warnings: first.warnings };
    } catch { return { created: false, blockers: ['Unable to recheck saved test evidence.'], warnings: first.warnings }; }
  }
  const final = await checkBeforePullRequestWrite({ refresh, configDigest, publishedReader, inspectDiff, expectedBaseCommit: diff.baseCommit, cwd: input.cwd, planPath: input.planPath, configPath: input.configPath, head, base: current.readiness.branch.base, commit: published.commit, expectedPlan: first.readiness.planDigest, expectedConfig: first.readiness.configDigest });
  if (!final.ready) return { created: false, blockers: final.blockers, warnings: final.warnings };
  const result = await createReadyPullRequest({ provider: client, readiness: final.readiness, title: input.title, body: input.body, draft: input.draft });
  if (input.evidencePath) result.warnings.push('Tests were not run in this invocation; the selected local record is editable and can be forged.');
  return result;
}
