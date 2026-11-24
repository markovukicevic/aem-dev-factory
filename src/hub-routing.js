import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

const digest = data => createHash('sha256').update(data).digest('hex');
const label = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
async function load(cwd, routes) {
  if (typeof cwd !== 'string' || !cwd.trim() || !Array.isArray(routes) || !routes.length || routes.length > 500) throw new TypeError('Invalid routing request');
  const root = await realpath(cwd), directory = join(root, '.ai'), info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid hub configuration directory');
  const path = join(directory, 'config.yaml'), handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes, file;
  try {
    const before = await handle.stat(); if (!before.isFile() || before.size > 262144) throw new Error('Invalid hub configuration');
    const buffer = Buffer.alloc(before.size + 1); let used = 0;
    while (used < buffer.length) { const next = await handle.read(buffer, used, buffer.length - used, null); if (!next.bytesRead) break; used += next.bytesRead; }
    const after = await handle.stat();
    if (used !== before.size || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Hub configuration changed');
    bytes = buffer.subarray(0, used); file = before;
  } finally { await handle.close(); }
  const doc = parseDocument(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { uniqueKeys: true });
  if (doc.errors.length) throw new Error('Invalid hub YAML');
  const config = doc.toJS({ maxAliasCount: 0 });
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.hasOwn(config, 'repos') || config.hub?.enabled !== true || !Array.isArray(config.hub.repos) || config.hub.repos.length !== routes.length) throw new Error('Hub routing unavailable or already configured');
  const names = config.hub.repos.map(repo => repo?.name);
  if (names.some(name => !label(name)) || new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('Invalid hub registry');
  const byName = new Map();
  for (const route of routes) {
    if (!route || typeof route !== 'object' || Array.isArray(route) || Object.keys(route).some(key => !['name', 'role', 'platform', 'brand'].includes(key)) || !label(route.name) || !['frontend', 'backend', 'fullstack', 'config'].includes(route.role) || !label(route.platform) || (route.brand !== undefined && !label(route.brand)) || byName.has(route.name.toLowerCase())) throw new TypeError('Invalid routing metadata');
    byName.set(route.name.toLowerCase(), { name: route.name, role: route.role, platform: route.platform, ...(route.brand === undefined ? {} : { brand: route.brand }) });
  }
  const ordered = names.map(name => byName.get(name.toLowerCase()));
  if (ordered.some((route, index) => !route || route.name !== names[index])) throw new Error('Routing names must exactly match the hub registry');
  const configDigest = digest(bytes), planDigest = digest(JSON.stringify({ root, configDigest, routes: ordered }));
  return { root, directory, path, doc, file, configDigest, routes: ordered, digest: planDigest };
}

/** Preview or add routing metadata to an existing hub, bound to its current YAML. */
export async function processHubRouting({ cwd, routes, expectedDigest }) {
  if (expectedDigest !== undefined && (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest))) throw new TypeError('Invalid preview digest');
  const first = await load(cwd, routes);
  const preview = { path: first.path, configDigest: first.configDigest, routes: first.routes };
  if (expectedDigest === undefined) return { preview, digest: first.digest, scope: 'Read-only proposal. Repository identity and routing suitability are not verified.' };
  if (first.digest !== expectedDigest) return { applied: false, reason: 'preview-changed' };
  first.doc.set('repos', first.routes);
  const temp = join(first.directory, `.config.routing-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temp, 'wx', first.file.mode & 0o777); await handle.writeFile(first.doc.toString(), 'utf8'); await handle.sync(); await handle.close(); handle = null;
    const latest = await load(cwd, routes);
    if (latest.digest !== expectedDigest || latest.file.ino !== first.file.ino || latest.file.dev !== first.file.dev) return { applied: false, reason: 'preview-changed' };
    await rename(temp, first.path);
    return { applied: true, path: first.path, count: first.routes.length, scope: 'Local configuration updated; concurrent changes after the final check remain possible. Repository identity and routing suitability are not verified.' };
  } finally { if (handle) await handle.close(); try { await unlink(temp); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
}
