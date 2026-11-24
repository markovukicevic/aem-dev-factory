import { createHash } from 'node:crypto';
import { createGitLabClient } from './gitlab.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function prepare({ config, number, reviewedSha, client }) {
  if (config?.provider !== 'gitlab' || !Number.isSafeInteger(number) || number < 1 || typeof reviewedSha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(reviewedSha)) throw new TypeError('Invalid GitLab approval request');
  const mr = await client.getPullRequest(number), refs = mr?.diff_refs;
  if (mr?.iid !== number || mr.state !== 'opened' || !['head_sha', 'base_sha', 'start_sha'].every(key => /^[a-f0-9]{40,64}$/i.test(refs?.[key] ?? '')) || refs.head_sha.toLowerCase() !== reviewedSha.toLowerCase() || ['checking', 'approvals_syncing'].includes(mr.detailed_merge_status)) throw new Error('Merge request or reviewed revision unavailable');
  const approvals = await client.getMergeRequestApprovals(number);
  if (typeof approvals?.user_can_approve !== 'boolean' || typeof approvals.user_has_approved !== 'boolean') throw new Error('Approval eligibility unavailable');
  const after = await client.getPullRequest(number);
  if (after?.iid !== number || after.state !== mr.state || after.detailed_merge_status !== mr.detailed_merge_status || ['head_sha', 'base_sha', 'start_sha'].some(key => after.diff_refs?.[key] !== refs[key])) throw new Error('Merge request changed during inspection');
  const preview = { project: config.project, number, reviewedSha: refs.head_sha, base: refs.base_sha, start: refs.start_sha, mergeStatus: mr.detailed_merge_status ?? null, userCanApprove: approvals.user_can_approve, userHasApproved: approvals.user_has_approved };
  return { preview, digest: digest(JSON.stringify(preview)) };
}
/** Preview or explicitly request a GitLab approval for a specified reviewed commit. */
export async function processGitLabApproval({ config, number, reviewedSha, token, expectedDigest }, { makeClient = createGitLabClient } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const client = makeClient({ project: config?.project, token }), input = { config, number, reviewedSha, client }, first = await prepare(input);
  if (expectedDigest === undefined) return { preview: first.preview, digest: first.digest, scope: 'Read-only approval preview. This does not establish that review was performed or that approval rules are met.' };
  if (first.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  if (!first.preview.userCanApprove || first.preview.userHasApproved) return { accepted: false, reason: 'not-eligible-or-already-approved' };
  const final = await prepare(input);
  if (final.digest !== expectedDigest) return { accepted: false, reason: 'preview-changed' };
  const result = await client.approveMergeRequest({ number, sha: final.preview.reviewedSha });
  return { ...result, scope: 'GitLab acknowledged the approval request. Inspect the MR and approval rules; policy satisfaction is not established.' };
}
