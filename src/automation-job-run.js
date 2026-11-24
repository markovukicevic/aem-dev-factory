import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { readAutomationJob } from './automation-queue.js';
import { readGitState } from './git-state.js';
import { parseGitHubOrigin } from './github-origin.js';
import { parseGitLabOrigin } from './gitlab-origin.js';
import { runTestCommand } from './command-runner.js';
const exec = promisify(execFile);
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function readOrigin(cwd) { return (await exec('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 8192 })).stdout.trim(); }
function commandFields(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command) || Object.keys(command).some(key => !['executable', 'args', 'timeoutMs'].includes(key)) || typeof command.executable !== 'string' || !isAbsolute(command.executable) || command.executable.length > 4096 || /[\u0000-\u001f\u007f]/.test(command.executable) || !Array.isArray(command.args) || command.args.length > 100 || command.args.some(arg => typeof arg !== 'string' || arg.length > 8192 || /[\u0000-\u001f\u007f]/.test(arg)) || command.args.reduce((sum, arg) => sum + Buffer.byteLength(arg, 'utf8'), 0) > 65536 || !Number.isSafeInteger(command.timeoutMs) || command.timeoutMs < 1000 || command.timeoutMs > 600000) throw new TypeError('Invalid local automation command');
  return { executable: command.executable, args: [...command.args], timeoutMs: command.timeoutMs };
}
async function checkedDirectory(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Directory required');
  const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Directory unavailable or unsafe');
  return realpath(path);
}
async function prepare({ target, claimDigest, command, store }, { readJob, inspect, origin }, { existing = false } = {}) {
  if (typeof claimDigest !== 'string' || !/^[a-f0-9]{64}$/.test(claimDigest)) throw new TypeError('Invalid claim digest');
  const normalized = commandFields(command), root = await checkedDirectory(target), stateRoot = await checkedDirectory(store);
  const rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Execution store must be outside the project');
  const job = await readJob({ target: root, digest: claimDigest }), claim = job.claim, provider = claim.provider ?? 'github';
  const remote = await origin(root); let repository;
  if (provider === 'github') { const value = parseGitHubOrigin(remote); repository = `${value.owner}/${value.repository}`; }
  else if (provider === 'gitlab') repository = parseGitLabOrigin(remote).project;
  else throw new Error('Only GitHub and GitLab local origins can be matched to this job');
  if (provider === 'github' ? repository.toLowerCase() !== claim.repository?.toLowerCase() : repository !== claim.repository) throw new Error('Local origin does not match queued event');
  const git = await inspect(root);
  if (!git?.workingTreeClean || typeof git.head !== 'string' || !git.head || !/^[a-f0-9]{40,64}$/i.test(git.commit ?? '')) throw new Error('A clean branch and commit are required');
  const path = join(stateRoot, `${claimDigest}.json`);
  if (!existing) { try { await lstat(path); throw new Error('Execution already exists'); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
  const snapshot = { target: root, store: stateRoot, claim: job, repository, git: { head: git.head, commit: git.commit }, command: normalized };
  return { snapshot, command: normalized, path, digest: hash(JSON.stringify(snapshot)) };
}
async function writeRecord(handle, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); await handle.truncate(0); await handle.write(bytes, 0, bytes.length, 0); await handle.sync();
}
/** Preview or explicitly run one local command for one existing queue record. */
export async function processAutomationJob({ target, claimDigest, command, store, expectedDigest }, { readJob = readAutomationJob, inspect = readGitState, origin = readOrigin, run = runTestCommand } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const dependencies = { readJob, inspect, origin }, input = { target, claimDigest, command, store }, first = await prepare(input, dependencies);
  const preview = { target: first.snapshot.target, store: first.snapshot.store, claimDigest, provider: first.snapshot.claim.claim.provider ?? 'github', kind: first.snapshot.claim.claim.kind, number: first.snapshot.claim.claim.number, repository: first.snapshot.repository, git: first.snapshot.git, executable: first.command.executable, argumentCount: first.command.args.length, timeoutMs: first.command.timeoutMs };
  if (expectedDigest === undefined) return { preview, digest: first.digest, scope: 'Read-only preview. Inspect the complete command file; queue records do not prove event authenticity or authorize execution.' };
  if (first.digest !== expectedDigest) return { started: false, reason: 'preview-changed' };
  const handle = await open(first.path, 'wx', 0o600);
  const record = { version: 1, claimDigest, previewDigest: first.digest, commandDigest: hash(JSON.stringify(first.command)), target: first.snapshot.target, repository: first.snapshot.repository, startingGit: first.snapshot.git, status: 'reserved', startedAt: new Date().toISOString() };
  try {
    await writeRecord(handle, record);
    let final;
    try { final = await prepare(input, dependencies, { existing: true }); } catch { final = null; }
    if (!final || final.digest !== expectedDigest) { record.status = 'blocked'; record.reason = 'preview-changed'; await writeRecord(handle, record); return { started: false, reason: 'preview-changed', executionPath: first.path }; }
    record.status = 'running'; await writeRecord(handle, record);
    let result; try { result = await run({ cwd: first.snapshot.target, ...first.command }); } catch { result = { passed: false, exitCode: null }; }
    record.status = result?.passed === true && result.exitCode === 0 ? 'process-succeeded' : 'process-failed';
    record.exitCode = Number.isSafeInteger(result?.exitCode) ? result.exitCode : null;
    record.finishedAt = new Date().toISOString();
    try { const end = await inspect(first.snapshot.target); record.endingGit = typeof end?.head === 'string' && /^[a-f0-9]{40,64}$/i.test(end.commit ?? '') && typeof end.workingTreeClean === 'boolean' ? { head: end.head, commit: end.commit, workingTreeClean: end.workingTreeClean } : null; } catch { record.endingGit = null; }
    await writeRecord(handle, record);
    return { started: true, status: record.status, exitCode: record.exitCode, executionPath: first.path, endingGit: record.endingGit, scope: 'One explicit local process result. Correctness, external effects, descendant termination and event authenticity are not established.' };
  } finally { await handle.close(); }
}
