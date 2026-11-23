import { createHash } from 'node:crypto';
import { lstat, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectGitLabWebhook } from './gitlab-webhook.js';
import { inspectBitbucketWebhook } from './bitbucket-webhook.js';

/** Record a single verified external webhook in an explicitly selected local store. */
export async function claimExternalWebhook({ provider, body, headers, policy, secret, directory, now = Date.now() }) {
  if (!['gitlab', 'bitbucket-cloud'].includes(provider) || typeof directory !== 'string' || !directory.trim() || !headers || !policy) throw new TypeError('Invalid external webhook claim');
  const result = provider === 'gitlab'
    ? inspectGitLabWebhook({ body, signingToken: secret, id: headers.id, timestamp: headers.timestamp, signature: headers.signature, event: headers.event, allowedProjects: policy.allowedProjects, allowedActors: policy.allowedActors, now })
    : inspectBitbucketWebhook({ body, secret, signature: headers.signature, event: headers.event, allowedRepositories: policy.allowedRepositories, allowedActors: policy.allowedActors });
  if (!result.accepted) return result;
  const hash = content => createHash('sha256').update(content).digest('hex');
  const bodyDigest = hash(body);
  const digest = provider === 'gitlab' ? hash(`gitlab\0${result.id}`) : hash(`bitbucket-cloud\0${bodyDigest}`);
  const deliveryId = provider === 'gitlab' ? result.id : `body-${bodyDigest}`;
  const action = provider === 'gitlab' ? ({ open: 'opened', reopen: 'reopened', update: 'updated', create: 'created' })[result.action] : 'observed';
  const record = { version: 2, provider, digest, bodyDigest, deliveryId, claimedAt: new Date(now).toISOString(), repository: provider === 'gitlab' ? result.project : result.repository, actor: result.actor, kind: provider === 'gitlab' && result.kind === 'merge_request' ? 'pull-request' : result.kind, number: result.number, action, ...(result.commentId ? { commentId: result.commentId } : {}), ...(provider === 'bitbucket-cloud' ? { eventHeader: result.eventHeader } : {}) };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid claim directory');
  let file;
  try { file = await open(join(directory, `${digest}.json`), 'wx', 0o600); }
  catch (error) { if (error?.code === 'EEXIST') return { accepted: false, reason: 'duplicate-claim', digest }; throw error; }
  try { await file.writeFile(`${JSON.stringify(record, null, 2)}\n`); await file.sync(); } finally { await file.close(); }
  return { accepted: true, claimed: true, provider, digest, scope: 'Local claim only; no task ran. GitLab deduplicates signed IDs; Bitbucket suppresses identical bodies and has no signed timestamp. Local records remain editable.' };
}
