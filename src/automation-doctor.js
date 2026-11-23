import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectLocalAutomation, projectAutomationDirectory, validateAutomationPolicy } from './automation-local.js';
import { listAutomationJobs } from './automation-queue.js';
import { validateProjectConfig } from './project-init.js';
import { readLimitedFile } from './read-limited.js';

/** Diagnose local configuration and editable records without network or process execution. */
export async function diagnoseLocalAutomation({ target, env = process.env }) {
  const targetRoot = await realpath(target);
  if (!(await lstat(targetRoot)).isDirectory()) throw new Error('Invalid target project');
  const state = await inspectLocalAutomation({ target: targetRoot, env });
  const checks = [];
  const policyStatus = state.configured ? 'present' : 'missing-or-invalid';
  checks.push({ name: 'automation-policy', status: policyStatus });
  let policy = null, providers = [];
  if (state.configured) {
    const directory = await projectAutomationDirectory(target, false);
    policy = validateAutomationPolicy(JSON.parse((await readLimitedFile(join(directory, 'policy.json'), 262144)).toString('utf8')));
    providers = state.policy.providers;
    for (const provider of providers) {
      const variable = provider === 'github' ? 'GITHUB_WEBHOOK_SECRET' : provider === 'gitlab' ? 'GITLAB_WEBHOOK_SIGNING_TOKEN' : 'BITBUCKET_WEBHOOK_SECRET';
      checks.push({ name: `${provider}-webhook-secret`, status: typeof env[variable] === 'string' && !!env[variable].trim() ? 'present' : 'missing', variable });
    }
    const claimStatus = state.claims.status;
    checks.push({ name: 'claim-store', status: claimStatus, count: state.claims.count, invalid: state.claims.invalid });
    try {
      const queue = await listAutomationJobs({ target });
      const attention = queue.jobs.filter(item => item.status !== 'queued').length;
      checks.push({ name: 'local-queue', status: queue.complete ? 'readable' : 'needs-inspection', count: queue.jobs.length, attention, claimErrors: queue.claimErrors });
    } catch (error) { checks.push({ name: 'local-queue', status: error?.code === 'ENOENT' ? 'not-available' : 'unavailable' }); }
  }
  let providerConfig;
  try {
    const root = await realpath(target), ai = join(root, '.ai'), dir = await lstat(ai);
    if (!dir.isDirectory() || dir.isSymbolicLink()) throw new Error('Unsafe project configuration');
    const path = join(ai, 'providers.json'), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe provider configuration');
    providerConfig = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(path, 262144)));
    validateProjectConfig(providerConfig);
    checks.push({ name: 'provider-configuration', status: 'present', sections: Object.keys(providerConfig) });
  } catch (error) { checks.push({ name: 'provider-configuration', status: error?.code === 'ENOENT' ? 'missing' : 'invalid-or-unreadable' }); }
  if (policy && providerConfig?.scm) {
    const scm = providerConfig.scm;
    if (scm.provider === 'github') checks.push({ name: 'scm-policy-match', status: policy.allowedRepositories?.some(value => value.toLowerCase() === `${scm.owner}/${scm.repository}`.toLowerCase()) ? 'matched' : 'not-allowlisted' });
    else if (scm.provider === 'gitlab') checks.push({ name: 'scm-policy-match', status: policy.gitlab?.allowedProjects.some(value => value.toLowerCase() === scm.project.toLowerCase()) ? 'matched' : 'not-allowlisted' });
    else if (scm.provider === 'bitbucket-cloud') checks.push({ name: 'scm-policy-match', status: 'unknown', detail: 'Repository UUID requires a separate provider lookup.' });
    else checks.push({ name: 'scm-policy-match', status: 'not-supported' });
  }
  const needsInspection = checks.some(item => ['missing-or-invalid', 'invalid-or-unreadable', 'incomplete', 'unavailable', 'needs-inspection', 'not-allowlisted'].includes(item.status) || (item.name.endsWith('-webhook-secret') && item.status === 'missing'));
  return { checks, needsInspection, scope: 'Local configuration, environment presence and editable records only; no listener status, provider access, secret validity, cloud health, agent execution or readiness was verified. Files may change afterward.' };
}
