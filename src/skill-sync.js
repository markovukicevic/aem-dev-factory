import { createHash } from 'node:crypto';
import { realpath, lstat } from 'node:fs/promises';
import { processSkillUpgrade } from './skill-upgrade.js';
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
/** Plan or explicitly apply one bundled skill update across selected local projects. */
export async function processSkillSync({ client, name, targets, expectedDigest }, { upgrade = processSkillUpgrade } = {}) {
  if (!['codex', 'claude', 'copilot'].includes(client) || typeof name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || !Array.isArray(targets) || !targets.length || targets.length > 10 || targets.some(path => typeof path !== 'string' || !path.trim()) || (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)))) throw new TypeError('Invalid skill sync request');
  const canonical = [];
  for (const path of targets) { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid project path'); canonical.push(await realpath(path)); }
  if (new Set(canonical).size !== canonical.length) throw new Error('Duplicate project path');
  const projects = [];
  for (const target of canonical) {
    try { const result = await upgrade({ client, name, target }); projects.push({ target, status: 'ready', preview: result.preview }); }
    catch { projects.push({ target, status: 'unavailable' }); }
  }
  const complete = projects.every(item => item.status === 'ready');
  const previewDigest = digest(JSON.stringify({ client, name, projects }));
  if (expectedDigest === undefined) return { client, name, projects, complete, digest: previewDigest, scope: 'Read-only per-project previews. Review customizations and all targets before any explicit update.' };
  if (!complete) return { updated: false, reason: 'preflight-incomplete' };
  if (previewDigest !== expectedDigest) return { updated: false, reason: 'preview-changed' };
  const results = [];
  for (const project of projects) {
    const preview = project.preview;
    if (!preview.added.length && !preview.removed.length && !preview.changed.length) { results.push({ target: project.target, status: 'already-matches' }); continue; }
    try {
      const result = await upgrade({ client, name, target: project.target, expectedDigest: preview.digest });
      results.push({ target: project.target, ...result });
      if (!result.updated) return { updated: false, reason: 'partial-or-failed', results, scope: 'Earlier project changes and backups remain; inspect all results before retrying.' };
    } catch { results.push({ target: project.target, status: 'failed' }); return { updated: false, reason: 'partial-or-failed', results, scope: 'Earlier project changes and backups remain; inspect all results before retrying.' }; }
  }
  return { updated: true, results, scope: 'Each prior skill directory was preserved when changed. Client discovery and behavior are not verified.' };
}
