import { evaluatePullRequestReadiness } from './pr-readiness.js';

/** Create a PR only after the caller supplies passing, current readiness evidence. */
export async function createReadyPullRequest({ provider, readiness, title, body = '', draft = false }) {
  const assessment = evaluatePullRequestReadiness(readiness);
  if (!assessment.ready) return { created: false, ...assessment };
  if (typeof provider?.createPullRequest !== 'function') throw new TypeError('A PR provider is required');
  const pullRequest = await provider.createPullRequest({
    title, body, draft, head: readiness.branch.head, base: readiness.branch.base,
  });
  return { created: true, pullRequest, warnings: assessment.warnings };
}
