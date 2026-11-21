import { inspectConfiguredReadiness } from './configured-readiness.js';
import { inspectPlanReadiness } from './inspect-readiness.js';
import { readGitHubOrigin } from './github-origin.js';
import { inspectPublishedBranch } from './published-branch.js';
import { inspectBranchDiff } from './branch-diff.js';
import { createGitHubClient } from './github.js';
import { createReadyPullRequest } from './pr-workflow.js';

/** Explicit PR creation flow. It never pushes, retries writes, or discovers credentials. */
export async function createGitHubPullRequest(input, dependencies = {}) {
  const inspect = dependencies.inspect ?? inspectConfiguredReadiness;
  const refresh = dependencies.refresh ?? inspectPlanReadiness;
  const originReader = dependencies.originReader ?? readGitHubOrigin;
  const publishedReader = dependencies.publishedReader ?? inspectPublishedBranch;
  const makeClient = dependencies.makeClient ?? createGitHubClient;
  const inspectDiff = dependencies.inspectDiff ?? inspectBranchDiff;
  const first = await inspect({ cwd: input.cwd, configPath: input.configPath, planPath: input.planPath });
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
  const last = await publishedReader({ cwd: input.cwd, head });
  if (!last.published || last.commit !== published.commit) return { created: false, blockers: ['The branch changed during inspection.'], warnings: current.warnings };
  const diff = await inspectDiff({ cwd: input.cwd, base: current.readiness.branch.base });
  if (!diff.hasCommits || !diff.hasChanges) return { created: false, blockers: ['There are no file changes beyond the tracked base branch.'], warnings: current.warnings };
  const client = makeClient({ owner: input.owner, repository: input.repository, token: input.token });
  const existing = await client.listOpenPullRequests({ owner: input.owner, head, base: current.readiness.branch.base });
  if (!Array.isArray(existing)) throw new Error('Invalid GitHub pull request response');
  if (existing.length) return { created: false, blockers: ['An open pull request already exists for this branch and base.'], existingPullRequests: existing.map(pr => ({ number: pr.number, url: pr.html_url })), warnings: current.warnings };
  return createReadyPullRequest({ provider: client, readiness: current.readiness, title: input.title, body: input.body, draft: input.draft });
}
