import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { inspectTicketDirectory } from './ticket-status.js';
import { readGitState } from './git-state.js';
import { readGitHubOrigin, parseGitHubOrigin } from './github-origin.js';
import { loadReadinessConfig } from './config.js';
import { readinessConfigDigest } from './configured-readiness.js';
import { resolveBaseBranch } from './base-branch.js';
import { branchRef } from './git-ref.js';

const run = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');

/** Preview or explicitly publish the current ticket branch without force or retries. */
export async function processGitHubBranchPublish({ cwd, spec, configPath, providersPath, expectedDigest }, overrides = {}) {
  if (expectedDigest !== undefined && !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid preview digest');
  const originReader = overrides.originReader ?? readGitHubOrigin;
  const root = await realpath(cwd), specPath = await realpath(spec);
  const ticket = await inspectTicketDirectory(specPath);
  if (!ticket.identity || !['jira', 'github', 'gitlab', 'ado', 'local'].includes(ticket.identity.provider)) throw new Error('Ticket identity is unavailable');
  const identityDigest = hash(await readLimitedFile(join(specPath, 'source-identity.json'), 16384));
  const providers = JSON.parse((await readLimitedFile(providersPath, 262144)).toString('utf8'));
  const scm = providers?.scm, origin = await originReader(root);
  const pushOriginReader = overrides.pushOriginReader ?? (async cwd => {
    const { stdout } = await run('git', ['remote', 'get-url', '--push', '--all', 'origin'], { cwd, encoding: 'utf8', timeout: 30000, maxBuffer: 8192 });
    const lines = stdout.trim().split('\n');
    if (lines.length !== 1) throw new Error('Multiple push destinations are not supported');
    return parseGitHubOrigin(lines[0]);
  });
  const pushOrigin = await pushOriginReader(root);
  if (scm?.provider !== 'github' || typeof scm.owner !== 'string' || typeof scm.repository !== 'string' || origin.owner.toLowerCase() !== scm.owner.toLowerCase() || origin.repository.toLowerCase() !== scm.repository.toLowerCase() || pushOrigin.owner.toLowerCase() !== scm.owner.toLowerCase() || pushOrigin.repository.toLowerCase() !== scm.repository.toLowerCase()) throw new Error('GitHub fetch or push origin does not match configured SCM');
  const config = await loadReadinessConfig(configPath), git = await readGitState(root);
  const base = await resolveBaseBranch({ cwd: root, configuredBase: config.scm.baseBranch });
  const ref = branchRef(git.head), options = { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 };
  const readRemote = async () => {
    const { stdout } = await run('git', ['ls-remote', '--refs', 'origin', ref], options);
    const lines = stdout.trim() ? stdout.trim().split('\n') : [];
    if (lines.length > 1) throw new Error('Ambiguous remote branch');
    if (!lines.length) return null;
    const match = /^([a-f0-9]{40,64})\t(.+)$/i.exec(lines[0]);
    if (!match || match[2] !== ref) throw new Error('Invalid remote branch');
    return match[1].toLowerCase();
  };
  const remote = await readRemote();
  const blockers = [];
  if (!git.workingTreeClean) blockers.push('Working tree is not clean.');
  if ([base, 'main', 'master'].includes(git.head)) blockers.push('The current branch is a protected base.');
  if (remote && remote !== git.commit.toLowerCase()) {
    try { await run('git', ['merge-base', '--is-ancestor', remote, git.commit], options); }
    catch (error) { if ([1, 128].includes(error.code)) blockers.push('Remote branch is not a known ancestor of the local commit; inspect and fetch if appropriate.'); else throw error; }
  }
  const snapshot = { root, specPath, identityDigest, scm: { owner: origin.owner.toLowerCase(), repository: origin.repository.toLowerCase() }, configDigest: readinessConfigDigest(config), base, branch: git.head, commit: git.commit, clean: git.workingTreeClean, remote };
  const digest = hash(JSON.stringify(snapshot));
  const result = { published: false, allowed: !blockers.length, alreadyPublished: remote === git.commit.toLowerCase(), ticket: { provider: ticket.identity.provider, id: ticket.identity.id }, repository: `${origin.owner}/${origin.repository}`, branch: git.head, commit: git.commit, remoteCommit: remote, blockers, digest, scope: 'Explicit GitHub origin and local ticket identity only. No tests or PR are run. Git hooks and concurrent remote changes may affect the result; no force or automatic retry is used.' };
  if (expectedDigest === undefined) return result;
  if (!result.allowed || digest !== expectedDigest) return { ...result, allowed: false, blockers: [...blockers, ...(digest !== expectedDigest ? ['The preview changed.'] : [])] };
  if (result.alreadyPublished) return { ...result, published: true, sent: false };
  try { await run('git', ['push', '--no-follow-tags', '--recurse-submodules=no', 'origin', `${git.commit}:${ref}`], { ...options, timeout: 120000 }); }
  catch { throw new Error('Push outcome unclear; inspect the remote before retrying'); }
  try {
    const [after, remoteAfter] = await Promise.all([readGitState(root), readRemote()]);
    const confirmed = after.head === git.head && after.commit === git.commit && remoteAfter === git.commit.toLowerCase();
    return { ...result, published: confirmed, sent: true, confirmed };
  } catch { return { ...result, sent: true, confirmed: false }; }
}
