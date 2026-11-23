import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
/** Save one Azure build log explicitly referenced by the selected timeline. */
export async function saveAzureBuildLog({ ci, buildId, logId, outputPath }) {
  if (ci?.provider !== 'ado-pipelines' || ![buildId, logId].every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647) || typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Invalid build log request');
  const build = await ci.getBuild(buildId), timeline = await ci.getBuildTimeline(buildId);
  if (build?.id !== buildId || typeof build.sourceVersion !== 'string' || !/^[a-f0-9]{40,64}$/i.test(build.sourceVersion) || !Array.isArray(timeline?.records) || timeline.records.length > 5000 || !timeline.records.some(item => item?.log?.id === logId)) throw new Error('Build log not present in selected timeline');
  const bytes = await ci.getBuildLog(buildId, logId);
  if (!Buffer.isBuffer(bytes) || bytes.length > 5 * 1024 * 1024) throw new Error('Invalid build log');
  const after = await ci.getBuild(buildId);
  if (after?.id !== buildId || after.sourceVersion !== build.sourceVersion) throw new Error('Build changed during log collection');
  await writeFile(outputPath, bytes, { flag: 'wx', mode: 0o600 });
  return { path: outputPath, buildId, logId, sourceVersion: build.sourceVersion, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), status: typeof after.status === 'string' ? after.status : null, statusChanged: build.status !== after.status || build.lastChangedDate !== after.lastChangedDate, scope: 'One selected build log; content may be sensitive or untrusted and incomplete while a build runs. Actual checkout and root cause are not established.' };
}
