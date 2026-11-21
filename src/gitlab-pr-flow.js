import { inspectConfiguredReadiness } from './configured-readiness.js';
import { inspectPlanReadiness } from './inspect-readiness.js';
import { readGitLabOrigin } from './gitlab-origin.js';
import { inspectPublishedBranch } from './published-branch.js';
import { inspectBranchDiff } from './branch-diff.js';
import { createGitLabClient } from './gitlab.js';

/** Explicit GitLab.com merge request creation; does not push or retry writes. */
export async function createGitLabMergeRequest(input, dependencies = {}) {
  const inspect = dependencies.inspect ?? inspectConfiguredReadiness;
  const refresh = dependencies.refresh ?? inspectPlanReadiness;
  const originReader = dependencies.originReader ?? readGitLabOrigin;
  const publishedReader = dependencies.publishedReader ?? inspectPublishedBranch;
  const inspectDiff = dependencies.inspectDiff ?? inspectBranchDiff;
  const makeClient = dependencies.makeClient ?? createGitLabClient;
  const first = await inspect({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath });
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
  const last = await publishedReader({ cwd: input.cwd, head });
  if (!last.published || last.commit !== published.commit) return { created: false, blockers: ['The branch changed during inspection.'], warnings: current.warnings };
  const base = current.readiness.branch.base;
  const diff = await inspectDiff({ cwd: input.cwd, base });
  if (!diff.hasCommits || !diff.hasChanges) return { created: false, blockers: ['There are no file changes beyond the tracked base branch.'], warnings: current.warnings };
  const client = makeClient({ project: input.project, token: input.token });
  const existing = await client.listOpenPullRequests({ head, base });
  if (!Array.isArray(existing)) throw new Error('Invalid GitLab merge request response');
  if (existing.length) return { created: false, blockers: ['An open merge request already exists for this branch and base.'], existingPullRequests: existing.map(mr => ({ number: mr.iid, url: mr.web_url })), warnings: current.warnings };
  const pullRequest = await client.createPullRequest({ title: input.title, body: input.body, draft: input.draft, head, base });
  return { created: true, pullRequest, warnings: current.warnings };
}
