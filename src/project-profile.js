import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { readLimitedFile } from './read-limited.js';
import { inspectProject } from './project-inspect.js';
import { inspectAemProjectLayout } from './aem-project-layout.js';

async function safeFile(root, path, max) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max) throw new Error('Invalid project file');
  const canonical = await realpath(path), subpath = relative(root, canonical);
  if (!subpath || subpath === '..' || subpath.startsWith('../') || isAbsolute(subpath)) throw new Error('Project file outside root');
  return new TextDecoder('utf-8', { fatal: true }).decode(await readLimitedFile(canonical, max));
}

/** Inspect bounded project signals and script names without running commands or changing settings. */
export async function inspectProjectProfile({ path }) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Project path required');
  const input = await lstat(path); if (!input.isDirectory() || input.isSymbolicLink()) throw new Error('Invalid project directory');
  const root = await realpath(path), [project, layout] = await Promise.all([inspectProject({ cwd: root }), inspectAemProjectLayout({ path: root })]);
  const manifests = [], warnings = [], paths = ['', ...layout.markers.frontendRoots].slice(0, 21);
  for (const directory of [...new Set(paths)]) {
    const file = join(root, directory, 'package.json');
    try {
      const pkg = JSON.parse(await safeFile(root, file, 262144));
      if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg) || (pkg.scripts !== undefined && (!pkg.scripts || typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts)))) throw new Error('Invalid package manifest');
      const names = Object.keys(pkg.scripts ?? {});
      if (names.length > 200 || names.some(name => !name || name.length > 128 || /[\u0000-\u001f\u007f]/.test(name))) throw new Error('Invalid scripts');
      const dependencies = { ...(pkg.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}), ...(pkg.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}) };
      const known = ['aem-clientlib-generator', 'react', 'vue', 'next', '@angular/core', 'typescript'].filter(name => Object.hasOwn(dependencies, name));
      manifests.push({ path: directory ? `${directory}/package.json` : 'package.json', scripts: names.sort(), indicators: known });
    } catch (error) { if (error?.code !== 'ENOENT') warnings.push({ path: directory ? `${directory}/package.json` : 'package.json', reason: 'invalid-or-unreadable' }); }
  }
  if (layout.markers.frontendRoots.length > 20) warnings.push({ path: 'frontend roots', reason: 'manifest-limit' });
  let maven = null;
  try {
    const xml = await safeFile(root, join(root, 'pom.xml'), 1024 * 1024);
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid Maven XML');
    const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml), stack = [parsed], artifactIds = new Set(), groupIds = new Set();
    let nodes = 0;
    while (stack.length) {
      const value = stack.pop(); if (!value || typeof value !== 'object') continue;
      if (++nodes > 50000) throw new Error('Maven XML limit');
      if (typeof value.artifactId === 'string') artifactIds.add(value.artifactId.trim());
      if (typeof value.groupId === 'string') groupIds.add(value.groupId.trim());
      for (const child of Object.values(value)) if (child && typeof child === 'object') stack.push(child);
    }
    maven = { file: 'pom.xml', indicators: [...['uber-jar', 'aem-sdk-api', 'content-package-maven-plugin'].filter(name => artifactIds.has(name)), ...(groupIds.has('com.adobe.cq') ? ['com.adobe.cq'] : [])] };
  } catch (error) { if (error?.code !== 'ENOENT') warnings.push({ path: 'pom.xml', reason: 'invalid-or-unreadable' }); }
  const aem = layout.markers.jcrRoots.length > 0 || !!maven?.indicators.length || manifests.some(item => item.indicators.includes('aem-clientlib-generator'));
  const candidates = [];
  if (aem) candidates.push('aem');
  if (maven) candidates.push('maven');
  if (manifests.length) candidates.push('node');
  const locks = project.markers.filter(item => ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'mvnw'].includes(item.name) && item.type === 'file').map(item => item.name);
  return { root, candidates, manifests, maven, locks, aemLayout: layout.markers, warnings, scanLimited: layout.limited || layout.skipped.length > 0, scope: 'Candidate project signals and script names only; no commands were run, no configuration was written, and project type, build behavior, client discovery and live AEM are not established. Script values are deliberately omitted.' };
}
