import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { githubRepositoryPath } from './github.js';

const execFileAsync = promisify(execFile);

/** Parse only standard GitHub Cloud remotes without embedded credentials. */
export function parseGitHubOrigin(remote) {
  if (typeof remote !== 'string') throw new TypeError('Invalid GitHub origin');
  let path;
  const scp = /^git@github\.com:([^?#]+)$/i.exec(remote);
  if (scp) path = scp[1];
  else {
    let url;
    try { url = new URL(remote); } catch { throw new TypeError('Invalid GitHub origin'); }
    if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname.toLowerCase() !== 'github.com' || url.port || url.password || url.search || url.hash || (url.username && (url.protocol !== 'ssh:' || url.username !== 'git'))) throw new TypeError('Invalid GitHub origin');
    path = url.pathname.replace(/^\//, '');
  }
  const parts = path.replace(/\.git$/i, '').split('/');
  if (parts.length !== 2) throw new TypeError('Invalid GitHub origin');
  githubRepositoryPath(parts[0], parts[1]);
  return { owner: parts[0], repository: parts[1] };
}

export async function readGitHubOrigin(cwd, { run = execFileAsync } = {}) {
  const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', maxBuffer: 8192 });
  return parseGitHubOrigin(stdout.trim());
}
