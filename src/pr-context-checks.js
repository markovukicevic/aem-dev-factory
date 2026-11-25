/** Compare explicit local tracker and review observations around a provider PR write. */
export async function inspectPrContextChecks(input, expected) {
  const fingerprints = {};
  if (input.ticketCheck) {
    try {
      const ticket = await input.ticketCheck();
      if (!ticket?.matches || !/^[a-f0-9]{64}$/.test(ticket.localDigest ?? '')) return { allowed: false, blocker: 'The tracker ticket does not match the local source.' };
      fingerprints.ticket = ticket.localDigest;
    } catch { return { allowed: false, blocker: 'Unable to verify the tracker ticket against the local source.' }; }
  }
  if (input.reviewCheck) {
    try {
      const review = await input.reviewCheck();
      if (review?.verdict !== 'ready' || review.planMatches !== true || review.contextMatches !== true || review.identityMatches !== true || !/^[a-f0-9]{64}$/.test(review.reviewDigest ?? '')) return { allowed: false, blocker: 'The structured plan review is missing, stale or not ready.' };
      fingerprints.review = review.reviewDigest;
    } catch { return { allowed: false, blocker: 'Unable to inspect the structured plan review.' }; }
  }
  if (expected && (fingerprints.ticket !== expected.ticket || fingerprints.review !== expected.review)) return { allowed: false, blocker: 'The ticket or plan review changed during PR preparation.' };
  return { allowed: true, fingerprints };
}
