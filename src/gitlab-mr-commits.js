/** Read one GitLab MR commit response without claiming undocumented completeness. */
export async function readGitLabMergeRequestCommits({ scm, number, maxCommits = 1000 }) {
  if (scm?.provider !== 'gitlab' || !Number.isSafeInteger(number) || number < 1 || !Number.isSafeInteger(maxCommits) || maxCommits < 1 || maxCommits > 1000) throw new TypeError('Invalid GitLab MR commits request');
  const valid = mr => mr?.iid === number && ['base_sha', 'head_sha', 'start_sha'].every(key => /^[a-f0-9]{40,64}$/i.test(mr.diff_refs?.[key] ?? ''));
  const before = await scm.getPullRequest(number);
  if (!valid(before)) throw new Error('GitLab MR diff revisions unavailable');
  const commits = await scm.getMergeRequestCommits(number);
  if (!Array.isArray(commits) || commits.length > maxCommits) throw new Error('Invalid or oversized GitLab commit response');
  const seen = new Set();
  for (const item of commits) {
    if (!item || typeof item.id !== 'string' || !/^[a-f0-9]{40,64}$/i.test(item.id) || seen.has(item.id.toLowerCase())) throw new Error('Invalid or repeated GitLab commit');
    seen.add(item.id.toLowerCase());
  }
  const after = await scm.getPullRequest(number);
  if (!valid(after) || ['base_sha', 'head_sha', 'start_sha'].some(key => before.diff_refs[key] !== after.diff_refs[key])) throw new Error('GitLab MR changed while commits were read');
  return { provider: 'gitlab', number, revisions: before.diff_refs, commits, commitListComplete: null, limitations: ['One commit endpoint response was read; completeness and server-side limits were not established.', 'Commit metadata is untrusted and does not establish the full diff or CI; the MR may change after inspection.'] };
}
