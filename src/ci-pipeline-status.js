/** Read an explicitly selected run without exposing provider variables or claiming readiness. */
export async function readPipelineStatus({ ci, id }) {
  if (!ci || !['gitlab-ci', 'bitbucket-pipelines'].includes(ci.provider) || typeof ci.getPipeline !== 'function') throw new TypeError('Unsupported CI provider');
  const gitlab = ci.provider === 'gitlab-ci';
  if (gitlab ? !Number.isSafeInteger(id) || id < 1 : typeof id !== 'string' || !/^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i.test(id)) throw new TypeError('Invalid pipeline ID');
  const item = await ci.getPipeline(id);
  if (!item || (gitlab ? item.id !== id : typeof item.uuid !== 'string' || item.uuid.toLowerCase() !== id.toLowerCase())) throw new Error('Pipeline identity mismatch');
  const safe = value => typeof value === 'string' && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
  const hash = gitlab ? item.sha : item.target?.commit?.hash;
  return { provider: ci.provider, id, state: safe(gitlab ? item.status : item.state?.name), result: gitlab ? null : safe(item.state?.result?.name), branch: safe(gitlab ? item.ref : item.target?.ref_name), commit: typeof hash === 'string' && /^[a-f0-9]{40,64}$/i.test(hash) ? hash : null, scope: 'One provider-reported run only; required checks, complete review, deployment effects and future state are not verified.' };
}
