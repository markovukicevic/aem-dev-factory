import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { readAutomationJob } from './automation-queue.js';
import { readGitState } from './git-state.js';
import { parseGitHubOrigin } from './github-origin.js';
import { parseGitLabOrigin } from './gitlab-origin.js';
import { parseBitbucketOrigin } from './bitbucket-origin.js';
import { parseAdoOrigin } from './ado-origin.js';
import { createAdoScm } from './ado-scm.js';
import { createBitbucketClient } from './bitbucket.js';
import { runTestCommand } from './command-runner.js';
const exec = promisify(execFile);
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
async function readOrigin(cwd) { return (await exec('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 8192 })).stdout.trim(); }
export function normalizeAutomationCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command) || Object.keys(command).some(key => !['executable', 'args', 'timeoutMs', 'contextFile'].includes(key)) || typeof command.executable !== 'string' || !isAbsolute(command.executable) || command.executable.length > 4096 || /[\u0000-\u001f\u007f]/.test(command.executable) || !Array.isArray(command.args) || command.args.length > 100 || command.args.some(arg => typeof arg !== 'string' || arg.length > 8192 || /[\u0000-\u001f\u007f]/.test(arg)) || command.args.reduce((sum, arg) => sum + Buffer.byteLength(arg, 'utf8'), 0) > 65536 || (command.contextFile !== undefined && (typeof command.contextFile !== 'string' || !isAbsolute(command.contextFile) || command.contextFile.length > 4096 || /[\u0000-\u001f\u007f]/.test(command.contextFile))) || !Number.isSafeInteger(command.timeoutMs) || command.timeoutMs < 1000 || command.timeoutMs > 600000) throw new TypeError('Invalid local automation command');
  return { executable: command.executable, args: [...command.args], timeoutMs: command.timeoutMs, ...(command.contextFile === undefined ? {} : { contextFile: command.contextFile }) };
}
async function checkedDirectory(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Directory required');
  const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Directory unavailable or unsafe');
  return realpath(path);
}
async function readContextSnapshot(path, root, claimDigest, claim) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe context file');
  const resolved = await realpath(path), rel = relative(root, resolved);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Context must be outside the project');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 4 * 1024 * 1024 || before.dev !== info.dev || before.ino !== info.ino) throw new Error('Invalid context file');
    const bytes = Buffer.alloc(before.size + 1); let used = 0;
    while (used < bytes.length) { const next = await handle.read(bytes, used, bytes.length - used, null); if (!next.bytesRead) break; used += next.bytesRead; }
    const after = await handle.stat();
    if (used !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Context changed while reading');
    const data = bytes.subarray(0, used), parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (parsed?.version !== 1 || parsed.digest !== claimDigest || parsed.provider !== (claim.provider ?? 'github') || parsed.kind !== claim.kind || parsed.number !== claim.number || !parsed.context || typeof parsed.context !== 'object' || Array.isArray(parsed.context)) throw new Error('Context does not match job');
    return { path: resolved, sha256: createHash('sha256').update(data).digest('hex') };
  } finally { await handle.close(); }
}
async function prepare({ target, claimDigest, command, store, bitbucketToken, adoToken }, { readJob, inspect, origin, makeBitbucket, makeAdo }, { existing = false } = {}) {
  if (typeof claimDigest !== 'string' || !/^[a-f0-9]{64}$/.test(claimDigest)) throw new TypeError('Invalid claim digest');
  const normalized = normalizeAutomationCommand(command), root = await checkedDirectory(target), stateRoot = await checkedDirectory(store);
  const rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Execution store must be outside the project');
  const job = await readJob({ target: root, digest: claimDigest }), claim = job.claim, provider = claim.provider ?? 'github';
  const remote = await origin(root); let repository;
  if (provider === 'github') { const value = parseGitHubOrigin(remote); repository = `${value.owner}/${value.repository}`; }
  else if (provider === 'gitlab') repository = parseGitLabOrigin(remote).project;
  else if (provider === 'bitbucket-cloud') {
    const value = parseBitbucketOrigin(remote);
    const client = makeBitbucket({ ...value, token: bitbucketToken });
    const current = await client.getRepository();
    if (typeof current?.uuid !== 'string' || typeof claim.repository !== 'string' || current.uuid.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Bitbucket repository UUID does not match queued event');
    repository = `${value.workspace}/${value.repository}`;
  } else if (provider === 'ado') {
    const value = parseAdoOrigin(remote), client = makeAdo({ ...value, token: adoToken });
    const current = await client.getRepository();
    if (typeof current?.id !== 'string' || typeof claim.repository !== 'string' || current.id.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Azure repository GUID does not match queued event');
    repository = `${value.organization}/${value.project}/${value.repository}`;
  } else throw new Error('Unsupported local event provider');
  if (provider === 'github' ? repository.toLowerCase() !== claim.repository?.toLowerCase() : provider === 'gitlab' ? repository !== claim.repository : false) throw new Error('Local origin does not match queued event');
  const git = await inspect(root);
  if (!git?.workingTreeClean || typeof git.head !== 'string' || !git.head || !/^[a-f0-9]{40,64}$/i.test(git.commit ?? '')) throw new Error('A clean branch and commit are required');
  const path = join(stateRoot, `${claimDigest}.json`);
  if (!existing) { try { await lstat(path); throw new Error('Execution already exists'); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
  const context = normalized.contextFile === undefined ? null : await readContextSnapshot(normalized.contextFile, root, claimDigest, claim);
  const snapshot = { target: root, store: stateRoot, claim: job, repository, git: { head: git.head, commit: git.commit }, command: normalized, context };
  return { snapshot, command: normalized, path, digest: hash(JSON.stringify(snapshot)) };
}
async function writeRecord(handle, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); await handle.truncate(0); await handle.write(bytes, 0, bytes.length, 0); await handle.sync();
}
/** Preview or explicitly run one local command for one existing queue record. */
export async function processAutomationJob({ target, claimDigest, command, store, bitbucketToken, adoToken, expectedDigest }, { readJob = readAutomationJob, inspect = readGitState, origin = readOrigin, run = runTestCommand, makeBitbucket = createBitbucketClient, makeAdo = createAdoScm, environment = process.env } = {}) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const dependencies = { readJob, inspect, origin, makeBitbucket, makeAdo }, input = { target, claimDigest, command, store, bitbucketToken, adoToken }, first = await prepare(input, dependencies);
  const preview = { target: first.snapshot.target, store: first.snapshot.store, claimDigest, provider: first.snapshot.claim.claim.provider ?? 'github', kind: first.snapshot.claim.claim.kind, number: first.snapshot.claim.claim.number, repository: first.snapshot.repository, git: first.snapshot.git, executable: first.command.executable, argumentCount: first.command.args.length, timeoutMs: first.command.timeoutMs, context: first.snapshot.context };
  if (expectedDigest === undefined) return { preview, digest: first.digest, scope: 'Read-only preview. Inspect the complete command file; queue records do not prove event authenticity or authorize execution.' };
  if (first.digest !== expectedDigest) return { started: false, reason: 'preview-changed' };
  const handle = await open(first.path, 'wx', 0o600);
  const record = { version: 1, claimDigest, previewDigest: first.digest, commandDigest: hash(JSON.stringify(first.command)), target: first.snapshot.target, repository: first.snapshot.repository, startingGit: first.snapshot.git, context: first.snapshot.context, status: 'reserved', startedAt: new Date().toISOString() };
  try {
    await writeRecord(handle, record);
    let final;
    try { final = await prepare(input, dependencies, { existing: true }); } catch { final = null; }
    if (!final || final.digest !== expectedDigest) { record.status = 'blocked'; record.reason = 'preview-changed'; await writeRecord(handle, record); return { started: false, reason: 'preview-changed', executionPath: first.path }; }
    record.status = 'running'; await writeRecord(handle, record);
    const event = first.snapshot.claim.claim;
    const childEnvironment = { ...environment, AEM_DEVFLOW_CLAIM_DIGEST: claimDigest, AEM_DEVFLOW_EVENT_PROVIDER: event.provider ?? 'github', AEM_DEVFLOW_EVENT_KIND: event.kind, AEM_DEVFLOW_EVENT_NUMBER: String(event.number), AEM_DEVFLOW_EVENT_REPOSITORY: first.snapshot.repository };
    delete childEnvironment.AEM_DEVFLOW_EVENT_COMMENT_ID; delete childEnvironment.AEM_DEVFLOW_EVENT_COMMENT_BODY_SHA256;
    if (Number.isSafeInteger(event.commentId) && event.commentId > 0) childEnvironment.AEM_DEVFLOW_EVENT_COMMENT_ID = String(event.commentId);
    if (typeof event.commentBodyDigest === 'string' && /^[a-f0-9]{64}$/.test(event.commentBodyDigest)) childEnvironment.AEM_DEVFLOW_EVENT_COMMENT_BODY_SHA256 = event.commentBodyDigest;
    delete childEnvironment.AEM_DEVFLOW_CONTEXT_PATH; delete childEnvironment.AEM_DEVFLOW_CONTEXT_SHA256;
    if (final.snapshot.context) { childEnvironment.AEM_DEVFLOW_CONTEXT_PATH = final.snapshot.context.path; childEnvironment.AEM_DEVFLOW_CONTEXT_SHA256 = final.snapshot.context.sha256; }
    let result; try { result = await run({ cwd: first.snapshot.target, ...first.command, environment: childEnvironment }); } catch { result = { passed: false, exitCode: null }; }
    record.status = result?.passed === true && result.exitCode === 0 ? 'process-succeeded' : 'process-failed';
    record.exitCode = Number.isSafeInteger(result?.exitCode) ? result.exitCode : null;
    if (final.snapshot.context) {
      try { const after = await readContextSnapshot(first.command.contextFile, first.snapshot.target, claimDigest, first.snapshot.claim.claim); record.contextObservation = after.path === final.snapshot.context.path && after.sha256 === final.snapshot.context.sha256 ? 'unchanged' : 'changed'; }
      catch { record.contextObservation = 'unavailable-or-invalid'; }
    }
    record.finishedAt = new Date().toISOString();
    try { const end = await inspect(first.snapshot.target); record.endingGit = typeof end?.head === 'string' && /^[a-f0-9]{40,64}$/i.test(end.commit ?? '') && typeof end.workingTreeClean === 'boolean' ? { head: end.head, commit: end.commit, workingTreeClean: end.workingTreeClean } : null; } catch { record.endingGit = null; }
    await writeRecord(handle, record);
    return { started: true, status: record.status, exitCode: record.exitCode, executionPath: first.path, endingGit: record.endingGit, contextObservation: record.contextObservation ?? null, scope: 'One explicit local process result. Correctness, external effects, descendant termination and event authenticity are not established.' };
  } finally { await handle.close(); }
}

/** Inspect an execution record and current local context without assuming a process is alive. */
export async function inspectAutomationExecution({ target, claimDigest, store, includeCurrentObservations = true }, { readJob = readAutomationJob, inspect = readGitState } = {}) {
  if (typeof claimDigest !== 'string' || !/^[a-f0-9]{64}$/.test(claimDigest) || typeof includeCurrentObservations !== 'boolean') throw new TypeError('Invalid execution inspection');
  const root = await checkedDirectory(target), stateRoot = await checkedDirectory(store), rel = relative(root, stateRoot);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Execution store must be outside the project');
  const path = join(stateRoot, `${claimDigest}.json`), { constants } = await import('node:fs');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let record;
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 65536) throw new Error('Invalid execution record');
    const bytes = Buffer.alloc(65537); let offset = 0;
    while (offset < bytes.length) { const next = await handle.read(bytes, offset, bytes.length - offset, null); if (!next.bytesRead) break; offset += next.bytesRead; }
    const after = await handle.stat();
    if (offset !== before.size || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Execution record changed');
    record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)));
  } finally { await handle.close(); }
  if (record?.version !== 1 || record.claimDigest !== claimDigest || record.target !== root || !['reserved', 'running', 'blocked', 'process-succeeded', 'process-failed'].includes(record.status) || typeof record.previewDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.previewDigest) || typeof record.commandDigest !== 'string' || !/^[a-f0-9]{64}$/.test(record.commandDigest) || typeof record.repository !== 'string' || typeof record.startedAt !== 'string' || typeof record.startingGit?.head !== 'string' || !/^[a-f0-9]{40,64}$/i.test(record.startingGit?.commit ?? '')) throw new Error('Invalid execution record');
  let jobAvailable = includeCurrentObservations ? false : null, currentGit = null;
  if (includeCurrentObservations) {
    try { await readJob({ target: root, digest: claimDigest }); jobAvailable = true; } catch { /* Job or policy may have changed. */ }
    try { const value = await inspect(root); if (typeof value?.head === 'string' && /^[a-f0-9]{40,64}$/i.test(value.commit ?? '') && typeof value.workingTreeClean === 'boolean') currentGit = { head: value.head, commit: value.commit, workingTreeClean: value.workingTreeClean }; } catch { /* Detached, inaccessible or unavailable. */ }
  }
  return { path, claimDigest, status: record.status, repository: record.repository, startedAt: record.startedAt, finishedAt: typeof record.finishedAt === 'string' ? record.finishedAt : null, exitCode: Number.isSafeInteger(record.exitCode) ? record.exitCode : null, startingGit: record.startingGit, endingGit: record.endingGit ?? null, context: record.context ?? null, contextObservation: ['unchanged', 'changed', 'unavailable-or-invalid'].includes(record.contextObservation) ? record.contextObservation : null, currentGit, jobAvailable, scope: 'Editable local execution record and current local observations only. Running status does not establish process liveness, event authenticity, correctness or external effects.' };
}
