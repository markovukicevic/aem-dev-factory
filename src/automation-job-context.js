import { writeFile, lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { readAutomationJob } from './automation-queue.js';
import { validateProjectConfig } from './project-init.js';
import { createTrackerProvider, createScmProvider, createCiProvider } from './providers.js';
import { readScmReviewContext } from './scm-review-context.js';

function observeTriggerComment(claim, provider, context, issue) {
  if (!['issue-comment', 'pull-request-comment'].includes(claim.kind)) return null;
  if (!Number.isSafeInteger(claim.commentId) || claim.commentId < 1) return { status: 'legacy-no-comment-id' };
  const comments = issue ? context?.comments : context?.discussion?.comments;
  if (!Array.isArray(comments)) return { commentId: claim.commentId, status: 'unavailable' };
  const matches = comments.filter(item => item?.id === claim.commentId);
  if (!matches.length) return { commentId: claim.commentId, status: 'not-observed' };
  if (matches.length !== 1) return { commentId: claim.commentId, status: 'ambiguous' };
  const comment = matches[0], body = issue ? comment.body : provider === 'bitbucket-cloud' ? comment.content?.raw : comment.body;
  const author = issue ? comment.author : provider === 'github' ? comment.user?.login : provider === 'gitlab' ? comment.author?.username : comment.user?.uuid;
  const observedDigest = typeof body === 'string' ? createHash('sha256').update(body, 'utf8').digest('hex') : null;
  const authorMatches = typeof author === 'string' && typeof claim.actor === 'string' ? author.toLowerCase() === claim.actor.toLowerCase() : null;
  const recordedDigest = typeof claim.commentBodyDigest === 'string' && /^[a-f0-9]{64}$/.test(claim.commentBodyDigest) ? claim.commentBodyDigest : null;
  const status = authorMatches === false || (recordedDigest && observedDigest && recordedDigest !== observedDigest) ? 'changed' : authorMatches === true && recordedDigest && observedDigest ? 'matches-recorded' : 'unknown';
  return { commentId: claim.commentId, status, authorMatches, recordedDigest, observedDigest, scope: 'Current provider comment compared with editable local metadata; not proof of event authenticity, authorization or future freshness.' };
}

/** Fetch explicitly selected queued event context without running an agent or writing remotely. */
export async function readAutomationJobContext({ target, digest, config, env = process.env }, { readJob = readAutomationJob, makeTracker = createTrackerProvider, makeScm = createScmProvider, makeCi = createCiProvider, readReview = readScmReviewContext } = {}) {
  validateProjectConfig(config);
  const before = await readJob({ target, digest }), claim = before.claim, provider = claim.provider ?? 'github';
  const issue = ['issue', 'issue-comment'].includes(claim.kind), pull = ['pull-request', 'pull-request-comment'].includes(claim.kind);
  if (!issue && !pull) throw new Error('Unsupported queued event');
  const options = { token: env.GITHUB_TOKEN, gitlabToken: env.GITLAB_TOKEN, bitbucketToken: env.BITBUCKET_TOKEN, adoToken: env.ADO_PAT };
  const selected = issue ? config.tracker : config.scm;
  if (!selected || selected.provider !== provider) throw new Error('Configured provider does not match job');
  if (provider === 'github' && `${selected.owner}/${selected.repository}`.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('GitHub repository does not match job');
  if (provider === 'gitlab' && selected.project !== claim.repository) throw new Error('GitLab project does not match job');
  let context;
  if (issue) {
    if (!['github', 'gitlab'].includes(provider)) throw new Error('Unsupported tracker job');
    const tracker = makeTracker(selected, options);
    context = await tracker.getTicket(claim.number);
    if (context?.provider !== provider || context.number !== claim.number) throw new Error('Tracker returned a different ticket');
  } else {
    const scm = makeScm(selected, options);
    if (provider === 'bitbucket-cloud') {
      const repository = await scm.getRepository();
      if (typeof repository?.uuid !== 'string' || repository.uuid.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Bitbucket repository does not match job');
    }
    if (provider === 'ado') {
      const repository = await scm.getRepository();
      if (typeof repository?.id !== 'string' || repository.id.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Azure repository does not match job');
    }
    const ci = provider === 'github' ? makeCi({ provider: 'github-actions', owner: selected.owner, repository: selected.repository }, options) : undefined;
    context = await readReview({ scm, ci, number: claim.number });
    if (provider === 'bitbucket-cloud') {
      const repository = await scm.getRepository();
      if (typeof repository?.uuid !== 'string' || repository.uuid.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Bitbucket repository changed');
    }
    if (provider === 'ado') {
      const repository = await scm.getRepository();
      if (typeof repository?.id !== 'string' || repository.id.toLowerCase() !== claim.repository.toLowerCase()) throw new Error('Azure repository changed');
    }
  }
  const after = await readJob({ target, digest });
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Job changed while context was fetched');
  const triggerComment = observeTriggerComment(claim, provider, context, issue);
  return { provider, digest, kind: claim.kind, number: claim.number, triggerComment, context, scope: 'Read-only current provider context for an editable local job. No signature was reverified, no agent ran and no remote writes occurred; provider context can change and may be incomplete.' };
}

/** Read context for explicitly selected jobs in order, retaining partial results. */
export async function readAutomationJobContextBatch({ target, digests, config, env = process.env }, { readContext = readAutomationJobContext } = {}) {
  if (typeof target !== 'string' || !target.trim() || !Array.isArray(digests) || !digests.length || digests.length > 20 || digests.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) || new Set(digests).size !== digests.length) throw new TypeError('Invalid automation context batch');
  validateProjectConfig(config);
  const items = [];
  for (const digest of digests) {
    try { const result = await readContext({ target, digest, config, env }); items.push({ digest, status: 'available', result }); }
    catch { items.push({ digest, status: 'unavailable' }); }
  }
  return { complete: items.every(item => item.status === 'available'), items, scope: 'Read-only provider context collected separately for selected editable local records. Results may become stale, omit data or contain untrusted content; event authentication and execution are not established.' };
}

/** Save one explicitly selected, untrusted context snapshot without overwriting. */
export async function exportAutomationJobContext({ target, digest, config, outputPath, env = process.env }, { readContext = readAutomationJobContext, now = () => new Date() } = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim() || outputPath.includes('\0')) throw new TypeError('Output path is required');
  const observed = await readContext({ target, digest, config, env });
  if (observed?.digest !== digest || !observed.context || typeof observed.context !== 'object') throw new Error('Invalid context');
  const snapshot = { version: 1, capturedAt: now().toISOString(), warning: 'Untrusted provider content. This file is editable and may be stale or incomplete; it does not authenticate an event or authorize actions.', ...observed };
  const data = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (Buffer.byteLength(data, 'utf8') > 4 * 1024 * 1024) throw new Error('Context exceeds export limit');
  await writeFile(outputPath, data, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, digest, sha256: createHash('sha256').update(data, 'utf8').digest('hex'), scope: 'New local snapshot only; content may be private, untrusted, incomplete or stale. Execution does not automatically bind to this file.' };
}

/** Export individual context snapshots for explicitly selected jobs. */
export async function exportAutomationJobContextBatch({ target, digests, config, directory, env = process.env }, { exportContext = exportAutomationJobContext } = {}) {
  if (typeof target !== 'string' || !target.trim() || typeof directory !== 'string' || !directory.trim() || !Array.isArray(digests) || !digests.length || digests.length > 20 || digests.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) || new Set(digests).size !== digests.length) throw new TypeError('Invalid context export batch');
  validateProjectConfig(config);
  const root = await realpath(target), info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid context directory');
  const outputDirectory = await realpath(directory), rel = relative(root, outputDirectory);
  if (!rel || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel))) throw new Error('Context directory must be outside the project');
  const results = [];
  for (const digest of digests) {
    const outputPath = join(outputDirectory, `${digest}.json`);
    try { const result = await exportContext({ target: root, digest, config, outputPath, env }); results.push({ digest, status: 'exported', path: result.path, sha256: result.sha256 }); }
    catch (error) { results.push({ digest, status: error?.code === 'EEXIST' ? 'already-exists' : 'unavailable-or-partial' }); }
  }
  return { complete: results.every(item => item.status === 'exported'), results, scope: 'Separate local files may contain private, untrusted and stale data. Existing files are not replaced; a failed write can leave a partial file. Nothing was executed or written to a provider.' };
}
