/** Inspect one Azure build timeline without fetching logs. */
export async function readAzureBuildTimeline({ ci, buildId }) {
  if (ci?.provider !== 'ado-pipelines' || !Number.isSafeInteger(buildId) || buildId < 1 || buildId > 2147483647) throw new TypeError('Invalid Azure build request');
  const valid = build => build?.id === buildId && typeof build.sourceVersion === 'string' && /^[a-f0-9]{40,64}$/i.test(build.sourceVersion);
  const before = await ci.getBuild(buildId); if (!valid(before)) throw new Error('Build source version unavailable');
  const timeline = await ci.getBuildTimeline(buildId);
  if (!Array.isArray(timeline?.records) || timeline.records.length > 5000) throw new Error('Invalid build timeline');
  const seen = new Set(), safe = value => typeof value === 'string' && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
  const records = timeline.records.map(item => {
    if (typeof item?.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(item.id) || seen.has(item.id)) throw new Error('Invalid timeline record');
    seen.add(item.id);
    return { id: item.id, parentId: safe(item.parentId), name: safe(item.name), type: safe(item.type), state: safe(item.state), result: safe(item.result), attempt: Number.isSafeInteger(item.attempt) ? item.attempt : null, logId: Number.isSafeInteger(item.log?.id) && item.log.id > 0 ? item.log.id : null, errors: Number.isSafeInteger(item.errorCount) ? item.errorCount : null, warnings: Number.isSafeInteger(item.warningCount) ? item.warningCount : null };
  });
  const after = await ci.getBuild(buildId);
  if (!valid(after) || after.sourceVersion !== before.sourceVersion) throw new Error('Build changed during inspection');
  return { provider: ci.provider, buildId, sourceVersion: before.sourceVersion, status: safe(after.status), result: safe(after.result), buildStatusChanged: before.status !== after.status || before.result !== after.result || before.lastChangedDate !== after.lastChangedDate, records, scope: 'One build timeline response only. Child timelines, logs, actual checkout, root cause and branch policy are not established.' };
}
