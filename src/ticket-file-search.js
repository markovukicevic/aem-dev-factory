import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readLimitedFile } from './read-limited.js';
const exec = promisify(execFile);

/** Search explicit literal terms in tracked working files without returning matching lines. */
export async function searchTicketFiles({ cwd, inputPath }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Repository directory required');
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(inputPath, 16384)));
  if (!input || !Array.isArray(input.terms) || !input.terms.length || input.terms.length > 10 || input.terms.some(term => typeof term !== 'string' || term.trim() !== term || term.length < 3 || term.length > 128 || /[\u0000-\u001f\u007f]/.test(term)) || new Set(input.terms).size !== input.terms.length) throw new TypeError('Expected 1-10 distinct literal terms');
  const options = { cwd, encoding: 'buffer', maxBuffer: 2 * 1024 * 1024, timeout: 30000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } };
  const decode = value => new TextDecoder('utf-8', { fatal: true }).decode(value);
  const root = decode((await exec('git', ['rev-parse', '--show-toplevel'], options)).stdout).trim();
  const results = [];
  for (const term of input.terms) {
    let stdout;
    try { ({ stdout } = await exec('git', ['grep', '-l', '-z', '-I', '-F', '-e', term, '--'], { ...options, cwd: root })); }
    catch (error) { if (error?.code === 1) stdout = error.stdout; else throw error; }
    const raw = decode(stdout), paths = raw.split('\0').filter(Boolean);
    if (paths.length > 5000) throw new Error('Search result limit exceeded');
    results.push({ term, paths });
  }
  return { results, scope: 'Literal case-sensitive search in tracked working-tree text files only; binary files, untracked files and external repositories are not searched. Paths are candidates, not proof of impact. Contents may change during or after search.' };
}
