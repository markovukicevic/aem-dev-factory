import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { normalizeAutomationCommand } from './automation-job-run.js';
import { readGitState } from './git-state.js';
import { parseGitHubOrigin } from './github-origin.js';
import { parseGitLabOrigin } from './gitlab-origin.js';
import { inspectWorkerComment } from './worker-comment.js';
import { verifyWorkerTriggerComment } from './worker-comment-fresh.js';
import { inspectWorkerDelivery, loadWorkerPolicy } from './worker-delivery.js';
const exec = promisify(execFile);
async function origin(cwd) { return (await exec('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 8192 })).stdout.trim(); }

/** Read-only preflight of one selected event and fixed worker command. */
export async function planAutomationTrigger({ provider, target, store, command, body, headers, secret, environment = process.env }, { inspect = readGitState, readOrigin = origin, verifyComment = verifyWorkerTriggerComment } = {}) {
  if (!['github', 'gitlab', 'bitbucket-cloud'].includes(provider) || typeof target !== 'string' || !target.trim() || typeof store !== 'string' || !store.trim() || !Buffer.isBuffer(body) || body.length > 1024 * 1024 || typeof secret !== 'string' || !secret) throw new TypeError('Invalid trigger preflight');
  const task = normalizeAutomationCommand(command); if (task.contextFile !== undefined) throw new Error('Worker does not support event-specific context files');
  const targetInfo = await lstat(target), storeInfo = await lstat(store);
  if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink() || !storeInfo.isDirectory() || storeInfo.isSymbolicLink()) throw new Error('Invalid target or store');
  const root = await realpath(target), stateRoot = await realpath(store), rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Store must be outside project');
  const { policy } = await loadWorkerPolicy(root, provider), checked = inspectWorkerDelivery({ provider, body, headers, policy, secret });
  if (!checked.accepted) return { eligible: false, reason: checked.reason, scope: 'Offline event validation only; no reservation, task or provider call occurred.' };
  const claim = checked.expected;
  const reservation = await inspectWorkerComment({ store: stateRoot, provider, repository: claim.repository, commentId: claim.commentId });
  if (reservation.found) return { eligible: false, reason: 'comment-already-reserved', claimDigest: reservation.claimDigest, scope: 'Existing editable reservation observed; no command or provider call occurred.' };
  const state = await inspect(root), remote = await readOrigin(root);
  if (!state?.workingTreeClean || typeof state.head !== 'string' || !state.head || !/^[a-f0-9]{40,64}$/i.test(state.commit ?? '')) return { eligible: false, reason: 'worktree-not-ready' };
  if (provider === 'github') { const repo = parseGitHubOrigin(remote); if (`${repo.owner}/${repo.repository}`.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('GitHub origin mismatch'); }
  if (provider === 'gitlab' && parseGitLabOrigin(remote).project !== claim.repository) throw new Error('GitLab origin mismatch');
  const observed = await verifyComment({ target: root, claim, environment });
  if (observed?.matches !== true) return { eligible: false, reason: 'comment-changed-or-unavailable' };
  const after = await inspect(root), remoteAfter = await readOrigin(root), { policy: policyAfter } = await loadWorkerPolicy(root, provider), reservationAfter = await inspectWorkerComment({ store: stateRoot, provider, repository: claim.repository, commentId: claim.commentId });
  if (JSON.stringify(state) !== JSON.stringify(after) || remote !== remoteAfter || JSON.stringify(policy) !== JSON.stringify(policyAfter) || reservationAfter.found) return { eligible: false, reason: 'state-changed' };
  const preview = { provider, target: root, store: stateRoot, repository: claim.repository, actor: claim.actor, kind: claim.kind, number: claim.number, commentId: claim.commentId, claimDigest: checked.claimDigest, git: { head: state.head, commit: state.commit }, executable: task.executable, argumentCount: task.args.length, timeoutMs: task.timeoutMs };
  const digest = createHash('sha256').update(JSON.stringify({ preview, command: task, policy })).digest('hex');
  return { eligible: true, preview, digest, scope: 'Read-only observations only. No reservation, queue entry or command was created. A later delivery, current access, event headers, policy, repository and comment may differ; this digest does not authorize execution.' };
}
