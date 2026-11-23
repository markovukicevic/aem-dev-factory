import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);

/** Read a bounded view of the index and worktree without staging or committing. */
export async function previewCommit({ cwd }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Repository directory required');
  const options = { cwd, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, timeout: 30000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } };
  const text = buffer => new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  const run = async args => (await exec('git', args, options)).stdout;
  const capture = async () => {
    const [head, branch, index, staged, unstaged, untracked, conflicts] = await Promise.all([
      run(['rev-parse', '--verify', 'HEAD^{commit}']),
      run(['branch', '--show-current']),
      run(['ls-files', '--stage', '-z']),
      run(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-status', '-z', '--']),
      run(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', '--']),
      run(['ls-files', '--others', '--exclude-standard', '-z']),
      run(['ls-files', '--unmerged', '-z']),
    ]);
    return { head: text(head).trim(), branch: text(branch).trim(), index: createHash('sha256').update(index).digest('hex'), staged: text(staged), unstaged: text(unstaged), untracked: text(untracked), conflicts: text(conflicts) };
  };
  const first = await capture();
  if (!/^[a-f0-9]{40,64}$/i.test(first.head)) throw new Error('Invalid HEAD');
  const tokens = first.staged.split('\0');
  if (tokens.pop() !== '' || tokens.length % 2) throw new Error('Unexpected staged changes');
  const staged = [];
  for (let i = 0; i < tokens.length; i += 2) {
    if (!/^[ACDMRTUXB]$/.test(tokens[i]) || !tokens[i + 1]) throw new Error('Unsupported staged change');
    staged.push({ status: tokens[i], path: tokens[i + 1] });
  }
  const paths = value => value.split('\0').filter(Boolean);
  const second = await capture();
  const stable = Object.keys(first).every(key => first[key] === second[key]);
  return { branch: first.branch || null, head: first.head, indexDigest: first.index, staged, unstaged: paths(first.unstaged), untracked: paths(first.untracked), conflicts: first.conflicts.length > 0, stable, scope: 'Read-only local index and path summary. Working file contents, ignored files, tests, secrets, ownership and remote state are not verified; state may change immediately afterward.' };
}
