import { createHash } from 'node:crypto';
import { realpath, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { readLimitedFile } from './read-limited.js';
import { validateProjectConfig } from './project-init.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const value = item => typeof item === 'string' && item.trim() === item && !!item && item.length <= 512 && !/[\u0000-\u001f\u007f{}]/.test(item) ? item : null;
function adoOrganization(input) {
  const text = value(input); if (!text) return null;
  if (/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(text)) return text;
  let url; try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
  if (host === 'dev.azure.com' && parts.length === 1 && /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(parts[0])) return parts[0];
  const match = /^([a-z0-9][a-z0-9-]*)\.visualstudio\.com$/i.exec(host);
  return match && parts.length === 0 ? match[1] : null;
}
function section(provider, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid provider section');
  const required = provider === 'github' || provider === 'github-actions' ? ['owner', 'repository'] : provider === 'gitlab' || provider === 'gitlab-ci' ? ['project'] : provider === 'bitbucket-cloud' || provider === 'bitbucket-pipelines' ? ['workspace', 'repository'] : provider === 'jira' || provider === 'confluence' ? ['baseUrl'] : provider === 'ado-pipelines' ? ['organization', 'project'] : null;
  if (!required) throw new Error('Unsupported provider');
  const fields = Object.fromEntries(required.map(key => [key, value(raw[key])]));
  if (Object.values(fields).some(item => !item)) throw new Error('Required field missing or placeholder');
  return { provider, ...fields };
}
function propose(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Invalid legacy configuration');
  const config = {}, issues = [], derived = [], omitted = [];
  const scm = document.scm;
  if (scm !== undefined) {
    try {
      if (!scm || typeof scm !== 'object' || Array.isArray(scm) || typeof scm.provider !== 'string') throw new Error('Invalid SCM provider');
      if (scm.provider === 'ado') {
        const organization = adoOrganization(scm.organization ?? scm.org), project = value(scm.project), first = value(scm.repository), second = value(scm['repo-id']);
        if (!organization || !project || (!first && !second) || (first && second && first !== second)) throw new Error('Azure SCM identity missing or ambiguous');
        config.scm = { provider: 'ado', organization, project, repository: first ?? second };
      } else config.scm = section(scm.provider, scm);
      validateProjectConfig({ scm: config.scm });
    } catch { delete config.scm; issues.push({ section: 'scm', reason: 'unsupported-or-incomplete' }); }
  } else omitted.push('scm');
  const tracker = document.tracker;
  if (tracker !== undefined) {
    try {
      if (!tracker || typeof tracker !== 'object' || Array.isArray(tracker) || typeof tracker.provider !== 'string') throw new Error('Invalid tracker');
      if (tracker.provider === 'ado') {
        const organization = adoOrganization(tracker.organization ?? tracker.org ?? (config.scm?.provider === 'ado' ? config.scm.organization : null)), project = value(tracker.project ?? (config.scm?.provider === 'ado' ? config.scm.project : null));
        if (!organization || !project) throw new Error('Azure tracker identity missing');
        config.tracker = { provider: 'ado', organization, project };
      } else if (tracker.provider === 'jira') {
        const baseUrl = value(tracker.baseUrl ?? document.jira?.url); if (!baseUrl) throw new Error('Jira URL missing');
        config.tracker = { provider: 'jira', baseUrl };
      } else config.tracker = section(tracker.provider, tracker);
      validateProjectConfig({ tracker: config.tracker });
    } catch { delete config.tracker; issues.push({ section: 'tracker', reason: 'unsupported-or-incomplete' }); }
  } else if (config.scm?.provider === 'ado') {
    config.tracker = { provider: 'ado', organization: config.scm.organization, project: config.scm.project }; derived.push('tracker-from-azure-scm-default');
  } else omitted.push('tracker');
  if (document.ci !== undefined) {
    try { config.ci = section(document.ci?.provider, document.ci); validateProjectConfig({ ci: config.ci }); }
    catch { delete config.ci; issues.push({ section: 'ci', reason: 'unsupported-or-incomplete' }); }
  } else omitted.push('ci');
  const documentation = document.documentation ?? (document.confluence?.url ? { provider: 'confluence', baseUrl: document.confluence.url } : undefined);
  if (documentation !== undefined) {
    try { config.documentation = section(documentation?.provider, documentation); validateProjectConfig({ documentation: config.documentation }); }
    catch { delete config.documentation; issues.push({ section: 'documentation', reason: 'unsupported-or-incomplete' }); }
  } else omitted.push('documentation');
  return { config, issues, derived, omitted, complete: issues.length === 0 && Object.keys(config).length > 0 };
}
/** Preview a narrow non-secret conversion; unrelated legacy fields remain untouched. */
export async function planLegacyProviders({ sourcePath }) {
  const path = await realpath(sourcePath), bytes = await readLimitedFile(path, 262144), document = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { uniqueKeys: true, maxAliasCount: 0 }), result = propose(document);
  const sourceSha256 = digest(bytes), planDigest = digest(JSON.stringify({ path, sourceSha256, ...result }));
  return { path, sourceSha256, ...result, digest: planDigest, scope: 'Proposed non-secret provider settings only. Build, base branch, project keys, credentials and unrelated legacy fields are not imported; identities and live access are unverified.' };
}
/** Save a previously previewed complete conversion without replacing files. */
export async function saveLegacyProviders({ sourcePath, outputPath, expectedDigest }) {
  if (typeof outputPath !== 'string' || !outputPath.trim() || typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new TypeError('Invalid provider import');
  const first = await planLegacyProviders({ sourcePath });
  if (!first.complete) return { saved: false, reason: 'incomplete', issues: first.issues };
  if (first.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  validateProjectConfig(first.config);
  const final = await planLegacyProviders({ sourcePath });
  if (final.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  await writeFile(outputPath, `${JSON.stringify(final.config, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { saved: true, path: outputPath, sections: Object.keys(final.config), derived: final.derived, omitted: final.omitted, scope: 'New provider configuration only; source can change afterward and service identity, access and omitted legacy settings were not verified.' };
}
