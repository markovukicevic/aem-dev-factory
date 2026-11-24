import { lstat, realpath } from 'node:fs/promises';
import { relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readGitState } from './git-state.js';
import { parseGitHubOrigin } from './github-origin.js';
import { normalizeAutomationCommand } from './automation-job-run.js';
import { inspectWorkerComment } from './worker-comment.js';
import { inspectGitHubAppAuth, issueGitHubAppToken, revokeInstallationToken } from './github-app-exec.js';
import { inspectWorkerDelivery, loadWorkerPolicy } from './worker-delivery.js';
import { planAutomationTrigger } from './automation-trigger-plan.js';

const exec = promisify(execFile);
async function origin(cwd) { return (await exec('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 8192 })).stdout.trim(); }

/** Preview a GitHub trigger using a temporary GitHub App token, without starting work. */
export async function planGitHubAppTrigger({ target, store, command, body, headers, secret, appAuth, environment = process.env }, { issueToken = issueGitHubAppToken, revokeToken = revokeInstallationToken, plan = planAutomationTrigger, inspect = readGitState, readOrigin = origin } = {}) {
  if (typeof target !== 'string' || !target.trim() || typeof secret !== 'string' || !secret) throw new TypeError('Invalid app trigger request');
  const info = await lstat(target); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid target');
  const root = await realpath(target), app = inspectGitHubAppAuth(appAuth).app, appInfo = await lstat(app.target);
  if (!appInfo.isDirectory() || appInfo.isSymbolicLink() || await realpath(app.target) !== root) throw new Error('App target does not match project');
  const { policy } = await loadWorkerPolicy(root, 'github'), checked = inspectWorkerDelivery({ provider: 'github', body, headers, policy, secret });
  if (!checked.accepted) return { eligible: false, reason: checked.reason, tokenIssued: false, scope: 'Event rejected locally; no token or job was created.' };
  if (`${app.owner}/${app.repository}`.toLowerCase() !== checked.expected.repository.toLowerCase()) return { eligible: false, reason: 'app-repository-mismatch', tokenIssued: false, scope: 'App and event repositories differ; no token or job was created.' };
  const task = normalizeAutomationCommand(command); if (task.contextFile !== undefined) throw new Error('Worker does not support event-specific context files');
  const storeInfo = await lstat(store); if (!storeInfo.isDirectory() || storeInfo.isSymbolicLink()) throw new Error('Invalid execution store');
  const stateRoot = await realpath(store), rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Store must be outside project');
  const state = await inspect(root), actual = parseGitHubOrigin(await readOrigin(root));
  if (!state?.workingTreeClean || typeof state.head !== 'string' || !state.head || !/^[a-f0-9]{40,64}$/i.test(state.commit ?? '') || `${actual.owner}/${actual.repository}`.toLowerCase() !== checked.expected.repository.toLowerCase()) return { eligible: false, reason: 'worktree-or-origin-not-ready', tokenIssued: false, scope: 'Local preflight did not pass; no token or job was created.' };
  const reservation = await inspectWorkerComment({ store: stateRoot, provider: 'github', repository: checked.expected.repository, commentId: checked.expected.commentId });
  if (reservation.found) return { eligible: false, reason: 'comment-already-reserved', claimDigest: reservation.claimDigest, tokenIssued: false, scope: 'Existing editable reservation observed; no token or job was created.' };
  const lease = await issueToken({ config: { ...app, permissions: { ...app.permissions } }, privateKey: appAuth.privateKey });
  if (!lease?.issued) return { eligible: false, reason: 'app-token-unavailable', tokenIssued: null, tokenRevocation: lease?.tokenRevocation ?? 'unknown', tokenExpiresAt: lease?.expiresAt ?? null, scope: 'Token scope was not confirmed; a token may have been issued and no job was created.' };
  let result;
  try { result = await plan({ provider: 'github', target: root, store, command, body, headers, secret, environment: { ...environment, GITHUB_TOKEN: lease.token } }); }
  catch { result = { eligible: false, reason: 'preflight-unavailable' }; }
  let revocation; try { revocation = await revokeToken(lease.token); } catch { revocation = 'unconfirmed'; }
  return { eligible: result.eligible === true && revocation === 'acknowledged', preflight: result, tokenIssued: true, tokenRevocation: revocation, tokenExpiresAt: lease.expiresAt, scope: 'No job was queued or run. A GitHub App token was issued and revocation attempted; an unconfirmed or interrupted request may leave it active until expiry. Observations and authorization may change.' };
}
