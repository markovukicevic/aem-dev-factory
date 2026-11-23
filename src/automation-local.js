import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { listWebhookClaims } from './webhook-claims.js';

export function validateAutomationPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).some(key => !['allowedRepositories', 'allowedActors'].includes(key))) throw new TypeError('Invalid automation policy');
  for (const [field, pattern] of [['allowedRepositories', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/], ['allowedActors', /^[A-Za-z0-9-]+$/]]) {
    const values = policy[field];
    if (!Array.isArray(values) || !values.length || values.length > 100 || values.some(value => typeof value !== 'string' || value.length > 200 || !pattern.test(value)) || new Set(values.map(value => value.toLowerCase())).size !== values.length) throw new TypeError('Invalid allowlist');
  }
  return { allowedRepositories: [...policy.allowedRepositories], allowedActors: [...policy.allowedActors] };
}

export async function projectAutomationDirectory(target, create) {
  const root = await realpath(target), rootInfo = await lstat(root);
  if (!rootInfo.isDirectory()) throw new Error('Invalid project');
  let path = root;
  for (const name of ['.ai', 'automation']) {
    path = join(path, name);
    if (create) { try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; } }
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid automation directory');
  }
  return path;
}

/** Configure the existing local GitHub receiver without provisioning or deploying. */
export async function initializeLocalAutomation({ target, config }) {
  const policy = validateAutomationPolicy(config);
  const directory = await projectAutomationDirectory(target, true), path = join(directory, 'policy.json');
  await writeFile(path, `${JSON.stringify(policy, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { path, claimsDirectory: join(directory, 'claims'), scope: 'Local GitHub receiver policy only; no listener, agent, CI pipeline, cloud resources or remote configuration was created. Keep the webhook secret in the environment.' };
}

/** Inspect only local policy and claim records; no network access or mutation. */
export async function inspectLocalAutomation({ target, env = process.env }) {
  let directory;
  try { directory = await projectAutomationDirectory(target, false); }
  catch (error) { if (error?.code === 'ENOENT') return { configured: false, policy: 'missing', claims: 'not-inspected', secretPresent: typeof env.GITHUB_WEBHOOK_SECRET === 'string' && !!env.GITHUB_WEBHOOK_SECRET.trim(), scope: 'Local files only; runtime, delivery, cloud health and task execution were not checked.' }; throw error; }
  let policy;
  try {
    const path = join(directory, 'policy.json'), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid policy file');
    policy = validateAutomationPolicy(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(path, 262144))));
  } catch (error) { policy = error?.code === 'ENOENT' ? 'missing' : 'invalid-or-unreadable'; }
  let claims;
  try {
    const result = await listWebhookClaims({ directory: join(directory, 'claims') });
    const byKind = {};
    for (const claim of result.claims) { const kind = claim.kind ?? 'legacy-unknown'; byKind[kind] = (byKind[kind] ?? 0) + 1; }
    claims = { status: result.complete ? 'readable' : 'incomplete', count: result.claims.length, invalid: result.errors.length, byKind };
  } catch (error) { claims = { status: error?.code === 'ENOENT' ? 'missing' : 'unavailable', count: null, invalid: null, byKind: null }; }
  return { configured: typeof policy === 'object', policy: typeof policy === 'object' ? { status: 'valid', repositories: policy.allowedRepositories.length, actors: policy.allowedActors.length } : { status: policy }, claims, secretPresent: typeof env.GITHUB_WEBHOOK_SECRET === 'string' && !!env.GITHUB_WEBHOOK_SECRET.trim(), scope: 'Local policy and claim metadata only; configured secret validity, active listeners, delivery, cloud health, task execution and readiness were not checked. Claims may change afterward.' };
}
