/** Read one Azure PR commit page; merge-result SHAs do not prove current branch heads. */
export async function readAzurePrCommitPage({ scm, number, continuationToken }) {
  if (scm?.provider !== 'ado' || !Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw new TypeError('Invalid Azure PR commits request');
  if (continuationToken !== undefined && (typeof continuationToken !== 'string' || !continuationToken || continuationToken.length > 4096)) throw new TypeError('Invalid continuation token');
  const page = await scm.getPullRequestCommitPage(number, { top: 100, continuationToken });
  if (!page || !Array.isArray(page.values) || page.values.length > 100) throw new Error('Invalid Azure PR commits page');
  const seen = new Set();
  for (const item of page.values) {
    if (!item || typeof item.commitId !== 'string' || !/^[a-f0-9]{40}$/i.test(item.commitId) || seen.has(item.commitId.toLowerCase())) throw new Error('Invalid or repeated Azure commit');
    seen.add(item.commitId.toLowerCase());
  }
  if (page.continuationToken !== null && (typeof page.continuationToken !== 'string' || !page.continuationToken || page.continuationToken.length > 4096 || page.continuationToken === continuationToken)) throw new Error('Invalid Azure continuation token');
  return { provider: 'ado', number, commits: page.values, continuationToken: page.continuationToken, paginationComplete: null, scope: 'One Azure DevOps PR commits page only. Pagination completeness, current branch revisions, full diff and review are not verified.' };
}
