import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Use an explicit base, or the locally recorded default branch for origin. */
export async function resolveBaseBranch({ cwd, configuredBase }, { run = execFileAsync } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('cwd is required');
  const options = { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 };
  let base = configuredBase;
  if (base !== undefined) {
    if (typeof base !== 'string' || !base || base.trim() !== base) throw new TypeError('configured base branch is invalid');
  } else {
    let remoteHead;
    try {
      ({ stdout: remoteHead } = await run('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], options));
    } catch {
      throw new Error('Cannot determine origin default branch; configure a base branch.');
    }
    const match = /^refs\/remotes\/origin\/(.+)\n?$/.exec(remoteHead);
    if (!match) throw new Error('Invalid origin default branch; configure a base branch.');
    base = match[1];
    try {
      await run('git', ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${base}`], options);
    } catch {
      throw new Error('Origin default branch reference is missing; configure a base branch.');
    }
  }
  if (base.startsWith('-')) throw new Error('Invalid base branch name.');
  try {
    await run('git', ['check-ref-format', `refs/heads/${base}`], options);
  } catch {
    throw new Error('Invalid base branch name.');
  }
  return base;
}
