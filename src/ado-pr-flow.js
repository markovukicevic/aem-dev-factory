import { checkBeforePullRequestWrite } from './final-pr-check.js';
import { inspectConfiguredReadiness, readReadinessConfigDigest } from './configured-readiness.js';
import { inspectPlanReadiness } from './inspect-readiness.js';
import { readAdoOrigin } from './ado-origin.js';
import { inspectPublishedBranch } from './published-branch.js';
import { inspectBranchDiff } from './branch-diff.js';
import { createAdoScm } from './ado-scm.js';

/** Explicit Azure Repos PR creation. Never pushes or retries ambiguous writes. */
export async function createAdoPullRequest(input, dependencies = {}) {
  const inspect = dependencies.inspect ?? inspectConfiguredReadiness;
  const configDigest = dependencies.readConfigDigest ?? readReadinessConfigDigest;
  const refresh = dependencies.refresh ?? inspectPlanReadiness;
  const originReader = dependencies.originReader ?? readAdoOrigin;
  const publishedReader = dependencies.publishedReader ?? inspectPublishedBranch;
  const inspectDiff = dependencies.inspectDiff ?? inspectBranchDiff;
  const makeClient = dependencies.makeClient ?? createAdoScm;
  const first = await inspect({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath });
  if (!first.ready) return { created: false, blockers: first.blockers, warnings: first.warnings };
  const origin = await originReader(input.cwd);
  const matches = ['organization', 'project', 'repository'].every(key => typeof input[key] === 'string' && typeof origin[key] === 'string' && origin[key].toLowerCase() === input[key].toLowerCase());
  if (!matches) return { created: false, blockers: ['Azure DevOps repository does not match origin.'], warnings: first.warnings };
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
  const client = makeClient({ organization: input.organization, project: input.project, repository: input.repository, token: input.token });
  const existing = await client.listActivePullRequests({ head, base });
  if (existing.length) return { created: false, blockers: ['An active pull request already exists for this branch and base.'], existingPullRequests: existing.map(pr => ({ number: pr.pullRequestId, url: pr.url })), warnings: current.warnings };
  const final = await checkBeforePullRequestWrite({ refresh, configDigest, publishedReader, inspectDiff, expectedBaseCommit: diff.baseCommit, cwd: input.cwd, planPath: input.planPath, configPath: input.configPath, head, base: current.readiness.branch.base, commit: published.commit, expectedPlan: first.readiness.planDigest, expectedConfig: first.readiness.configDigest });
  if (!final.ready) return { created: false, blockers: final.blockers, warnings: final.warnings };
  const pullRequest = await client.createPullRequest({ title: input.title, body: input.body, draft: input.draft, head, base, workItemIds: input.workItemIds });
  return { created: true, pullRequest, warnings: final.warnings };
}
