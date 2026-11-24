import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectAutomationDirectory } from './automation-local.js';
import { readGitState } from './git-state.js';
const exec = promisify(execFile);

/** Create a dedicated ignore file without replacing existing user configuration. */
export async function initializeAutomationIgnore({ target }) {
  const directory = await projectAutomationDirectory(target, false), path = join(directory, '.gitignore');
  await writeFile(path, '# Local automation runtime records\n/claims/\n/jobs/\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path, scope: 'Local ignore rules only. Git does not ignore already tracked files; this file and policy may need to be committed or otherwise ignored before a clean-worktree worker can run.' };
}
async function ignored(root, path) {
  try { await exec('git', ['check-ignore', '--no-index', '-q', '--', path], { cwd: root, timeout: 10000, maxBuffer: 8192 }); return true; }
  catch (error) { if (error?.code === 1) return false; throw error; }
}

/** Observe ignore rules and Git cleanliness without changing the repository. */
export async function inspectAutomationIgnore({ target }) {
  const directory = await projectAutomationDirectory(target, false), root = await realpath(target);
  const [claimsIgnored, jobsIgnored, git] = await Promise.all([
    ignored(root, '.ai/automation/claims/0000000000000000000000000000000000000000000000000000000000000000.json'),
    ignored(root, '.ai/automation/jobs/0000000000000000000000000000000000000000000000000000000000000000.json'),
    readGitState(root),
  ]);
  let ignoreFile;
  try { const info = await lstat(join(directory, '.gitignore')); ignoreFile = info.isFile() && !info.isSymbolicLink() ? 'present' : 'unsafe'; }
  catch (error) { if (error?.code !== 'ENOENT') throw error; ignoreFile = 'missing'; }
  return { claimsIgnored, jobsIgnored, ignoreFile, workingTreeClean: git.workingTreeClean, scope: 'Git rules and current worktree only. Ignored paths can still be tracked, state can change, and this does not establish event authenticity or worker readiness.' };
}
