import { readScmReviewContext } from './scm-review-context.js';
import { readCiObservations } from './ci-observations.js';

/** Bind selected CI observations to an explicit PR SHA where provider evidence permits. */
export async function readReviewCiContext({ scm, reviewCi, ci, number, sha, branch }) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) throw new TypeError('A full Git commit SHA is required');
  const review = await readScmReviewContext({ scm, ci: reviewCi, number });
  let observedHead = null, observedBase = null;
  if (scm.provider === 'github') { observedHead = review.head; observedBase = review.base; }
  if (scm.provider === 'gitlab') { observedHead = review.commitData.revisions.head_sha; observedBase = review.commitData.revisions.base_sha; }
  if (scm.provider === 'bitbucket-cloud') { observedHead = review.commitData.source; observedBase = review.commitData.destination; }
  if (observedHead !== null && observedHead.toLowerCase() !== sha.toLowerCase()) throw new Error('Requested CI SHA does not match the observed PR head');
  const observations = await readCiObservations({ ci, sha, branch });
  if (observedHead !== null) {
    const latest = await scm.getPullRequest(number);
    let head, base, identity;
    if (scm.provider === 'github') { identity = latest?.number; head = latest?.head?.sha; base = latest?.base?.sha; }
    if (scm.provider === 'gitlab') { identity = latest?.iid; head = latest?.diff_refs?.head_sha; base = latest?.diff_refs?.base_sha; }
    if (scm.provider === 'bitbucket-cloud') { identity = latest?.id; head = latest?.source?.commit?.hash; base = latest?.destination?.commit?.hash; }
    if (identity !== number || head !== observedHead || base !== observedBase || (scm.provider === 'gitlab' && latest?.diff_refs?.start_sha !== review.commitData.revisions.start_sha)) throw new Error('PR changed while CI observations were read');
  }
  return { provider: scm.provider, number, review, ci: observations, prHeadMatchesSha: observedHead === null ? null : true, limitations: ['The independently configured CI project or repository is not verified to match the SCM repository.', 'A matching SHA and observed CI states do not establish required checks, branch policy, a complete review or readiness.', 'Provider observations and PR state can change after collection.', ...(observedHead === null ? ['Azure PR current head was not established; the supplied SHA is not verified against it.'] : [])] };
}
