/** Fetch a GitHub issue and all comment pages within an explicit safety bound. */
export async function fetchGitHubIssueContext({ client, number, maxPages = 10 }) {
  if (!Number.isSafeInteger(number) || number < 1) throw new TypeError('Issue number must be a positive integer');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('maxPages must be between 1 and 100');
  if (typeof client?.getIssue !== 'function' || typeof client?.listIssueComments !== 'function') throw new TypeError('Issue client is required');
  const issue = await client.getIssue(number);
  if (!issue || issue.number !== number || typeof issue.title !== 'string' || issue.pull_request) throw new Error('Expected a GitHub issue');
  const comments = [], commentIds = new Set();
  const perPage = 100;
  for (let page = 1; page <= maxPages; page++) {
    const items = await client.listIssueComments(number, { page, perPage });
    if (!Array.isArray(items) || items.length > perPage) throw new Error('Invalid GitHub comments response');
    for (const item of items) {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || commentIds.has(item.id) || (item.body !== null && typeof item.body !== 'string')) throw new Error('Invalid or repeated GitHub comment');
      commentIds.add(item.id);
      comments.push({ id: item.id, author: item.user?.login ?? null, body: item.body ?? '', createdAt: item.created_at ?? null, updatedAt: item.updated_at ?? null, url: item.html_url ?? null });
    }
    if (items.length < perPage) {
      if (Number.isSafeInteger(issue.comments) && issue.comments >= 0 && issue.comments !== comments.length) throw new Error('GitHub issue comments changed or are incomplete');
      if (typeof issue.updated_at === 'string' && issue.updated_at) {
        const latest = await client.getIssue(number);
        if (latest?.number !== number || latest.pull_request || latest.updated_at !== issue.updated_at || (Number.isSafeInteger(issue.comments) && latest.comments !== issue.comments)) throw new Error('GitHub issue changed during collection');
      }
      return {
        provider: 'github', number: issue.number, title: issue.title, body: issue.body ?? '', state: issue.state,
        url: issue.html_url ?? null, author: issue.user?.login ?? null,
        labels: (issue.labels ?? []).map(label => typeof label === 'string' ? label : label.name).filter(label => typeof label === 'string'),
        comments,
      };
    }
  }
  throw new Error('Issue comment limit reached; context is incomplete');
}
