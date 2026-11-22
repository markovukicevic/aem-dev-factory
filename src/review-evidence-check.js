import { readLimitedFile } from './read-limited.js';
import { describeProviderSources } from './provider-sources.js';

/** Compare an editable saved record with configured identities and observed PR revisions. */
export async function checkReviewEvidence({ path, config, scm }) {
  const report = (await readLimitedFile(path, 4 * 1024 * 1024)).toString('utf8');
  const match = /^# PR and CI evidence\n\nThis record contains untrusted provider data and may contain private information\. It captures observations only; it does not establish repository identity, required checks, approval or readiness\. Provider and PR state may change after collection\.\n\n(`{3,})json\n([\s\S]*?)\n\1\n$/.exec(report);
  if (!match) throw new Error('Invalid review evidence format');
  const evidence = JSON.parse(match[2]);
  if (!evidence || !Number.isSafeInteger(evidence.number) || evidence.number < 1 || !evidence.review || !evidence.ci || !evidence.sources || scm?.provider !== evidence.provider) throw new Error('Invalid review evidence fields');
  const expected = describeProviderSources(config);
  const recorded = describeProviderSources(evidence.sources);
  const sourceMatches = JSON.stringify(expected.scm) === JSON.stringify(recorded.scm) && JSON.stringify(expected.ci) === JSON.stringify(recorded.ci) && recorded.scm.provider === evidence.provider;
  const scope = 'Editable record and current PR metadata comparison only; CI freshness, actual repository identity, review and branch policy are not verified. A record can be forged and the PR may change after inspection.';
  if (!sourceMatches) return { sourceMatches: false, revisionMatches: null, ciFreshness: 'not-checked', consistent: false, scope };
  let head, base, start;
  if (evidence.provider === 'github') { head = evidence.review.head; base = evidence.review.base; }
  else if (evidence.provider === 'gitlab') { const refs = evidence.review.commitData?.revisions; head = refs?.head_sha; base = refs?.base_sha; start = refs?.start_sha; }
  else if (evidence.provider === 'bitbucket-cloud') { head = evidence.review.commitData?.source; base = evidence.review.commitData?.destination; }
  else if (evidence.provider !== 'ado') throw new Error('Unsupported evidence provider');
  if (evidence.provider !== 'ado') {
    const validSha = value => typeof value === 'string' && /^[a-f0-9]{40,64}$/i.test(value);
    if (!validSha(head) || !validSha(base) || (evidence.provider === 'gitlab' && !validSha(start)) || !validSha(evidence.ci.sha) || evidence.ci.sha.toLowerCase() !== head.toLowerCase()) throw new Error('Invalid evidence revisions');
  }
  const current = await scm.getPullRequest(evidence.number);
  let revisionMatches = null;
  if (evidence.provider === 'github') revisionMatches = current?.number === evidence.number && current?.head?.sha === head && current?.base?.sha === base;
  if (evidence.provider === 'gitlab') revisionMatches = current?.iid === evidence.number && current?.diff_refs?.head_sha === head && current?.diff_refs?.base_sha === base && current?.diff_refs?.start_sha === start;
  if (evidence.provider === 'bitbucket-cloud') revisionMatches = current?.id === evidence.number && current?.source?.commit?.hash === head && current?.destination?.commit?.hash === base;
  if (evidence.provider === 'ado' && current?.pullRequestId !== evidence.number) throw new Error('Azure pull request identity mismatch');
  return { sourceMatches, revisionMatches, ciFreshness: 'not-checked', consistent: revisionMatches === true, scope };
}
