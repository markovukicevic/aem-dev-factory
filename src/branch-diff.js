import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Check commits and actual file changes against the locally tracked base branch. */
export async function inspectBranchDiff({ cwd, base }, { run = execFileAsync } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim() || typeof base !== 'string' || !base.trim() || base.startsWith('-')) throw new TypeError('cwd and base branch are required');
  const options = { cwd, encoding: 'utf8', maxBuffer: 8192 };
  const baseRef = `refs/remotes/origin/${base}`;
  await run('git', ['check-ref-format', baseRef], options);
  try {
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
  return { hasCommits: count > 0, hasChanges, count };
}
