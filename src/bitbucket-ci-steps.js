const uuid = value => typeof value === 'string' && /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(value);
/** Inspect a selected Bitbucket pipeline's step metadata without retrieving logs. */
export async function readBitbucketPipelineSteps({ ci, pipelineId }) {
  if (ci?.provider !== 'bitbucket-pipelines' || !uuid(pipelineId)) throw new TypeError('Invalid Bitbucket pipeline');
  const before = await ci.getPipeline(pipelineId);
  if (!uuid(before?.uuid) || before.uuid.toLowerCase() !== pipelineId.toLowerCase()) throw new Error('Pipeline identity mismatch');
  const values = await ci.getPipelineSteps(pipelineId);
  if (!Array.isArray(values) || values.length > 10000) throw new Error('Invalid pipeline steps');
  const seen = new Set(), safe = value => typeof value === 'string' && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
  const steps = values.map(item => {
    if (!uuid(item?.uuid) || seen.has(item.uuid.toLowerCase())) throw new Error('Invalid pipeline step');
    seen.add(item.uuid.toLowerCase());
    return { id: item.uuid, name: safe(item.name), state: safe(item.state?.name), result: safe(item.state?.result?.name), startedAt: safe(item.started_on), completedAt: safe(item.completed_on) };
  });
  const after = await ci.getPipeline(pipelineId);
  if (!uuid(after?.uuid) || after.uuid.toLowerCase() !== pipelineId.toLowerCase() || after.target?.commit?.hash !== before.target?.commit?.hash) throw new Error('Pipeline changed during inspection');
  return { provider: ci.provider, pipelineId, commit: typeof before.target?.commit?.hash === 'string' && /^[a-f0-9]{40,64}$/i.test(before.target.commit.hash) ? before.target.commit.hash : null, state: safe(after.state?.name), result: safe(after.state?.result?.name), pipelineStatusChanged: before.state?.name !== after.state?.name || before.state?.result?.name !== after.state?.result?.name, steps, scope: 'Step metadata for one pipeline only; logs, command output, actual checkout and branch policy are not established.' };
}
