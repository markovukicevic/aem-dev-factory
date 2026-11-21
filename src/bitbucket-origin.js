import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function parseBitbucketOrigin(remote) {
  if (typeof remote !== 'string') throw new TypeError('Invalid Bitbucket origin');
  let path;
  const scp = /^git@bitbucket\.org:([^?#]+)$/i.exec(remote);
  if (scp) path = scp[1];
  else {
    let url;
    try { url = new URL(remote); } catch { throw new TypeError('Invalid Bitbucket origin'); }
    if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname.toLowerCase() !== 'bitbucket.org' || url.port || url.password || url.search || url.hash || (url.username && (url.protocol !== 'ssh:' || url.username !== 'git'))) throw new TypeError('Invalid Bitbucket origin');
    path = url.pathname.replace(/^\//, '');
  }
  const parts = path.replace(/\.git$/i, '').split('/');
  if (parts.length !== 2 || parts.some(value => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value === '.' || value === '..')) throw new TypeError('Invalid Bitbucket origin');
  return { workspace: parts[0], repository: parts[1] };
}

export async function readBitbucketOrigin(cwd, { run = execFileAsync } = {}) {
  const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', maxBuffer: 8192 });
  return parseBitbucketOrigin(stdout.trim());
}
