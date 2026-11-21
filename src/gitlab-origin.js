import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function parseGitLabOrigin(remote) {
  if (typeof remote !== 'string') throw new TypeError('Invalid GitLab origin');
  let path;
  const scp = /^git@gitlab\.com:([^?#]+)$/i.exec(remote);
  if (scp) path = scp[1];
  else {
    let url;
    try { url = new URL(remote); } catch { throw new TypeError('Invalid GitLab origin'); }
    if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname.toLowerCase() !== 'gitlab.com' || url.port || url.password || url.search || url.hash || (url.username && (url.protocol !== 'ssh:' || url.username !== 'git'))) throw new TypeError('Invalid GitLab origin');
    path = url.pathname.replace(/^\//, '');
  }
  const parts = path.replace(/\.git$/i, '').split('/');
  if (parts.length < 2 || parts.some(value => !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(value) || value === '.' || value === '..')) throw new TypeError('Invalid GitLab origin');
  return { project: parts.join('/') };
}

export async function readGitLabOrigin(cwd, { run = execFileAsync } = {}) {
  const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', maxBuffer: 8192 });
  return parseGitLabOrigin(stdout.trim());
}
