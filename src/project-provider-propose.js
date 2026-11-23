import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath } from 'node:fs/promises';
import { parseGitHubOrigin } from './github-origin.js';
import { parseGitLabOrigin } from './gitlab-origin.js';
import { parseBitbucketOrigin } from './bitbucket-origin.js';
import { parseAdoOrigin } from './ado-origin.js';
import { inspectProjectProfile } from './project-profile.js';
const execute = promisify(execFile);
/** Propose provider identities from an explicit local origin without changing configuration. */
export async function proposeProjectProviders({ target }, { run = execute, profile = inspectProjectProfile } = {}) {
  if (typeof target !== 'string' || !target.trim()) throw new TypeError('Project directory required');
  const info = await lstat(target); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid project directory');
  const root = await realpath(target), report = await profile({ path: root });
  let origin = null;
  try { const result = await run('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8', maxBuffer: 8192, timeout: 10000 }); origin = result.stdout.trim(); } catch { /* Missing origin is reported without exposing a URL. */ }
  let scm = null, ci = null, trackerCandidate = null;
  if (origin) {
    for (const [provider, parse] of [['github', parseGitHubOrigin], ['gitlab', parseGitLabOrigin], ['bitbucket-cloud', parseBitbucketOrigin], ['ado', parseAdoOrigin]]) {
      let values; try { values = parse(origin); } catch { continue; }
      scm = { provider, ...values };
      if (provider === 'github') { ci = { provider: 'github-actions', ...values }; trackerCandidate = { provider: 'github', ...values }; }
      if (provider === 'gitlab') { ci = { provider: 'gitlab-ci', ...values }; trackerCandidate = { provider: 'gitlab', ...values }; }
      if (provider === 'bitbucket-cloud') ci = { provider: 'bitbucket-pipelines', ...values };
      if (provider === 'ado') { ci = { provider: 'ado-pipelines', organization: values.organization, project: values.project }; trackerCandidate = { provider: 'ado', organization: values.organization, project: values.project }; }
      break;
    }
  }
  let baseBranch = null;
  try {
    const result = await run('git', ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 8192, timeout: 10000 });
    const value = result.stdout.trim(); if (value.startsWith('origin/') && value.length > 7 && !/[\u0000-\u0020\u007f]/.test(value)) baseBranch = value.slice(7);
  } catch { /* Local tracking metadata is optional. */ }
  return { root, originStatus: !origin ? 'unavailable' : scm ? 'recognized' : 'unsupported-or-credentialed', candidates: { scm, ci, tracker: trackerCandidate, baseBranch }, projectSignals: { candidates: report.candidates, manifests: report.manifests, locks: report.locks, warnings: report.warnings, scanLimited: report.scanLimited }, scope: 'Local origin and project markers produce candidates only. Tracker and CI can be independent, local remote references may be stale, and no credentials, service access or commands were verified.' };
}
