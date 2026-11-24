import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { normalizeAutomationCommand } from './automation-job-run.js';
import { readGitState } from './git-state.js';
import { parseGitHubOrigin } from './github-origin.js';
import { runTestCommand } from './command-runner.js';
const exec = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const allowedPermissions = new Set(['actions', 'checks', 'contents', 'issues', 'metadata', 'pull_requests']);
async function origin(cwd) { return (await exec('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 8192 })).stdout.trim(); }
function appFields(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !['appId', 'installationId', 'owner', 'repository', 'target', 'permissions'].includes(key)) || typeof config.appId !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(config.appId) || typeof config.installationId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(config.installationId) || typeof config.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(config.owner) || typeof config.repository !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(config.repository) || ['.', '..'].includes(config.repository) || typeof config.target !== 'string' || !isAbsolute(config.target) || /[\u0000-\u001f\u007f]/.test(config.target) || !config.permissions || typeof config.permissions !== 'object' || Array.isArray(config.permissions)) throw new TypeError('Invalid GitHub App settings');
  const entries = Object.entries(config.permissions).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length || entries.some(([key, value]) => !allowedPermissions.has(key) || !['read', 'write'].includes(value) || (key === 'metadata' && value !== 'read'))) throw new TypeError('Explicit GitHub App permissions are required');
  return { appId: config.appId, installationId: config.installationId, owner: config.owner, repository: config.repository, target: config.target, permissions: Object.fromEntries(entries) };
}
function appKey(value) {
  if (typeof value !== 'string' || value.length > 32768 || !value.trim()) throw new TypeError('GitHub App private key is required');
  const key = createPrivateKey(value);
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new TypeError('RSA private key of at least 2048 bits is required');
  const publicKey = createPublicKey(key).export({ type: 'spki', format: 'der' });
  return { key, fingerprint: hash(publicKey) };
}
async function prepare({ config, command, privateKey }, { inspect, readOrigin }) {
  const app = appFields(config), task = normalizeAutomationCommand(command), key = appKey(privateKey);
  if (task.contextFile !== undefined) throw new TypeError('Context files are not supported by this command');
  const info = await lstat(app.target); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid target directory');
  const root = await realpath(app.target), actual = parseGitHubOrigin(await readOrigin(root));
  if (actual.owner.toLowerCase() !== app.owner.toLowerCase() || actual.repository.toLowerCase() !== app.repository.toLowerCase()) throw new Error('GitHub origin does not match the selected repository');
  const state = await inspect(root);
  if (!state?.workingTreeClean || typeof state.head !== 'string' || !state.head || !/^[a-f0-9]{40,64}$/i.test(state.commit ?? '')) throw new Error('A clean branch and commit are required');
  const snapshot = { app: { ...app, target: root }, command: task, publicKeySha256: key.fingerprint, git: { head: state.head, commit: state.commit } };
  return { snapshot, key: key.key, digest: hash(JSON.stringify(snapshot)) };
}
async function readJson(response) {
  if (!response.ok || response.redirected || !response.body?.getReader) throw new Error('GitHub App token request failed');
  const reader = response.body.getReader(), parts = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; if (!(value instanceof Uint8Array)) throw new Error('Invalid response'); size += value.length; if (size > 262144) { await reader.cancel(); throw new Error('Token response too large'); } parts.push(value); } }
  finally { reader.releaseLock(); }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)));
}
function jwt(key, appId, now) {
  const seconds = Math.floor(now / 1000), encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const value = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: seconds - 60, exp: seconds + 540, iss: appId })}`;
  return `${value}.${sign('RSA-SHA256', Buffer.from(value), key).toString('base64url')}`;
}
export async function revokeInstallationToken(value, fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl('https://api.github.com/installation/token', { method: 'DELETE', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${value}`, 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    return !response.redirected && response.status === 204 ? 'acknowledged' : 'unconfirmed';
  } catch { return 'unconfirmed'; }
}

/** Validate app identity and key locally without issuing a token. */
export function inspectGitHubAppAuth({ config, privateKey }) {
  const app = appFields(config), key = appKey(privateKey);
  return { app, publicKeySha256: key.fingerprint };
}

/** Issue a scoped token for internal callers; never log or serialize the returned token. */
export async function issueGitHubAppToken({ config, privateKey }, { fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const app = appFields(config), key = appKey(privateKey);
  const response = await fetchImpl(`https://api.github.com/app/installations/${app.installationId}/access_tokens`, { method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${jwt(key.key, app.appId, now())}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ repositories: [app.repository], permissions: app.permissions }), redirect: 'error', signal: AbortSignal.timeout(15000) });
  const issued = await readJson(response);
  if (typeof issued?.token !== 'string' || !issued.token.trim() || issued.token !== issued.token.trim() || issued.token.length > 8192 || /[\u0000-\u001f\u007f]/.test(issued.token)) throw new Error('Token response invalid; a token may have been issued');
  const expiresAt = typeof issued.expires_at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(issued.expires_at) && Number.isFinite(Date.parse(issued.expires_at)) ? issued.expires_at : null;
  let valid = !!expiresAt && Date.parse(expiresAt) > now() && issued.repository_selection === 'selected' && Array.isArray(issued.repositories) && issued.repositories.length === 1 && typeof issued.repositories[0]?.full_name === 'string' && issued.repositories[0].full_name.toLowerCase() === `${app.owner}/${app.repository}`.toLowerCase() && issued.permissions && typeof issued.permissions === 'object' && !Array.isArray(issued.permissions);
  if (valid) {
    valid = Object.entries(issued.permissions).every(([key, value]) => app.permissions[key] === value || (key === 'metadata' && value === 'read' && app.permissions.metadata === undefined)) && Object.entries(app.permissions).every(([key, value]) => issued.permissions[key] === value);
  }
  if (!valid) return { issued: false, reason: 'scope-not-confirmed', expiresAt, tokenRevocation: await revokeInstallationToken(issued.token, fetchImpl) };
  return { issued: true, token: issued.token, expiresAt };
}

/** Preview or run one explicit command with a scoped, short-lived installation token. */
export async function processGitHubAppCommand({ config, command, privateKey, expectedDigest }, { inspect = readGitState, readOrigin = origin, fetchImpl = globalThis.fetch, run = runTestCommand, environment = process.env, now = Date.now } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const dependencies = { inspect, readOrigin }, input = { config, command, privateKey }, first = await prepare(input, dependencies);
  const { app, git, publicKeySha256, command: task } = first.snapshot;
  const preview = { appId: app.appId, installationId: app.installationId, owner: app.owner, repository: app.repository, target: app.target, permissions: app.permissions, publicKeySha256, git, executable: task.executable, argumentCount: task.args.length, timeoutMs: task.timeoutMs };
  if (expectedDigest === undefined) return { preview, digest: first.digest, scope: 'Read-only local preview; inspect full command. App installation and permissions were not contacted or verified.' };
  if (first.digest !== expectedDigest) return { started: false, reason: 'preview-changed' };
  const lease = await issueGitHubAppToken({ config, privateKey }, { fetchImpl, now });
  if (!lease.issued) return { started: false, reason: lease.reason, tokenExpiresAt: lease.expiresAt, tokenRevocation: lease.tokenRevocation, scope: 'Token scope was not confirmed; the command was not started. An unconfirmed revocation may leave it active until expiry.' };
  let outcome;
  try {
    const final = await prepare(input, dependencies);
    if (final.digest !== expectedDigest) outcome = { started: false, reason: 'preview-changed-after-token' };
    else {
      const childEnvironment = { ...environment, GITHUB_TOKEN: lease.token };
      for (const key of ['GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET', 'GITLAB_WEBHOOK_SIGNING_TOKEN', 'BITBUCKET_WEBHOOK_SECRET', 'ADO_WEBHOOK_PASSWORD', 'ADO_WEBHOOK_AUTHORIZATION']) delete childEnvironment[key];
      let result; try { result = await run({ cwd: app.target, ...task, environment: childEnvironment }); } catch { result = { passed: false, exitCode: null }; }
      outcome = { started: true, passed: result?.passed === true && result.exitCode === 0, exitCode: Number.isSafeInteger(result?.exitCode) ? result.exitCode : null };
    }
  } catch { outcome = { started: false, reason: 'scope-or-preparation-unavailable' }; }
  const tokenRevocation = await revokeInstallationToken(lease.token, fetchImpl);
  return { ...outcome, tokenExpiresAt: lease.expiresAt, tokenRevocation, scope: 'Local process result and revocation response only. Acknowledgment is not independent verification; an unconfirmed or interrupted revocation may leave the token active until expiry. Command output, descendant termination, correctness and external effects are not established.' };
}
