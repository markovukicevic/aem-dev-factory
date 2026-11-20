import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Gather read-only Git evidence; the base is a separately configured value. */
export async function readGitState(cwd, { run = execFileAsync } = {}) {
  const options = { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 };
  const [{ stdout: head }, { stdout: status }] = await Promise.all([
    run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], options),
    run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], options),
  ]);
  const branch = head.trim();
  if (!branch) throw new Error('Git did not return a branch name.');
  return { head: branch, workingTreeClean: status.length === 0 };
}
