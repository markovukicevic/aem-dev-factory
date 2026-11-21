/** Read Bitbucket PR file statistics without claiming the diff was reviewed. */
export async function readBitbucketPrDiffstat({ scm, number }) {
  if (scm?.provider !== 'bitbucket-cloud' || !Number.isSafeInteger(number) || number < 1) throw new TypeError('Invalid Bitbucket PR request');
  const valid = pr => pr?.id === number && /^[a-f0-9]{7,64}$/i.test(pr.source?.commit?.hash ?? '') && /^[a-f0-9]{7,64}$/i.test(pr.destination?.commit?.hash ?? '');
  const before = await scm.getPullRequest(number);
  if (!valid(before)) throw new Error('Bitbucket PR revisions unavailable');
  const files = await scm.getPullRequestDiffstat(number);
  if (!Array.isArray(files)) throw new Error('Invalid Bitbucket diffstat');
  const after = await scm.getPullRequest(number);
  if (!valid(after) || after.source.commit.hash !== before.source.commit.hash || after.destination.commit.hash !== before.destination.commit.hash) throw new Error('Bitbucket PR changed while diffstat was read');
  return { provider: 'bitbucket-cloud', number, source: before.source.commit.hash, destination: before.destination.commit.hash, files, limitations: ['File statistics are not a full code diff.', 'PR may change after inspection.'] };
}
