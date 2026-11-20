import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Run an explicitly supplied executable without a shell and return pass/fail evidence. */
export async function runTestCommand({ cwd, executable, args = [], timeoutMs = 120_000 }, { run = execFileAsync } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('cwd is required');
  if (typeof executable !== 'string' || !executable.trim()) throw new TypeError('executable is required');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new TypeError('args must be an array of strings');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive integer');
  try {
    await run(executable, args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true });
    return { passed: true, exitCode: 0 };
  } catch (error) {
    // Do not expose command output, which may contain secrets.
    return { passed: false, exitCode: Number.isInteger(error?.code) ? error.code : null };
  }
}
