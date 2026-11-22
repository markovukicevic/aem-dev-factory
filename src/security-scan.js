import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { readLimitedFile } from './read-limited.js';
const exec = promisify(execFile);
const patterns = [
  { name: 'private-key-header', regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'github-token-pattern', regex: /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,255}\b/ },
  { name: 'aws-access-key-id-pattern', regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
];
const maxFileBytes = 1024 * 1024;

/** Scan changed index and worktree files for a small set of potential secret patterns. */
export async function scanChangedFiles({ cwd, maxFiles = 500 } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim() || !Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 5000) throw new TypeError('Invalid scan options');
  const options = { cwd, encoding: 'buffer', maxBuffer: 2 * 1024 * 1024, timeout: 30000, windowsHide: true };
  const rootOutput = await exec('git', ['rev-parse', '--show-toplevel'], options);
  const root = await realpath(new TextDecoder('utf-8', { fatal: true }).decode(rootOutput.stdout).trim());
  const rootOptions = { ...options, cwd: root };
  async function paths(args) {
    const result = await exec('git', args, rootOptions);
    const output = new TextDecoder('utf-8', { fatal: true }).decode(result.stdout);
    return output.split('\0').filter(Boolean);
  }
  const [staged, unstaged, untracked] = await Promise.all([
    paths(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', '--diff-filter=ACDMRT', '-z']),
    paths(['diff', '--no-ext-diff', '--no-textconv', '--name-only', '--diff-filter=ACDMRT', '-z']),
    paths(['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  const candidates = [...new Set(staged.map(path => `staged\0${path}`)), ...new Set([...unstaged, ...untracked].map(path => `worktree\0${path}`))];
  const result = await scanCandidates({ root, rootOptions, candidates, maxFiles });
  return { ...result, complete: result.skipped.length === 0, scope: 'Limited pattern scan of changed staged snapshots and working files only. It does not scan history, ignored files, all credential types or guarantee secret absence.' };
}

async function scanCandidates({ root, rootOptions, candidates, maxFiles, head }) {
  if (candidates.length > maxFiles) throw new Error('Changed file limit exceeded');
  let total = 0;
  const findings = [], skipped = [];
  for (const candidate of candidates) {
    const delimiter = candidate.indexOf('\0');
    const source = candidate.slice(0, delimiter), path = candidate.slice(delimiter + 1);
    const full = resolve(root, path), subpath = relative(root, full);
    if (!subpath || subpath === '..' || subpath.startsWith('../') || isAbsolute(subpath)) { skipped.push({ path, source, reason: 'unsafe-path' }); continue; }
    let bytes;
    try {
      if (source === 'staged' || source === 'committed') {
        const object = source === 'staged' ? `:${path}` : `${head}:${path}`;
        const kind = await exec('git', ['cat-file', '-t', object], rootOptions);
        if (kind.stdout.toString('utf8').trim() !== 'blob') throw new Error('Not a Git blob');
        const result = await exec('git', ['show', '--no-ext-diff', '--no-textconv', object], { ...rootOptions, maxBuffer: maxFileBytes });
        bytes = result.stdout;
      } else {
        const info = await lstat(full);
        if (!info.isFile() || info.isSymbolicLink() || await realpath(full) !== full) throw new Error('Not a regular local file');
        bytes = await readLimitedFile(full, maxFileBytes);
      }
      if (!Buffer.isBuffer(bytes) || bytes.length > maxFileBytes || bytes.includes(0)) throw new Error('Unsupported file');
      total += bytes.length;
      if (total > 20 * maxFileBytes) throw new Error('Scan byte limit exceeded');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      for (const [index, line] of text.split('\n').entries()) {
        for (const pattern of patterns) if (pattern.regex.test(line)) findings.push({ path, source, line: index + 1, pattern: pattern.name });
        if (findings.length > 5000) throw new Error('Finding limit exceeded');
      }
    } catch (error) {
      if (error?.message === 'Scan byte limit exceeded' || error?.message === 'Finding limit exceeded') throw error;
      skipped.push({ path, source, reason: 'unreadable-unsupported-or-deleted' });
    }
  }
  return { findings, skipped };
}


/** Scan final committed file versions in the PR range, not intermediate commits. */
export async function scanCommittedChanges({ cwd, base, maxFiles = 500 } = {}) {
  if (typeof cwd !== 'string' || !cwd.trim() || typeof base !== 'string' || !/^[a-f0-9]{40,64}$/i.test(base) || !Number.isSafeInteger(maxFiles) || maxFiles < 1 || maxFiles > 5000) throw new TypeError('A full base commit and valid scan options are required');
  const options = { cwd, encoding: 'buffer', maxBuffer: 2 * 1024 * 1024, timeout: 30000, windowsHide: true };
  const readText = value => new TextDecoder('utf-8', { fatal: true }).decode(value);
  const root = await realpath(readText((await exec('git', ['rev-parse', '--show-toplevel'], options)).stdout).trim());
  const rootOptions = { ...options, cwd: root };
  const resolveCommit = async ref => readText((await exec('git', ['rev-parse', '--verify', `${ref}^{commit}`], rootOptions)).stdout).trim();
  const resolvedBase = await resolveCommit(base);
  if (resolvedBase.toLowerCase() !== base.toLowerCase()) throw new Error('Base must be a full commit SHA');
  const head = await resolveCommit('HEAD');
  if (!/^[a-f0-9]{40,64}$/i.test(head)) throw new Error('Invalid head commit');
  const diff = await exec('git', ['diff', '--no-ext-diff', '--no-textconv', '--name-only', '--diff-filter=ACDMRT', '-z', `${base}...${head}`, '--'], rootOptions);
  const paths = readText(diff.stdout).split('\0').filter(Boolean);
  const candidates = [...new Set(paths.map(path => `committed\0${path}`))];
  const result = await scanCandidates({ root, rootOptions, candidates, maxFiles, head });
  const headChanged = (await resolveCommit('HEAD')) !== head;
  return { ...result, base: resolvedBase, head, headChanged, complete: result.skipped.length === 0 && !headChanged, scope: 'Limited pattern scan of final committed file versions only; intermediate commits, history, ignored files and all credential types are not covered.' };
}
