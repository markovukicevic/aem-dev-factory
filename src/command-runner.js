import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const killGraceMs = 1000;

/** Run explicit arguments without a shell; bound waiting even if a child ignores termination. */
export async function runTestCommand({ cwd, executable, args = [], timeoutMs = 120_000, environment }, { run = execFileAsync } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('cwd is required');
  if (typeof executable !== 'string' || !executable.trim()) throw new TypeError('executable is required');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new TypeError('args must be an array of strings');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147482647) throw new TypeError('timeoutMs is invalid');
  if (environment !== undefined && (!environment || typeof environment !== 'object' || Array.isArray(environment) || Object.entries(environment).some(([key, value]) => !key || key.includes('=') || key.includes('\0') || (typeof value !== 'string' && value !== undefined)))) throw new TypeError('environment is invalid');
  let timer;
  try {
    const startedAt = performance.now();
    const operation = run(executable, args, { cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024, windowsHide: true, ...(environment === undefined ? {} : { env: environment }) });
    const result = Promise.resolve(operation).then(() => performance.now() - startedAt < timeoutMs ? { passed: true, exitCode: 0 } : { passed: false, exitCode: null }, error => ({ passed: false, exitCode: Number.isInteger(error?.code) ? error.code : null }));
    const hardTimeout = new Promise(resolve => {
      timer = setTimeout(() => {
        try {
          const child = operation?.child;
          child?.kill?.('SIGKILL');
          child?.stdin?.destroy?.();
          child?.stdout?.destroy?.();
          child?.stderr?.destroy?.();
          child?.unref?.();
        } catch { /* Process may already be gone. */ }
        resolve({ passed: false, exitCode: null });
      }, timeoutMs + killGraceMs);
    });
    return await Promise.race([result, hardTimeout]);
  } catch {
    return { passed: false, exitCode: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
