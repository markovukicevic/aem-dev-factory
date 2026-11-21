/** Read GitLab diff entries without asserting that GitLab returned a complete diff. */
export async function readGitLabMergeRequestDiffs({ scm, number, maxPages = 10 }) {
  if (scm?.provider !== 'gitlab' || !Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('Invalid GitLab MR request');
  const valid = mr => mr?.iid === number && ['base_sha', 'head_sha', 'start_sha'].every(key => /^[a-f0-9]{40,64}$/i.test(mr.diff_refs?.[key] ?? ''));
  const before = await scm.getPullRequest(number);
  if (!valid(before)) throw new Error('GitLab MR diff revisions unavailable');
  let page = 1;
  let paginationComplete = false;
  const files = [];
  const paths = new Set();
  for (let count = 0; count < maxPages; count++) {
    const result = await scm.listMergeRequestDiffs(number, { page, perPage: 100 });
    if (!Array.isArray(result?.values) || result.values.length > 100) throw new Error('Invalid GitLab diff page');
    for (const file of result.values) {
      if (!file || typeof file.old_path !== 'string' || !file.old_path || typeof file.new_path !== 'string' || !file.new_path || paths.has(file.new_path) || (file.diff !== undefined && typeof file.diff !== 'string')) throw new Error('Invalid or repeated GitLab diff entry');
      paths.add(file.new_path);
      files.push(file);
    }
    if (result.nextPage !== null && result.nextPage !== undefined && result.nextPage !== '') {
      if (typeof result.nextPage !== 'string' || !/^[1-9][0-9]*$/.test(result.nextPage) || !Number.isSafeInteger(Number(result.nextPage)) || Number(result.nextPage) <= page) throw new Error('Invalid GitLab next page');
      page = Number(result.nextPage);
    } else if (result.values.length === 100) page++;
    else { paginationComplete = true; break; }
  }
  const after = await scm.getPullRequest(number);
  if (!valid(after) || ['base_sha', 'head_sha', 'start_sha'].some(key => before.diff_refs[key] !== after.diff_refs[key])) throw new Error('GitLab MR changed while diffs were read');
  return { provider: 'gitlab', number, revisions: before.diff_refs, files, paginationComplete, diffComplete: null, limitations: ['GitLab can omit files or patches due to diff limits; pagination does not prove full diff coverage.', 'MR may change after inspection.'] };
}
