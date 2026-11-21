import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Gather read-only Git evidence; the base is a separately configured value. */
export async function readGitState(cwd, { run = execFileAsync } = {}) {
  const options = { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 };
  const [{ stdout: head }, { stdout: status }, { stdout: revision }] = await Promise.all([
    run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], options),
    run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=normal'], options),
    run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], options),
  ]);
  const branch = head.trim();
  const commit = revision.trim();
  if (!branch || !/^[a-f0-9]{40,64}$/i.test(commit)) throw new Error('Git did not return a branch and commit.');
  return { head: branch, commit, workingTreeClean: status.length === 0 };
}
