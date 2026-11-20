import { readFile } from 'node:fs/promises';

/** Read Max's explicit JSON configuration; no shell syntax or implicit defaults. */
export async function loadReadinessConfig(path, { read = readFile } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Configuration path is required');
  const config = JSON.parse(await read(path, 'utf8'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Configuration must be an object');
  const { scm, test } = config;
  if (scm !== undefined && (!scm || typeof scm !== 'object' || Array.isArray(scm))) throw new TypeError('scm must be an object');
  if (scm?.baseBranch !== undefined && (typeof scm.baseBranch !== 'string' || !scm.baseBranch.trim())) throw new TypeError('scm.baseBranch must be a branch name');
  if (!test || typeof test !== 'object' || Array.isArray(test)) throw new TypeError('test configuration is required');
  if (typeof test.executable !== 'string' || !test.executable.trim()) throw new TypeError('test.executable is required');
  if (!Array.isArray(test.args) || test.args.some(arg => typeof arg !== 'string')) throw new TypeError('test.args must be an array of strings');
  if (test.timeoutMs !== undefined && (!Number.isSafeInteger(test.timeoutMs) || test.timeoutMs <= 0)) throw new TypeError('test.timeoutMs must be a positive integer');
  return { scm: { baseBranch: scm?.baseBranch }, test: { executable: test.executable, args: test.args, ...(test.timeoutMs === undefined ? {} : { timeoutMs: test.timeoutMs }) } };
}
