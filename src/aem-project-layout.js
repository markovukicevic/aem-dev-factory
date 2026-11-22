import { lstat, mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';
const ignored = new Set(['.git', '.ai', 'node_modules', 'target', 'dist', 'build']);

/** Inspect bounded directory markers without reading configuration values. */
export async function inspectAemProjectLayout({ path, maxEntries = 10000, maxDepth = 20 }) {
  if (typeof path !== 'string' || !path.trim() || !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 50000 || !Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 30) throw new TypeError('Invalid AEM project inspection');
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Project must be a local directory');
  const queue = [{ directory: path, relative: '', depth: 0 }], markers = { jcrRoots: [], componentRoots: [], contentRoots: [], frontendRoots: [], clientlibRoots: [], osgiRoots: [] }, skipped = [];
  let seen = 0, limited = false;
  while (queue.length) {
    const current = queue.pop();
    const entries = (await readdir(current.directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    seen += entries.length;
    if (seen > maxEntries) { limited = true; break; }
    for (const entry of entries) {
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) { skipped.push({ path: relative, reason: 'symlink' }); continue; }
      if (!entry.isDirectory() || ignored.has(entry.name)) continue;
      if (entry.name === 'jcr_root') markers.jcrRoots.push(relative);
      if (entry.name === 'components' && /(?:^|\/)jcr_root\/apps\//.test(`${current.relative}/`)) markers.componentRoots.push(relative);
      if (entry.name === 'content' && /(?:^|\/)jcr_root$/.test(current.relative)) markers.contentRoots.push(relative);
      if (entry.name === 'ui.frontend' || entry.name === 'frontend') markers.frontendRoots.push(relative);
      if (/^clientlibs?(?:[._-].*)?$/i.test(entry.name)) markers.clientlibRoots.push(relative);
      if (/^config(?:\.[A-Za-z0-9_.-]+)?$/.test(entry.name) && /(?:^|\/)osgiconfig(?:\/|$)/.test(current.relative)) markers.osgiRoots.push(relative);
      if (current.depth >= maxDepth) skipped.push({ path: relative, reason: 'depth-limit' });
      else queue.push({ directory: join(current.directory, entry.name), relative, depth: current.depth + 1 });
    }
  }
  for (const values of Object.values(markers)) values.sort();
  skipped.sort((a, b) => a.path.localeCompare(b.path));
  return { markers, skipped, limited, scope: 'Local directory-name candidates only; component identity, JCR mappings, project configuration and live AEM are not established.' };
}

/** Validate and normalize explicitly selected non-secret AEM settings. */
export function parseAemProjectSettings(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !['componentRoots', 'contentRoots', 'contentMappings', 'authorUrl'].includes(key))) throw new TypeError('Invalid AEM configuration');
  const selected = {};
  for (const key of ['componentRoots', 'contentRoots']) {
    const values = config[key] ?? [];
    if (!Array.isArray(values) || values.length > 20 || values.some(value => typeof value !== 'string' || !value || value !== value.trim() || !/^[A-Za-z0-9_./-]+$/.test(value) || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) || new Set(values).size !== values.length) throw new TypeError('Invalid AEM source roots');
    selected[key] = values;
  }
  if (!selected.componentRoots.length && !selected.contentRoots.length) throw new TypeError('At least one source root is required');
  const mappings = config.contentMappings ?? [];
  if (!Array.isArray(mappings) || mappings.length > 20) throw new TypeError('Invalid AEM content mappings');
  const mappedRoots = new Set();
  selected.contentMappings = mappings.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['root', 'jcrBase'].includes(key)) || typeof item.root !== 'string' || !selected.contentRoots.includes(item.root) || mappedRoots.has(item.root) || typeof item.jcrBase !== 'string' || !/^\/content(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(item.jcrBase) || item.jcrBase.split('/').some(part => part === '.' || part === '..')) throw new TypeError('Invalid AEM content mapping');
    mappedRoots.add(item.root);
    return { root: item.root, jcrBase: item.jcrBase };
  });
  if (config.authorUrl !== undefined) {
    if (typeof config.authorUrl !== 'string' || config.authorUrl.length > 1024 || config.authorUrl !== config.authorUrl.trim() || /[\u0000-\u001f\u007f]/.test(config.authorUrl)) throw new TypeError('Invalid AEM author URL');
    let url;
    try { url = new URL(config.authorUrl); } catch { throw new TypeError('Invalid AEM author URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError('Invalid AEM author URL');
    selected.authorUrl = url.href;
  }
  return selected;
}

/** Save explicitly selected non-secret AEM paths without editing existing settings. */
export async function initializeAemProject({ cwd, config }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Project directory is required');
  const selected = parseAemProjectSettings(config);
  const root = await realpath(cwd);
  for (const value of [...selected.componentRoots, ...selected.contentRoots]) {
    let current = root;
    for (const part of value.split('/')) {
      current = join(current, part);
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('AEM source root must be an existing non-symlink directory');
    }
  }
  const ai = join(root, '.ai');
  try { await mkdir(ai); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
  const aiInfo = await lstat(ai);
  if (!aiInfo.isDirectory() || aiInfo.isSymbolicLink()) throw new Error('AEM configuration directory is unsafe');
  const output = join(ai, 'aem.json');
  await writeFile(output, `${JSON.stringify(selected, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: output, componentRoots: selected.componentRoots.length, contentRoots: selected.contentRoots.length, scope: 'Explicit non-secret local settings only; runtime access and project correctness are not verified.' };
}


/** Inspect explicit AEM settings and their local roots without contacting AEM. */
export async function inspectAemProjectSettings({ cwd }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Project directory is required');
  const root = await realpath(cwd), ai = join(root, '.ai'), configPath = join(ai, 'aem.json');
  const aiInfo = await lstat(ai);
  if (!aiInfo.isDirectory() || aiInfo.isSymbolicLink()) throw new Error('AEM settings path is unsafe');
  const configInfo = await lstat(configPath);
  if (!configInfo.isFile() || configInfo.isSymbolicLink()) throw new Error('AEM settings path is unsafe');
  const settings = parseAemProjectSettings(JSON.parse((await readLimitedFile(configPath, 262144)).toString('utf8')));
  const roots = [];
  for (const kind of ['componentRoots', 'contentRoots']) {
    for (const value of settings[kind]) {
      let current = root, status = 'present';
      for (const part of value.split('/')) {
        current = join(current, part);
        let info;
        try { info = await lstat(current); }
        catch (error) { status = error?.code === 'ENOENT' ? 'missing' : 'unreadable'; break; }
        if (info.isSymbolicLink() || !info.isDirectory()) { status = 'unsafe-or-not-directory'; break; }
      }
      roots.push({ kind, path: value, status });
    }
  }
  return { path: configPath, roots, contentMappings: settings.contentMappings, authorConfigured: typeof settings.authorUrl === 'string', scope: 'Configured local paths, user-supplied mappings and author URL presence only; mapping correctness, AEM access and runtime behavior are not verified.' };
}
