import { lstat, writeFile } from 'node:fs/promises';
import { readGitState } from './git-state.js';
import { scanChangedFiles, scanCommitHistory } from './security-scan.js';

/** Record bounded scan observations without claiming a clean security review. */
export async function saveSecurityEvidence({ cwd, base, outputPath }, { readGit = readGitState, scanWorktree = scanChangedFiles, scanHistory = scanCommitHistory } = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const before = await readGit(cwd);
  const worktree = await scanWorktree({ cwd });
  const history = await scanHistory({ cwd, base });
  const after = await readGit(cwd);
  const stable = before.head === after.head && before.commit === after.commit && before.commit === history.head && before.workingTreeClean === after.workingTreeClean;
  const complete = stable && worktree.complete === true && history.complete === true;
  const evidence = { branch: before.head, commit: before.commit, base: history.base, worktree, history, stable, complete, scope: 'Selected pattern scans only; worktree contents can change during scanning, earlier history and other secret types are not covered, and a clean result does not establish security.' };
  const json = JSON.stringify(evidence, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Local security scan evidence\n\nThis record contains file paths and potential finding locations, not detected values. Review findings and scope before sharing.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 2 * 1024 * 1024) throw new Error('Evidence exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, complete, findingCount: worktree.findings.length + history.findings.length, skippedCount: worktree.skipped.length + history.skipped.length, scope: evidence.scope };
}
