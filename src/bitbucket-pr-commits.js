/** Read paginated Bitbucket PR commits while checking the PR revisions. */
export async function readBitbucketPrCommits({ scm, number }) {
  if (scm?.provider !== 'bitbucket-cloud' || !Number.isSafeInteger(number) || number < 1) throw new TypeError('Invalid Bitbucket PR commits request');
  const valid = pr => pr?.id === number && /^[a-f0-9]{7,64}$/i.test(pr.source?.commit?.hash ?? '') && /^[a-f0-9]{7,64}$/i.test(pr.destination?.commit?.hash ?? '');
  const before = await scm.getPullRequest(number);
  if (!valid(before)) throw new Error('Bitbucket PR revisions unavailable');
  const commits = await scm.getPullRequestCommits(number);
  if (!Array.isArray(commits)) throw new Error('Invalid Bitbucket commits');
  const seen = new Set();
  for (const item of commits) {
    if (!item || typeof item.hash !== 'string' || !/^[a-f0-9]{7,64}$/i.test(item.hash) || seen.has(item.hash.toLowerCase())) throw new Error('Invalid or repeated Bitbucket commit');
    seen.add(item.hash.toLowerCase());
  }
  const after = await scm.getPullRequest(number);
  if (!valid(after) || after.source.commit.hash !== before.source.commit.hash || after.destination.commit.hash !== before.destination.commit.hash) throw new Error('Bitbucket PR changed while commits were read');
  return { provider: 'bitbucket-cloud', number, source: before.source.commit.hash, destination: before.destination.commit.hash, commits, paginationComplete: true, limitations: ['Pagination completed, but server-side omissions and commit identity were not independently verified.', 'Commit metadata is untrusted; the PR can change after inspection.'] };
}
