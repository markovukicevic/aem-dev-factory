import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readLimitedFile } from './read-limited.js';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
const exec = promisify(execFile);

/** Search explicit literal terms in tracked working files without returning matching lines. */
export async function searchTicketFiles({ cwd, inputPath }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Repository directory required');
  const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(inputPath, 16384)));
  if (!input || !Array.isArray(input.terms) || !input.terms.length || input.terms.length > 10 || input.terms.some(term => typeof term !== 'string' || term.trim() !== term || term.length < 3 || term.length > 128 || /[\u0000-\u001f\u007f]/.test(term)) || new Set(input.terms).size !== input.terms.length) throw new TypeError('Expected 1-10 distinct literal terms');
  if (input.includeUntracked !== undefined && typeof input.includeUntracked !== 'boolean') throw new TypeError('Invalid untracked option');
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
    results.push({ term, paths, untrackedPaths: [] });
  }
  const skipped = [];
  if (input.includeUntracked === true) {
    const canonicalRoot = await realpath(root), inputFile = await realpath(inputPath);
    const raw = decode((await exec('git', ['ls-files', '--others', '--exclude-standard', '-z'], { ...options, cwd: root })).stdout);
    const candidates = raw.split('\0').filter(Boolean);
    if (candidates.length > 500) throw new Error('Untracked file limit exceeded');
    let total = 0;
    for (const path of candidates) {
      const full = resolve(canonicalRoot, path), subpath = relative(canonicalRoot, full);
      if (full === inputFile) continue;
      try {
        if (!subpath || subpath === '..' || subpath.startsWith('../') || isAbsolute(subpath)) throw new Error('Invalid path');
        const info = await lstat(full);
        if (!info.isFile() || info.isSymbolicLink() || await realpath(full) !== full) throw new Error('Invalid file');
        const bytes = await readLimitedFile(full, 1024 * 1024);
        total += bytes.length;
        if (total > 20 * 1024 * 1024) throw new Error('Total size limit exceeded');
        if (bytes.includes(0)) throw new Error('Binary file');
        const value = decode(bytes);
        for (const result of results) if (value.includes(result.term)) result.untrackedPaths.push(path);
      } catch (error) {
        if (error?.message === 'Total size limit exceeded') throw error;
        skipped.push(path);
      }
    }
  }
  return { results, untrackedIncluded: input.includeUntracked === true, skipped, untrackedComplete: input.includeUntracked === true ? skipped.length === 0 : null, scope: 'Literal case-sensitive search in tracked working-tree text and optionally untracked non-ignored UTF-8 files only. Binary, ignored untracked and external files are not searched. Paths are candidates, not proof of impact. Contents may change during or after search.' };
}
