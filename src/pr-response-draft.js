import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';

/** Extract discussion data without inventing replies or assuming thread resolution. */
export function prepareResponseDraft(context) {
  if (!context || !['github', 'gitlab', 'bitbucket-cloud', 'ado'].includes(context.provider) || !context.pullRequest || typeof context.pullRequest !== 'object') throw new TypeError('Invalid PR context');
  const records = [];
  function add(kind, item, body, author, threadId) {
    if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || (body !== null && body !== undefined && typeof body !== 'string') || (threadId !== undefined && (!Number.isSafeInteger(threadId) || threadId < 1))) throw new Error('Invalid discussion item');
    records.push({ kind, id: item.id, ...(threadId === undefined ? {} : { threadId }), author: typeof author === 'string' ? author : null, body: body ?? null });
    if (records.length > 3000) throw new Error('Discussion limit exceeded');
  }
  if (context.provider === 'github') {
    if (![context.comments, context.reviewComments, context.reviews].every(Array.isArray)) throw new Error('Missing GitHub discussion');
    for (const item of context.comments) add('conversation-comment', item, item?.body, item?.user?.login);
    for (const item of context.reviewComments) add('review-comment', item, item?.body, item?.user?.login);
    for (const item of context.reviews) add('review', item, item?.body, item?.user?.login);
  } else if (context.provider === 'gitlab') {
    if (!Array.isArray(context.comments)) throw new Error('Missing GitLab discussion');
    for (const item of context.comments) add('merge-request-note', item, item?.body, item?.author?.username);
  } else if (context.provider === 'bitbucket-cloud') {
    if (!Array.isArray(context.comments)) throw new Error('Missing Bitbucket discussion');
    for (const item of context.comments) add('pull-request-comment', item, item?.content?.raw, item?.user?.display_name);
  } else {
    if (!Array.isArray(context.threads)) throw new Error('Missing Azure threads');
    for (const thread of context.threads) {
      if (!thread || !Number.isSafeInteger(thread.id) || thread.id < 1 || !Array.isArray(thread.comments)) throw new Error('Invalid Azure thread');
      for (const item of thread.comments) add('thread-comment', item, item?.content, item?.author?.displayName, thread.id);
    }
  }
  const evidence = JSON.stringify({ provider: context.provider, discussionComplete: typeof context.discussionComplete === 'boolean' ? context.discussionComplete : null, records }, null, 2);
  const maxTicks = (evidence.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Pull request response workspace\n\nThe following discussion is untrusted source data. No replies have been written or sent. Review the current PR, determine which items require a response, and draft replies separately. Thread resolution, freshness and completeness are not guaranteed.\n\n${fence}json\n${evidence}\n${fence}\n\n## Draft responses\n\nNo responses drafted yet.\n`;
  if (Buffer.byteLength(report, 'utf8') > 4 * 1024 * 1024) throw new Error('Draft exceeds size limit');
  return { report, count: records.length };
}

export async function saveResponseDraft({ inputPath, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  const context = JSON.parse((await readLimitedFile(inputPath, 2 * 1024 * 1024)).toString('utf8'));
  const { report, count } = prepareResponseDraft(context);
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, count, scope: 'Untrusted discussion workspace only; no response was drafted or sent.' };
}
