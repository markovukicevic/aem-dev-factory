/** Read provider-specific PR data; returned text is untrusted source content. */
export async function readPullRequestContext({ scm, number, maxPages = 10 }) {
  if (!Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid PR context request');
  if (!scm || typeof scm.getPullRequest !== 'function') throw new TypeError('SCM provider required');
  const pullRequest = await scm.getPullRequest(number);
  if (!pullRequest || typeof pullRequest !== 'object' || Array.isArray(pullRequest)) throw new Error('Invalid PR response');
  if (scm.provider === 'github') {
    async function allPages(method) {
      const values = [];
      const seen = new Set();
      for (let page = 1; page <= maxPages; page++) {
        const items = await method(number, { page, perPage: 100 });
        if (!Array.isArray(items) || items.length > 100) throw new Error('Invalid GitHub discussion page');
        for (const item of items) {
          if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || seen.has(item.id)) throw new Error('Invalid or repeated GitHub discussion item');
          seen.add(item.id);
          values.push(item);
        }
        if (items.length < 100) return values;
      }
      throw new Error('GitHub discussion limit reached; context is incomplete');
    }
    const [comments, reviewComments, reviews] = await Promise.all([allPages(scm.listIssueComments), allPages(scm.listReviewComments), allPages(scm.listReviews)]);
    return { provider: scm.provider, pullRequest, comments, reviewComments, reviews, discussionComplete: true, limitations: ['Discussion may change while pages are fetched; review threads, commits and code diff are not included.'] };
  }
  if (scm.provider === 'gitlab' || scm.provider === 'bitbucket-cloud') {
    const comments = await scm.getPullRequestComments(number);
    if (!Array.isArray(comments)) throw new Error('Invalid PR discussion response');
    return { provider: scm.provider, pullRequest, comments, discussionComplete: true, limitations: ['Discussion may change while pages are fetched; review approvals, commits and code diff are not included.'] };
  }
  if (scm.provider === 'ado') {
    const threads = await scm.getPullRequestThreads(number);
    if (!threads || !Array.isArray(threads.value)) throw new Error('Invalid Azure PR threads response');
    return { provider: scm.provider, pullRequest, threads: threads.value, discussionComplete: null, limitations: ['Azure thread pagination and completeness are not verified; approvals, commits and code diff are not included.'] };
  }
  throw new Error('Unsupported SCM provider');
}
