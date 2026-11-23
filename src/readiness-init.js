import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { branchRef } from './git-ref.js';
/** Initialize an explicitly supplied readiness command without executing it. */
export async function initializeReadiness({ cwd, input }) {
  if (typeof cwd !== 'string' || !cwd.trim() || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['scm', 'test'].includes(key))) throw new TypeError('Invalid readiness configuration');
  const scm = input.scm ?? {}, test = input.test;
  if (!scm || typeof scm !== 'object' || Array.isArray(scm) || Object.keys(scm).some(key => key !== 'baseBranch') || !test || typeof test !== 'object' || Array.isArray(test) || Object.keys(test).some(key => !['executable', 'args', 'timeoutMs'].includes(key)) || typeof test.executable !== 'string' || !test.executable.trim() || test.executable !== test.executable.trim() || test.executable.length > 4096 || /[\u0000-\u001f\u007f]/.test(test.executable) || !Array.isArray(test.args) || test.args.length > 100 || test.args.some(arg => typeof arg !== 'string' || arg.length > 8192 || /[\u0000-\u001f\u007f]/.test(arg)) || test.args.reduce((sum, value) => sum + Buffer.byteLength(value), 0) > 65536 || (test.timeoutMs !== undefined && (!Number.isSafeInteger(test.timeoutMs) || test.timeoutMs < 1000 || test.timeoutMs > 600000))) throw new TypeError('Invalid readiness fields');
  if (scm.baseBranch !== undefined) branchRef(scm.baseBranch);
  const info = await lstat(cwd); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid project directory');
  const root = await realpath(cwd), directory = join(root, '.ai');
  try { await mkdir(directory, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const ai = await lstat(directory); if (!ai.isDirectory() || ai.isSymbolicLink()) throw new Error('Invalid configuration directory');
  const config = { scm: { ...(scm.baseBranch === undefined ? {} : { baseBranch: scm.baseBranch }) }, test: { executable: test.executable, args: test.args, ...(test.timeoutMs === undefined ? {} : { timeoutMs: test.timeoutMs }) } };
  const path = join(directory, 'readiness.json');
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { path, scope: 'Configuration written without running the command or validating dependencies, branch freshness or test behavior.' };
}
