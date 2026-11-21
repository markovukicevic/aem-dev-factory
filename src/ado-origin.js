import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Parse standard Azure DevOps Services HTTPS or SSH Git remotes. */
export function parseAdoOrigin(remote) {
  if (typeof remote !== 'string') throw new TypeError('Invalid Azure DevOps origin');
  let parts;
  const scp = /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/i.exec(remote);
  if (scp) parts = scp.slice(1);
  else {
    let url;
    try { url = new URL(remote); } catch { throw new TypeError('Invalid Azure DevOps origin'); }
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'dev.azure.com' || url.password || url.port || url.search || url.hash) throw new TypeError('Invalid Azure DevOps origin');
    const path = url.pathname.split('/').slice(1);
    if (path.length !== 4 || path[2] !== '_git') throw new TypeError('Invalid Azure DevOps origin');
    parts = [path[0], path[1], path[3]];
    if (url.username && url.username.toLowerCase() !== parts[0].toLowerCase()) throw new TypeError('Invalid Azure DevOps origin');
  }
  try { parts = parts.map(decodeURIComponent); } catch { throw new TypeError('Invalid Azure DevOps origin'); }
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(parts[0]) || parts.slice(1).some(value => !value.trim() || value !== value.trim() || /[\\/\u0000-\u001f]/.test(value) || ['.', '..'].includes(value))) throw new TypeError('Invalid Azure DevOps origin');
  return { organization: parts[0], project: parts[1], repository: parts[2].replace(/\.git$/i, '') };
}

export async function readAdoOrigin(cwd, { run = execFileAsync } = {}) {
  const { stdout } = await run('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', maxBuffer: 8192 });
  return parseAdoOrigin(stdout.trim());
}
