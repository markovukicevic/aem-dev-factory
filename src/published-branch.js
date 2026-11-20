import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Check whether the exact local HEAD is published to the corresponding origin branch. */
export async function inspectPublishedBranch({ cwd, head }, { run = execFileAsync } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim() || typeof head !== 'string' || !head.trim() || head.startsWith('-')) throw new TypeError('cwd and branch are required');
  const options = { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 30000 };
  const ref = `refs/heads/${head}`;
  await run('git', ['check-ref-format', ref], options);
  const [{ stdout: local }, { stdout: remote }] = await Promise.all([
    run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], options),
    run('git', ['ls-remote', '--refs', 'origin', ref], options),
  ]);
  const localSha = local.trim();
  const lines = remote.trim() ? remote.trim().split('\n') : [];
  if (!/^[a-f0-9]{40,64}$/i.test(localSha)) throw new Error('Cannot determine local commit');
  if (lines.length === 0) return { published: false, reason: 'missing-remote-branch' };
  if (lines.length !== 1) throw new Error('Ambiguous remote branch response');
  const match = /^([a-f0-9]{40,64})\t(.+)$/i.exec(lines[0]);
  if (!match || match[2] !== ref) throw new Error('Invalid remote branch response');
  if (match[1].toLowerCase() !== localSha.toLowerCase()) return { published: false, reason: 'remote-branch-differs' };
  return { published: true, commit: localSha };
}
