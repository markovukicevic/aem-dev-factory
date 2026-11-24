const commit = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value);
function parseIterations(response) {
  if (!Array.isArray(response?.value) || response.value.length > 1000) throw new Error('Invalid Azure iterations response');
  const seen = new Set();
  return response.value.map(item => {
    const source = item?.sourceRefCommit?.commitId, target = item?.targetRefCommit?.commitId, common = item?.commonRefCommit?.commitId;
    if (!Number.isSafeInteger(item?.id) || item.id < 1 || item.id > 2147483647 || seen.has(item.id) || !commit(source) || !commit(target) || !commit(common)) throw new Error('Invalid Azure iteration');
    seen.add(item.id);
    return { id: item.id, source, target, common, createdAt: typeof item.createdDate === 'string' ? item.createdDate : null, reason: typeof item.reason === 'string' ? item.reason : null };
  }).sort((a, b) => a.id - b.id);
}
/** Read provider-reported PR iterations without assuming current branch heads. */
export async function readAzurePrIterations({ scm, number }) {
  if (scm?.provider !== 'ado' || !Number.isSafeInteger(number) || number < 1 || number > 2147483647) throw new TypeError('Invalid Azure PR');
  const before = await scm.getPullRequest(number);
  if (before?.pullRequestId !== number || typeof before.sourceRefName !== 'string' || typeof before.targetRefName !== 'string') throw new Error('Invalid Azure PR response');
  const iterations = parseIterations(await scm.getPullRequestIterations(number));
  const after = await scm.getPullRequest(number);
  if (after?.pullRequestId !== number || after.sourceRefName !== before.sourceRefName || after.targetRefName !== before.targetRefName || after.status !== before.status) throw new Error('Azure PR changed while reading iterations');
  return { provider: 'ado', number, sourceRef: before.sourceRefName, targetRef: before.targetRefName, status: typeof before.status === 'string' ? before.status : null, iterations, latestObserved: iterations.at(-1) ?? null, scope: 'Provider-reported iteration metadata only. Response completeness, current branch heads and diff contents are not established.' };
}
/** Read the latest observed iteration changes bound to an explicitly reviewed source SHA. */
export async function readAzureLatestIterationChanges({ scm, number, reviewedSha }) {
  if (typeof reviewedSha !== 'string' || !commit(reviewedSha)) throw new TypeError('Full reviewed commit required');
  const before = await readAzurePrIterations({ scm, number }), latest = before.latestObserved;
  if (!latest || latest.source.toLowerCase() !== reviewedSha.toLowerCase()) throw new Error('Latest observed iteration does not match reviewed commit');
  const changes = await scm.getIterationChanges(number, latest.id);
  if (!changes || !Array.isArray(changes.changes) || typeof changes.complete !== 'boolean') throw new Error('Invalid Azure iteration changes');
  const after = await readAzurePrIterations({ scm, number });
  if (JSON.stringify(before.latestObserved) !== JSON.stringify(after.latestObserved) || before.sourceRef !== after.sourceRef || before.targetRef !== after.targetRef || before.status !== after.status) throw new Error('Latest observed iteration changed');
  return { provider: 'ado', number, iteration: latest, changes: changes.changes, paginationComplete: changes.complete, scope: 'Changes are metadata for the latest observed iteration. Response completeness, current branch heads and full diff contents are not established.' };
}
