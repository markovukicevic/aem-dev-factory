import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
import { projectAutomationDirectory, validateAutomationPolicy } from './automation-local.js';
import { inspectGitHubWebhook } from './github-webhook.js';
import { inspectGitLabWebhook } from './gitlab-webhook.js';
import { inspectBitbucketWebhook } from './bitbucket-webhook.js';

export async function loadWorkerPolicy(target, provider) {
  if (!['github', 'gitlab', 'bitbucket-cloud'].includes(provider)) throw new TypeError('Unsupported worker provider');
  const directory = await projectAutomationDirectory(target, false);
  const policy = validateAutomationPolicy(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(join(directory, 'policy.json'), 262144))));
  if (provider === 'github' ? !policy.allowedRepositories || !policy.allowedActors : provider === 'gitlab' ? !policy.gitlab : !policy.bitbucket) throw new Error('Provider automation policy is required');
  return { directory, policy };
}

/** Classify one signed comment, including its author, without creating records. */
export function inspectWorkerDelivery({ provider, body, headers, policy, secret }) {
  if (!['github', 'gitlab', 'bitbucket-cloud'].includes(provider) || !headers || typeof headers !== 'object' || Array.isArray(headers) || !policy) throw new TypeError('Invalid worker event');
  const allowed = provider === 'github' ? ['signature', 'event', 'deliveryId'] : provider === 'gitlab' ? ['id', 'timestamp', 'signature', 'event'] : ['signature', 'event'];
  if (Object.keys(headers).some(key => !allowed.includes(key))) throw new TypeError('Unexpected worker header');
  const bodyDigest = createHash('sha256').update(body).digest('hex');
  let inspected, expected, claimDigest;
  if (provider === 'github') {
    inspected = inspectGitHubWebhook({ body, signature: headers.signature, secret, event: headers.event, deliveryId: headers.deliveryId, allowedRepositories: policy.allowedRepositories, allowedActors: policy.allowedActors });
    if (!inspected.accepted || headers.event !== 'issue_comment' || !['issue-comment', 'pull-request-comment'].includes(inspected.kind)) return { accepted: false, reason: inspected.reason ?? 'unsupported-event' };
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (!Number.isSafeInteger(payload.comment?.id) || payload.comment.id < 1 || typeof payload.comment?.user?.login !== 'string' || payload.comment.user.login.toLowerCase() !== inspected.actor.toLowerCase()) return { accepted: false, reason: 'comment-author-mismatch' };
    claimDigest = bodyDigest;
    expected = { provider, deliveryId: inspected.deliveryId, repository: inspected.repository, actor: inspected.actor, kind: inspected.kind, number: inspected.number, action: inspected.action, commentId: inspected.commentId, commentBodyDigest: inspected.commentBodyDigest };
  } else if (provider === 'gitlab') {
    inspected = inspectGitLabWebhook({ body, signingToken: secret, ...headers, allowedProjects: policy.gitlab?.allowedProjects, allowedActors: policy.gitlab?.allowedActors });
    if (!inspected.accepted || headers.event !== 'Note Hook' || !['issue-comment', 'pull-request-comment'].includes(inspected.kind)) return { accepted: false, reason: inspected.reason ?? 'unsupported-event' };
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (!Number.isSafeInteger(payload.user?.id) || payload.user.id < 1 || payload.object_attributes?.author_id !== payload.user.id) return { accepted: false, reason: 'comment-author-mismatch' };
    claimDigest = createHash('sha256').update(`gitlab\0${inspected.id}`).digest('hex');
    expected = { provider, deliveryId: inspected.id, repository: inspected.project, actor: inspected.actor, kind: inspected.kind, number: inspected.number, action: 'created', commentId: inspected.commentId, commentBodyDigest: inspected.commentBodyDigest, bodyDigest };
  } else {
    inspected = inspectBitbucketWebhook({ body, secret, ...headers, allowedRepositories: policy.bitbucket?.allowedRepositories, allowedActors: policy.bitbucket?.allowedActors });
    if (!inspected.accepted || headers.event !== 'pullrequest:comment_created' || inspected.kind !== 'pull-request-comment') return { accepted: false, reason: inspected.reason ?? 'unsupported-event' };
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    if (typeof payload.comment?.user?.uuid !== 'string' || payload.comment.user.uuid.toLowerCase() !== inspected.actor.toLowerCase()) return { accepted: false, reason: 'comment-author-mismatch' };
    claimDigest = createHash('sha256').update(`bitbucket-cloud\0${bodyDigest}`).digest('hex');
    expected = { provider, deliveryId: `body-${bodyDigest}`, repository: inspected.repository, actor: inspected.actor, kind: inspected.kind, number: inspected.number, action: 'observed', commentId: inspected.commentId, commentBodyDigest: inspected.commentBodyDigest, bodyDigest, eventHeader: inspected.eventHeader };
  }
  return { accepted: true, claimDigest, expected };
}
