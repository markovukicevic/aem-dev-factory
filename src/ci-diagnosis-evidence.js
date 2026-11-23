import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { diagnoseCiRun } from './ci-run-diagnose.js';
const digest = value => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
function sourceIdentity(config) {
  const keys = { 'github-actions': ['owner', 'repository'], 'gitlab-ci': ['project'], 'ado-pipelines': ['organization', 'project'], 'bitbucket-pipelines': ['workspace', 'repository'] }[config?.provider];
  if (!keys || keys.some(key => typeof config[key] !== 'string' || !config[key].trim())) throw new TypeError('Invalid CI identity');
  return { provider: config.provider, ...Object.fromEntries(keys.map(key => [key, config[key]])) };
}
function observation(result) {
  return { provider: result.provider, id: result.id, commit: result.commit, status: result.status, result: result.result, candidates: result.candidates, complete: result.complete, changedDuringInspection: result.changedDuringInspection };
}
/** Save provider-reported CI candidates in a new local, editable evidence record. */
export async function saveCiDiagnosis({ ci, config, id, outputPath }, { diagnose = diagnoseCiRun, now = () => new Date().toISOString() } = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path required');
  const source = sourceIdentity(config); if (ci?.provider !== source.provider) throw new Error('CI provider mismatch');
  const observed = observation(await diagnose({ ci, id }));
  const record = { version: 1, capturedAt: now(), source, observation: observed, digest: digest({ source, observation: observed }), scope: 'Editable observation only. It does not authenticate results or establish job completeness, root cause or branch policy.' };
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { path: outputPath, digest: record.digest, complete: observed.complete, scope: record.scope };
}
/** Compare a saved observation with current reported state without modifying either. */
export async function checkCiDiagnosis({ ci, config, inputPath }, { diagnose = diagnoseCiRun } = {}) {
  const record = JSON.parse((await readLimitedFile(inputPath, 1024 * 1024)).toString('utf8')), source = sourceIdentity(config);
  if (record?.version !== 1 || typeof record.capturedAt !== 'string' || !record.observation || record.observation.provider !== source.provider || ci?.provider !== source.provider || typeof record.digest !== 'string' || !/^[a-f0-9]{64}$/.test(record.digest) || record.digest !== digest({ source: record.source, observation: record.observation }) || JSON.stringify(record.source) !== JSON.stringify(source)) throw new Error('Invalid or mismatched CI evidence');
  const current = observation(await diagnose({ ci, id: record.observation.id }));
  return { matches: digest({ source, observation: current }) === record.digest, recorded: record.observation, current, scope: 'Comparison of editable evidence with a new provider observation. A match does not authenticate evidence or establish completeness, root cause or branch policy.' };
}
