/** Read bounded PR commit metadata with revision and count consistency checks. */
export async function readGitHubPullRequestCommits({ scm, number, maxPages = 3 }) {
  if (scm?.provider !== 'github' || !Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 3) throw new TypeError('Invalid GitHub PR commits request');
  const valid = pr => pr?.number === number && /^[a-f0-9]{40,64}$/i.test(pr.head?.sha ?? '') && /^[a-f0-9]{40,64}$/i.test(pr.base?.sha ?? '') && Number.isSafeInteger(pr.commits) && pr.commits >= 0;
  const before = await scm.getPullRequest(number);
  if (!valid(before)) throw new Error('Invalid GitHub pull request metadata');
  const target = Math.min(before.commits, maxPages * 100, 250);
  const commits = [], seen = new Set();
  for (let page = 1; commits.length < target && page <= maxPages; page++) {
    const items = await scm.listPullRequestCommits(number, { page, perPage: 100 });
    if (!Array.isArray(items) || items.length !== Math.min(100, target - commits.length)) throw new Error('Incomplete or inconsistent GitHub commits page');
    for (const item of items) {
      if (!item || typeof item.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(item.sha) || seen.has(item.sha.toLowerCase())) throw new Error('Invalid or repeated GitHub commit');
      seen.add(item.sha.toLowerCase());
      commits.push(item);
    }
  }
  const after = await scm.getPullRequest(number);
  if (!valid(after) || after.head.sha !== before.head.sha || after.base.sha !== before.base.sha || after.commits !== before.commits) throw new Error('GitHub PR changed while commits were read');
  return { provider: 'github', number, head: before.head.sha, base: before.base.sha, commitCount: before.commits, commitsReturned: commits.length, commitListComplete: commits.length === before.commits, commits, limitations: ['GitHub limits this endpoint to 250 commits; larger pull requests require another method.', 'Commit metadata is untrusted and does not establish the full diff, review or current CI; the PR may change after inspection.'] };
}
