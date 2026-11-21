/** Fetch GitHub PR file metadata and any provided patches, checking revision stability. */
export async function readGitHubPullRequestFiles({ scm, number, maxPages = 10 }) {
  if (scm?.provider !== 'github' || !Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 30) throw new TypeError('Invalid GitHub PR files request');
  const before = await scm.getPullRequest(number);
  const valid = pr => pr?.number === number && /^[a-f0-9]{40,64}$/i.test(pr.head?.sha ?? '') && /^[a-f0-9]{40,64}$/i.test(pr.base?.sha ?? '') && Number.isSafeInteger(pr.changed_files) && pr.changed_files >= 0;
  if (!valid(before)) throw new Error('Invalid GitHub pull request metadata');
  const target = Math.min(before.changed_files, maxPages * 100);
  const files = [];
  const seen = new Set();
  for (let page = 1; files.length < target && page <= maxPages; page++) {
    const items = await scm.listPullRequestFiles(number, { page, perPage: 100 });
    if (!Array.isArray(items) || items.length !== Math.min(100, target - files.length)) throw new Error('Incomplete or inconsistent GitHub files page');
    for (const file of items) {
      if (!file || typeof file.filename !== 'string' || !file.filename || seen.has(file.filename) || (file.patch !== undefined && typeof file.patch !== 'string')) throw new Error('Invalid or repeated GitHub PR file');
      seen.add(file.filename);
      files.push(file);
    }
  }
  const after = await scm.getPullRequest(number);
  if (!valid(after) || after.head.sha !== before.head.sha || after.base.sha !== before.base.sha || after.changed_files !== before.changed_files) throw new Error('GitHub PR changed while files were read');
  return { provider: 'github', number, head: before.head.sha, base: before.base.sha, changedFiles: before.changed_files, filesReturned: files.length, fileListComplete: files.length === before.changed_files, files, limitations: ['Patches can be absent or truncated; inspect source and full diff for a complete review.', 'PR may change after inspection.'] };
}
