import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { readLimitedFile } from './read-limited.js';
const exec = promisify(execFile);

/** Find literal styling convention candidates in bounded Git working files. */
export async function inspectProjectConventions({ path }) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Project path required');
  const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid project directory');
  const opts = { cwd: path, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024, timeout: 30000, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } };
  const decode = data => new TextDecoder('utf-8', { fatal: true }).decode(data);
  const root = await realpath(decode((await exec('git', ['rev-parse', '--show-toplevel'], opts)).stdout).trim());
  if (await realpath(path) !== root) throw new Error('Select the Git repository root');
  const output = decode((await exec('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { ...opts, cwd: root })).stdout);
  const paths = [...new Set(output.split('\0').filter(Boolean))].filter(name => /\.(?:css|scss|sass|less)$/i.test(name) && !/\.min\.css$/i.test(name)).sort();
  const limited = paths.length > 500, scanned = paths.slice(0, 500), skipped = [], tokens = new Map(), sass = new Map();
  let total = 0, mediaFiles = 0;
  const add = (map, name, file) => { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(file); };
  for (const file of scanned) {
    const full = resolve(root, file), subpath = relative(root, full);
    try {
      if (!subpath || subpath === '..' || subpath.startsWith('../') || isAbsolute(subpath)) throw new Error('Unsafe path');
      const stat = await lstat(full);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 262144 || await realpath(full) !== full) throw new Error('Unsupported file');
      const bytes = await readLimitedFile(full, 262144);
      total += bytes.length; if (total > 20 * 1024 * 1024) throw new Error('Byte limit exceeded');
      if (bytes.includes(0)) throw new Error('Binary file');
      const text = decode(bytes).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of text.matchAll(/(^|[;{}\s])(--[A-Za-z_][A-Za-z0-9_-]{0,127})\s*:/gm)) add(tokens, match[2], file);
      for (const match of text.matchAll(/(^|[;{}\s])(\$[A-Za-z_][A-Za-z0-9_-]{0,127})\s*:/gm)) add(sass, match[2], file);
      if (/@media\b/i.test(text)) mediaFiles++;
      if (tokens.size > 5000 || sass.size > 5000) throw new Error('Token limit exceeded');
    } catch (error) {
      if (['Byte limit exceeded', 'Token limit exceeded'].includes(error?.message)) throw error;
      skipped.push(file);
    }
  }
  const summarize = map => [...map].sort(([a], [b]) => a.localeCompare(b)).slice(0, 200).map(([name, files]) => ({ name, paths: [...files].sort().slice(0, 20), pathCount: files.size }));
  return { filesFound: paths.length, filesScanned: scanned.length - skipped.length, skipped, limited: limited || tokens.size > 200 || sass.size > 200 || [...tokens.values(), ...sass.values()].some(files => files.size > 20), cssCustomProperties: summarize(tokens), sassVariables: summarize(sass), mediaQueryFiles: mediaFiles, scope: 'Literal heuristic candidates from tracked and untracked non-ignored CSS-family files only. Strings, nested scopes and generated files can cause false positives; values, live styles, naming conventions and coverage are not verified. Files may change after inspection.' };
}
