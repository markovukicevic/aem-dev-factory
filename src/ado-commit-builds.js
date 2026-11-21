import { branchRef } from './git-ref.js';

/** Find observed builds whose sourceVersion exactly matches a commit on a branch. */
export async function readAzureCommitBuilds({ ci, branch, sha, maxPages = 10 }) {
  if (ci?.provider !== 'ado-pipelines' || typeof ci.listBuilds !== 'function') throw new TypeError('Azure Pipelines provider required');
  branchRef(branch);
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha) || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new TypeError('A full Azure Git commit SHA is required');
  let token;
  let complete = false;
  let unattributed = 0;
  const seen = new Set();
  const builds = [];
  for (let page = 0; page < maxPages; page++) {
    const result = await ci.listBuilds({ branch, top: 100, ...(token ? { continuationToken: token } : {}) });
    if (!result || !Array.isArray(result.values) || result.values.length > 100) throw new Error('Invalid Azure build page');
    for (const build of result.values) {
      if (!build || typeof build.sourceVersion !== 'string' || !/^[a-f0-9]{40}$/i.test(build.sourceVersion)) { unattributed++; continue; }
      if (build.sourceVersion.toLowerCase() === sha.toLowerCase()) builds.push(build);
    }
    const next = result.continuationToken;
    if (next === null || next === undefined || next === '') { complete = true; break; }
    if (typeof next !== 'string' || next.length > 4096 || seen.has(next)) throw new Error('Invalid or repeated Azure build continuation');
    seen.add(next);
    token = next;
  }
  return { branch, sha, builds, paginationComplete: complete, unattributedBuilds: unattributed, scope: 'Project-wide builds filtered by branch and exact source version; repository identity, required checks and branch protection are not verified.' };
}
