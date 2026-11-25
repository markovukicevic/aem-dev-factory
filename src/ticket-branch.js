import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { branchRef } from './git-ref.js';
import { inspectTicketDirectory } from './ticket-status.js';
import { readLimitedFile } from './read-limited.js';
import { loadReadinessConfig } from './config.js';
import { readinessConfigDigest } from './configured-readiness.js';
import { resolveBaseBranch } from './base-branch.js';
import { readGitState } from './git-state.js';
import { inspectPublishedBranch } from './published-branch.js';

const run = promisify(execFile);
const sha = value => createHash('sha256').update(value).digest('hex');

/** Preview or create one explicit local feature branch from the current tracked base. */
export async function processTicketBranch({ cwd, spec, configPath, branch, expectedDigest, checkRemote = false }) {
  const ref = branchRef(branch);
  if (typeof checkRemote !== 'boolean') throw new TypeError('Invalid remote check');
  if (expectedDigest !== undefined && !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid preview digest');
  const root = await realpath(cwd), specPath = await realpath(spec);
  const ticket = await inspectTicketDirectory(specPath);
  if (!ticket.identity || !['jira', 'github', 'gitlab', 'ado', 'local'].includes(ticket.identity.provider)) throw new Error('A recognized ticket identity is required');
  const identityDigest = sha(await readLimitedFile(join(specPath, 'source-identity.json'), 16384));
  const config = await loadReadinessConfig(configPath);
  const base = await resolveBaseBranch({ cwd: root, configuredBase: config.scm.baseBranch });
  const git = await readGitState(root);
  const options = { cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 };
  const { stdout } = await run('git', ['rev-parse', '--verify', `refs/remotes/origin/${base}^{commit}`], options);
  const baseCommit = stdout.trim();
  if (!/^[a-f0-9]{40,64}$/i.test(baseCommit)) throw new Error('Invalid tracked base commit');
  let exists;
  try { await run('git', ['show-ref', '--verify', '--quiet', ref], options); exists = true; }
  catch (error) { if (error.code !== 1) throw error; exists = false; }
  const blockers = [];
  if (!git.workingTreeClean) blockers.push('Working tree is not clean.');
  if (git.head !== base) blockers.push('Current branch is not the configured base.');
  if (git.commit !== baseCommit) blockers.push('Current commit does not match the local origin base reference.');
  if (exists) blockers.push('The requested local branch already exists.');
  if (branch === base) blockers.push('The feature branch must differ from the base.');
  let remoteBase = 'not-requested', remoteFeature = 'not-requested';
  if (checkRemote) {
    if (git.head !== base) { remoteBase = 'unknown'; blockers.push('Remote base cannot be checked from a different current branch.'); }
    else {
      try {
        const published = await inspectPublishedBranch({ cwd: root, head: base });
        remoteBase = published.published && published.commit === git.commit ? 'match' : 'different-or-missing';
        if (remoteBase !== 'match') blockers.push('Remote base does not match the local commit.');
      } catch { remoteBase = 'unknown'; blockers.push('Remote base could not be checked.'); }
    }
  }
  if (checkRemote) {
    try {
      const { stdout: listed } = await run('git', ['ls-remote', '--refs', 'origin', ref], options);
      const lines = listed.trim() ? listed.trim().split('\n') : [];
      const match = lines.length === 1 ? /^([a-f0-9]{40,64})\t(.+)$/i.exec(lines[0]) : null;
      if (lines.length > 1 || (lines.length === 1 && (!match || match[2] !== ref))) throw new Error('Invalid remote branch response');
      remoteFeature = lines.length ? 'exists' : 'missing';
      if (lines.length) blockers.push('The requested feature branch already exists on origin.');
    } catch { remoteFeature = 'unknown'; blockers.push('Remote feature branch could not be checked.'); }
  }
  const snapshot = { root, specPath, identityDigest, configDigest: readinessConfigDigest(config), base, baseCommit, head: git.head, commit: git.commit, clean: git.workingTreeClean, branch, exists, checkRemote, remoteBase, remoteFeature };
  const digest = sha(JSON.stringify(snapshot));
  const result = { created: false, allowed: blockers.length === 0, branch, base, commit: git.commit, remoteBase, remoteFeature, ticket: { provider: ticket.identity.provider, id: ticket.identity.id }, blockers, digest, scope: 'Local Git and editable ticket identity only. The tracked base may be stale when the remote check is not requested; ticket authenticity is not verified; remote observations can become stale. No push or remote write occurs.' };
  if (expectedDigest === undefined) return result;
  if (!result.allowed || expectedDigest !== digest) return { ...result, allowed: false, blockers: [...blockers, ...(expectedDigest !== digest ? ['The preview changed.'] : [])] };
  await run('git', ['switch', '--no-track', '-c', branch], options);
  const after = await readGitState(root);
  if (after.head !== branch || after.commit !== git.commit) throw new Error('Branch creation outcome changed; inspect Git state before retrying');
  return { ...result, created: true, workingTreeCleanAfter: after.workingTreeClean };
}

/** Identify whether the current branch is a configured or conventional protected base. */
export async function inspectTicketExecutionBranch({ cwd, configPath }) {
  const config = await loadReadinessConfig(configPath);
  const base = await resolveBaseBranch({ cwd, configuredBase: config.scm.baseBranch });
  const git = await readGitState(cwd);
  const protectedBranch = [base, 'main', 'master'].includes(git.head);
  return { allowed: !protectedBranch, branch: git.head, commit: git.commit, base, workingTreeClean: git.workingTreeClean, scope: 'Current local branch and configured base only; other project-specific protected branches and later changes require separate review.' };
}
