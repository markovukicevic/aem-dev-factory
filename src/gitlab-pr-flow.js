import { checkBeforePullRequestWrite } from './final-pr-check.js';
import { inspectPrContextChecks } from './pr-context-checks.js';
import { inspectSavedTestReadiness, recheckSavedTestEvidence } from './reused-test-readiness.js';
import { inspectConfiguredReadiness, readReadinessConfigDigest } from './configured-readiness.js';
import { inspectPlanReadiness } from './inspect-readiness.js';
import { readGitLabOrigin } from './gitlab-origin.js';
import { inspectPublishedBranch } from './published-branch.js';
import { inspectBranchDiff } from './branch-diff.js';
import { createGitLabClient } from './gitlab.js';

/** Explicit GitLab.com merge request creation; does not push or retry writes. */
export async function createGitLabMergeRequest(input, dependencies = {}) {
  const inspect = dependencies.inspect ?? inspectConfiguredReadiness;
  const configDigest = dependencies.readConfigDigest ?? readReadinessConfigDigest;
  const refresh = dependencies.refresh ?? inspectPlanReadiness;
  const originReader = dependencies.originReader ?? readGitLabOrigin;
  const publishedReader = dependencies.publishedReader ?? inspectPublishedBranch;
  const inspectDiff = dependencies.inspectDiff ?? inspectBranchDiff;
  const makeClient = dependencies.makeClient ?? createGitLabClient;
  const context = await inspectPrContextChecks(input);
  if (!context.allowed) return { created: false, blockers: [context.blocker], warnings: [] };
  const first = input.evidencePath ? await (dependencies.inspectSaved ?? inspectSavedTestReadiness)({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath, evidencePath: input.evidencePath, requireTicketBinding: !!input.ticketCheck }) : await inspect({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath });
  if (!first.ready) return { created: false, blockers: first.blockers, warnings: first.warnings };
  const origin = await originReader(input.cwd);
  if (typeof input.project !== 'string' || origin.project.toLowerCase() !== input.project.toLowerCase()) return { created: false, blockers: ['GitLab project does not match origin.'], warnings: first.warnings };
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
  const base = current.readiness.branch.base;
  const diff = await inspectDiff({ cwd: input.cwd, base });
  if (diff.headCommit !== published.commit && diff.hasCommits && diff.hasChanges) return { created: false, blockers: ['The diff does not match the tested commit.'], warnings: current.warnings };
  if (!diff.hasCommits || !diff.hasChanges) return { created: false, blockers: ['There are no file changes beyond the tracked base branch.'], warnings: current.warnings };
  const client = makeClient({ project: input.project, token: input.token });
  const existing = await client.listOpenPullRequests({ head, base });
  if (!Array.isArray(existing)) throw new Error('Invalid GitLab merge request response');
  if (existing.length) return { created: false, blockers: ['An open merge request already exists for this branch and base.'], existingPullRequests: existing.map(mr => ({ number: mr.iid, url: mr.web_url })), warnings: current.warnings };
  const recheckedContext = await inspectPrContextChecks(input, context.fingerprints);
  if (!recheckedContext.allowed) return { created: false, blockers: [recheckedContext.blocker], warnings: current.warnings };
  if (input.evidencePath) {
    try {
      const consistent = await (dependencies.recheckSaved ?? recheckSavedTestEvidence)({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath, evidencePath: input.evidencePath, expectedDigest: first.evidenceDigest, requireTicketBinding: !!input.ticketCheck });
      if (!consistent) return { created: false, blockers: ['Saved test evidence changed or no longer matches the local state.'], warnings: first.warnings };
    } catch { return { created: false, blockers: ['Unable to recheck saved test evidence.'], warnings: first.warnings }; }
  }
  const final = await checkBeforePullRequestWrite({ refresh, configDigest, publishedReader, inspectDiff, expectedBaseCommit: diff.baseCommit, cwd: input.cwd, planPath: input.planPath, configPath: input.configPath, head, base: current.readiness.branch.base, commit: published.commit, expectedPlan: first.readiness.planDigest, expectedConfig: first.readiness.configDigest });
  if (!final.ready) return { created: false, blockers: final.blockers, warnings: final.warnings };
  const pullRequest = await client.createPullRequest({ title: input.title, body: input.body, draft: input.draft, head, base });
  return { created: true, pullRequest, warnings: [...final.warnings, ...(input.evidencePath ? ['Tests were not run in this invocation; the selected local record is editable and can be forged.'] : [])] };
}
