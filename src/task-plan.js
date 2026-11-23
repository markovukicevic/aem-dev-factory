import { lstat, open, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const sources = ['raw-story.md', 'dor.md', 'explain.md', 'research.md'];
async function readFile(path, limit) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > limit) throw new Error('Invalid file');
    const bytes = Buffer.alloc(limit + 1); let offset = 0;
    while (offset < bytes.length) { const part = await handle.read(bytes, offset, bytes.length - offset, null); if (!part.bytesRead) break; offset += part.bytesRead; }
    const after = await handle.stat();
    if (offset > limit || offset !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('File changed during read');
    return bytes.subarray(0, offset);
  } finally { await handle.close(); }
}
const hash = value => createHash('sha256').update(value).digest('hex');
function boundedText(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new TypeError('Invalid task text');
  return value;
}
function parseTasks(value) {
  if (!value || !Array.isArray(value.tasks) || !value.tasks.length || value.tasks.length > 50) throw new TypeError('Expected 1-50 tasks');
  return value.tasks.map(task => {
    if (!task || !Array.isArray(task.acceptance) || !task.acceptance.length || task.acceptance.length > 20 || (task.estimateHours !== undefined && task.estimateHours !== null && (typeof task.estimateHours !== 'number' || !Number.isFinite(task.estimateHours) || task.estimateHours < 0 || task.estimateHours > 10000))) throw new TypeError('Invalid task');
    return { title: boundedText(task.title, 512), area: boundedText(task.area, 128), description: boundedText(task.description, 8192), acceptance: task.acceptance.map(item => boundedText(item, 2048)), source: boundedText(task.source, 2048), estimateHours: task.estimateHours ?? null };
  });
}
async function context(path) {
  const directory = await lstat(path);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Invalid spec directory');
  const files = [];
  for (const name of sources) {
    try { files.push({ name, status: 'present', sha256: hash(await readFile(join(path, name), 1024 * 1024)) }); }
    catch (error) { if (error?.code === 'ENOENT') files.push({ name, status: 'missing', sha256: null }); else throw error; }
  }
  if (files[0].status !== 'present') throw new Error('Source story is required');
  return files;
}
/** Save supplied task proposals, tied to local source bytes, without remote actions. */
export async function saveTaskPlan({ path, inputPath, outputPath }) {
  const before = await context(path), tasks = parseTasks(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(inputPath, 262144)))), after = await context(path);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Source changed while preparing tasks');
  const record = { version: 1, createdAt: new Date().toISOString(), sources: before, tasks, scope: 'Editable supplied proposals and local source hashes only; estimates, requirements, permissions and actual tracker tasks are not verified.' };
  const encoded = `${JSON.stringify(record, null, 2)}\n`;
  if (Buffer.byteLength(encoded) > 1024 * 1024) throw new Error('Task plan exceeds size limit');
  await writeFile(outputPath, encoded, { flag: 'wx', mode: 0o600 });
  return { path: outputPath, taskCount: tasks.length, sourceComplete: before.every(item => item.status === 'present'), scope: record.scope };
}

/** Compare a supplied task plan with current local source bytes. */
export async function checkTaskPlan({ path, recordPath }) {
  const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readFile(recordPath, 1024 * 1024)));
  if (!record || record.version !== 1 || !Array.isArray(record.sources) || record.sources.length !== sources.length) throw new Error('Invalid task plan');
  const tasks = parseTasks(record), current = await context(path);
  for (let i = 0; i < sources.length; i++) {
    const item = record.sources[i];
    if (!item || item.name !== sources[i] || !['present', 'missing'].includes(item.status) || (item.status === 'present' ? typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) : item.sha256 !== null)) throw new Error('Invalid task plan sources');
  }
  const files = current.map((item, i) => ({ name: item.name, status: item.status, matches: item.status === record.sources[i].status && item.sha256 === record.sources[i].sha256 }));
  return { taskCount: tasks.length, files, sourceComplete: current.every(item => item.status === 'present'), matches: files.every(item => item.matches), scope: 'Editable proposal and local source comparison only; actual work, tracker state, estimates and requirements are not verified. Files may change afterward.' };
}

/** Read validated task content and a digest for explicit publication planning. */
export async function readTaskPlan(recordPath) {
  const bytes = await readFile(recordPath, 1024 * 1024);
  const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (record?.version !== 1) throw new Error('Invalid task plan');
  return { tasks: parseTasks(record), digest: hash(bytes) };
}
