import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Check commits and actual file changes against the locally tracked base branch. */
export async function inspectBranchDiff({ cwd, base }, { run = execFileAsync } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim() || typeof base !== 'string' || !base.trim() || base.startsWith('-')) throw new TypeError('cwd and base branch are required');
  const options = { cwd, encoding: 'utf8', maxBuffer: 8192 };
  const baseRef = `refs/remotes/origin/${base}`;
  await run('git', ['check-ref-format', baseRef], options);
  let baseCommit, headCommit;
  try {
    const [baseResult, headResult] = await Promise.all([run('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], options), run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], options)]);
    baseCommit = baseResult.stdout.trim();
    headCommit = headResult.stdout.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(baseCommit) || !/^[a-f0-9]{40,64}$/i.test(headCommit)) throw new Error('Invalid commit');
    await run('git', ['merge-base', baseRef, 'HEAD'], options);
  } catch {
    throw new Error('Base branch and HEAD do not have a known common ancestor.');
  }
  const { stdout } = await run('git', ['rev-list', '--count', `${baseRef}..HEAD`], options);
  const text = stdout.trim();
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('Invalid Git commit count');
  const count = Number(text);
  let hasChanges = false;
  try {
    await run('git', ['diff', '--quiet', '--no-ext-diff', '--no-textconv', `${baseRef}...HEAD`, '--'], options);
  } catch (error) {
    if (error?.code !== 1) throw error;
    hasChanges = true;
  }
  const [baseAfter, headAfter] = await Promise.all([run('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], options), run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], options)]);
  if (baseAfter.stdout.trim() !== baseCommit || headAfter.stdout.trim() !== headCommit) throw new Error('Git references changed during diff inspection');
  return { hasCommits: count > 0, hasChanges, count, baseCommit, headCommit };
}
