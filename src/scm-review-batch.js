import { readScmReviewContext } from './scm-review-context.js';

/** Collect read-only contexts for explicitly selected PRs, retaining partial results. */
export async function readScmReviewBatch({ scm, ci, numbers }, { read = readScmReviewContext } = {}) {
  if (!Array.isArray(numbers) || !numbers.length || numbers.length > 10 || numbers.some(number => !Number.isSafeInteger(number) || number < 1) || new Set(numbers).size !== numbers.length) throw new TypeError('Select 1-10 distinct pull requests');
  if (!['github', 'gitlab', 'ado', 'bitbucket-cloud'].includes(scm?.provider) || typeof read !== 'function') throw new TypeError('Unsupported SCM provider');
  const results = [];
  for (const number of numbers) {
    try { results.push({ number, status: 'collected', context: await read({ scm, ci, number }) }); }
    catch { results.push({ number, status: 'unavailable-or-changed' }); }
  }
  return { provider: scm.provider, results, retrievedAll: results.every(item => item.status === 'collected'), scope: 'Read-only selected PR contexts, collected at different times. Collection is not a review, complete diff, approval or proof of current revisions. Inspect each provider-specific limitation and actual code.' };
}
