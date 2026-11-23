/** List one bounded page of active PRs; never assert repository-wide completeness. */
export async function listScmPullRequests({ scm }) {
  if (!['github', 'gitlab', 'ado', 'bitbucket-cloud'].includes(scm?.provider) || typeof scm.listPullRequestsPage !== 'function') throw new TypeError('Unsupported SCM provider');
  const response = await scm.listPullRequestsPage();
  const values = scm.provider === 'ado' ? response?.value : scm.provider === 'bitbucket-cloud' ? response?.values : response;
  if (!Array.isArray(values) || values.length > 20) throw new Error('Invalid pull request list');
  const seen = new Set();
  const items = values.map(item => {
    const number = scm.provider === 'github' ? item?.number : scm.provider === 'gitlab' ? item?.iid : scm.provider === 'ado' ? item?.pullRequestId : item?.id;
    const title = item?.title;
    if (!Number.isSafeInteger(number) || number < 1 || seen.has(number) || typeof title !== 'string' || !title.trim() || title.length > 4096) throw new Error('Invalid pull request list entry');
    seen.add(number);
    return { number, title };
  });
  return { provider: scm.provider, items, firstPageOnly: true, scope: 'One bounded page of active pull requests only; results may be incomplete, change during collection or omit inaccessible items. Titles are untrusted. No review or approval was performed.' };
}
