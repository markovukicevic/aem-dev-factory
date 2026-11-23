import { mkdir, lstat, open, rename, unlink, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { selectHubRepositories } from './hub-repos.js';
import { readGitState } from './git-state.js';
import { runTestCommand } from './command-runner.js';

async function safeDirectory(path) {
  try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid hub state directory');
}

async function saveStatus(directory, status) {
  const path = join(directory, 'status.json');
  const temp = join(directory, `.status-${randomUUID()}.tmp`);
  const file = await open(temp, 'wx', 0o600);
  try { await file.writeFile(`${JSON.stringify(status, null, 2)}\n`, 'utf8'); await file.sync(); }
  catch (error) { await file.close(); await unlink(temp).catch(() => {}); throw error; }
  await file.close();
  try { await rename(temp, path); } catch (error) { await unlink(temp).catch(() => {}); throw error; }
}

/** Validate and inspect explicit targets without launching a process or writing state. */
async function prepareHubTask({ cwd, task }, inspect) {
  if (typeof cwd !== 'string' || !cwd.trim() || !task || typeof task !== 'object' || Array.isArray(task) || Object.keys(task).some(key => !['ticket', 'title', 'repositories', 'executable', 'args', 'timeoutMs', 'concurrency'].includes(key))) throw new TypeError('Invalid hub task');
  if (typeof task.ticket !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(task.ticket) || typeof task.title !== 'string' || !task.title.trim() || task.title.length > 200 || /[\u0000-\u001f]/.test(task.title) || !Array.isArray(task.repositories) || !task.repositories.length || task.repositories.length > 20 || typeof task.executable !== 'string' || !isAbsolute(task.executable) || task.executable.length > 4096 || task.executable.includes('\0') || !Array.isArray(task.args) || task.args.length > 100 || task.args.some(arg => typeof arg !== 'string' || arg.length > 8192 || arg.includes('\0')) || !Number.isSafeInteger(task.timeoutMs) || task.timeoutMs < 1000 || task.timeoutMs > 600000) throw new TypeError('Invalid hub task fields');
  if (task.args.reduce((sum, arg) => sum + Buffer.byteLength(arg, 'utf8'), 0) > 65536) throw new TypeError('Task arguments exceed size limit');
  if (task.concurrency !== undefined && (!Number.isSafeInteger(task.concurrency) || task.concurrency < 1 || task.concurrency > 4)) throw new TypeError('Concurrency must be between 1 and 4');
  task = { ...task, concurrency: task.concurrency ?? 1, repositories: [...task.repositories], args: [...task.args] };
  const selected = await selectHubRepositories({ cwd, names: task.repositories });
  const snapshots = new Map();
  const seen = new Set();
  for (const repo of selected.repos) {
    if (repo.status !== 'available' || repo.gitMarker !== 'present') throw new Error('Selected repository is unavailable');
    const real = await realpath(repo.path);
    if (seen.has(real)) throw new Error('Multiple names refer to the same repository path');
    seen.add(real);
    const git = await inspect(real);
    if (!git?.workingTreeClean || typeof git.head !== 'string' || !/^[a-f0-9]{40,64}$/i.test(git.commit ?? '')) throw new Error('Selected repository must be clean with a branch and commit');
    snapshots.set(repo.name, { path: real, head: git.head, commit: git.commit });
  }
  const root = await realpath(cwd);
  const state = join(root, 'state');
  try {
    const info = await lstat(state);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid hub state directory');
    try { await lstat(join(state, task.ticket)); throw Object.assign(new Error('Hub task state already exists'), { code: 'EEXIST' }); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  return { root, state, snapshots, task };
}

export async function previewHubTask({ cwd, task }, { inspect = readGitState } = {}) {
  const prepared = await prepareHubTask({ cwd, task }, inspect);
  return { ticket: prepared.task.ticket, executable: prepared.task.executable, argumentCount: prepared.task.args.length, concurrency: prepared.task.concurrency, timeoutMs: prepared.task.timeoutMs, repositories: prepared.task.repositories.map(name => ({ name, ...prepared.snapshots.get(name) })), scope: 'Read-only preflight only; command contents, future repository state and external effects are not verified.' };
}

/** Execute an explicit local command in selected clean repositories, with bounded concurrency. */
export async function runHubTask({ cwd, task }, { inspect = readGitState, run = runTestCommand } = {}) {
  const prepared = await prepareHubTask({ cwd, task }, inspect);
  task = prepared.task;
  const { state, snapshots } = prepared;
  await safeDirectory(state);
  const directory = join(state, task.ticket);
  await mkdir(directory, { mode: 0o700 });
  const status = { ticket: task.ticket, title: task.title, type: 'local-command', skill: null, started: new Date().toISOString(), repos: Object.fromEntries(task.repositories.map(name => [name, 'blocked'])), details: Object.fromEntries(task.repositories.map(name => [name, { state: 'not-started' }])) };
  await saveStatus(directory, status);
  let next = 0, stopped = false;
  let saves = Promise.resolve();
  function persist() {
    const snapshot = JSON.parse(JSON.stringify(status));
    saves = saves.then(() => saveStatus(directory, snapshot));
    return saves;
  }
  async function worker() {
    while (!stopped && next < task.repositories.length) {
      const name = task.repositories[next++], snapshot = snapshots.get(name);
      let current;
      try { current = await inspect(snapshot.path); } catch { current = null; }
      if (stopped) return;
      if (!current?.workingTreeClean || current.head !== snapshot.head || current.commit !== snapshot.commit) {
        stopped = true;
        status.details[name] = { state: 'repository-changed-before-run' };
        await persist();
        return;
      }
      status.repos[name] = 'running';
      status.details[name] = { state: 'running', startingCommit: snapshot.commit };
      await persist();
      if (stopped) {
        status.repos[name] = 'blocked';
        status.details[name] = { state: 'not-started' };
        await persist();
        return;
      }
      let result;
      try { result = await run({ cwd: snapshot.path, executable: task.executable, args: task.args, timeoutMs: task.timeoutMs }); } catch { result = { passed: false, exitCode: null }; }
      const passed = result?.passed === true && result.exitCode === 0;
      if (!passed) stopped = true;
      status.repos[name] = passed ? 'done' : 'failed';
      status.details[name] = { state: passed ? 'process-succeeded' : 'process-failed', startingCommit: snapshot.commit, exitCode: Number.isInteger(result?.exitCode) ? result.exitCode : null };
      await persist();
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(task.concurrency, task.repositories.length) }, () => worker().catch(error => { stopped = true; throw error; })));
  if (results.some(result => result.status === 'rejected')) throw new Error('Hub status persistence failed; inspect all selected repositories and state');
  return { complete: !stopped && task.repositories.every(name => status.repos[name] === 'done'), ticket: task.ticket, repos: status.repos, details: status.details, scope: 'Local process results only; work correctness and remote effects are not verified.' };
}
