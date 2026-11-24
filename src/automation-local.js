import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { listWebhookClaims } from './webhook-claims.js';

export function validateAutomationPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).some(key => !['allowedRepositories', 'allowedActors', 'gitlab', 'bitbucket', 'ado'].includes(key))) throw new TypeError('Invalid automation policy');
  const result = {};
  const check = (value, name, pattern) => {
    if (!Array.isArray(value) || !value.length || value.length > 100 || value.some(item => typeof item !== 'string' || item.length > 200 || !pattern.test(item)) || new Set(value.map(item => item.toLowerCase())).size !== value.length) throw new TypeError(`Invalid ${name}`);
    return [...value];
  };
  const uuid = /^\{[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\}$/i;
  if (policy.allowedRepositories !== undefined || policy.allowedActors !== undefined) {
    result.allowedRepositories = check(policy.allowedRepositories, 'GitHub repositories', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
    result.allowedActors = check(policy.allowedActors, 'GitHub actors', /^[A-Za-z0-9-]+$/);
  }
  for (const [name, repoKey, repoPattern, actorPattern] of [['gitlab', 'allowedProjects', /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/, /^[A-Za-z0-9_.-]+$/], ['bitbucket', 'allowedRepositories', uuid, uuid]]) {
    if (policy[name] === undefined) continue;
    const item = policy[name];
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => ![repoKey, 'allowedActors'].includes(key))) throw new TypeError('Invalid provider policy');
    result[name] = { [repoKey]: check(item[repoKey], name, repoPattern), allowedActors: check(item.allowedActors, name, actorPattern) };
  }
  if (policy.ado !== undefined) {
    const item = policy.ado, azureGuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['allowedRepositories', 'allowedAuthors'].includes(key))) throw new TypeError('Invalid Azure policy');
    result.ado = { allowedRepositories: check(item.allowedRepositories, 'Azure repositories', azureGuid), allowedAuthors: check(item.allowedAuthors, 'Azure authors', azureGuid) };
  }
  if (!Object.keys(result).length) throw new TypeError('At least one provider policy is required');
  return result;
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
  return { path, claimsDirectory: join(directory, 'claims'), scope: 'Local provider allowlists only; no listener, agent, CI pipeline, cloud resources or remote configuration was created. Keep the webhook secret in the environment.' };
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
  const secrets = { github: !!env.GITHUB_WEBHOOK_SECRET?.trim(), gitlab: !!env.GITLAB_WEBHOOK_SIGNING_TOKEN?.trim(), bitbucket: !!env.BITBUCKET_WEBHOOK_SECRET?.trim() };
  return { secrets, configured: typeof policy === 'object', policy: typeof policy === 'object' ? { status: 'valid', providers: [...(policy.allowedRepositories ? ['github'] : []), ...(policy.gitlab ? ['gitlab'] : []), ...(policy.bitbucket ? ['bitbucket-cloud'] : []), ...(policy.ado ? ['ado'] : [])] } : { status: policy }, claims, secretPresent: typeof env.GITHUB_WEBHOOK_SECRET === 'string' && !!env.GITHUB_WEBHOOK_SECRET.trim(), scope: 'Local policy and claim metadata only; configured secret validity, active listeners, delivery, cloud health, task execution and readiness were not checked. Claims may change afterward.' };
}
