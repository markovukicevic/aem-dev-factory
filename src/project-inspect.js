import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { readLimitedFile } from './read-limited.js';

const files = ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'pom.xml', 'mvnw', 'clientlib.config.js', 'clientlib.config.cjs'];
const directories = ['ui.apps', 'ui.content', 'ui.frontend', 'core', '.ai'];
/** Inspect local project markers only; never run commands or infer credentials. */
export async function inspectProject({ cwd }) {
  if (typeof cwd !== 'string' || !cwd.trim()) throw new TypeError('Project directory is required');
  const root = await realpath(cwd);
  const markers = [];
  for (const name of [...files, ...directories]) {
    let info;
    try { info = await lstat(join(root, name)); } catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    const expected = files.includes(name) ? 'file' : 'directory';
    const valid = !info.isSymbolicLink() && (expected === 'file' ? info.isFile() : info.isDirectory());
    markers.push({ name, type: valid ? expected : 'unsupported' });
  }
  const signals = [];
  const has = name => markers.some(marker => marker.name === name && marker.type !== 'unsupported');
  if (has('pom.xml')) signals.push('Maven project marker');
  if (has('package.json')) {
    try {
      const pkg = JSON.parse((await readLimitedFile(join(root, 'package.json'), 262144)).toString('utf8'));
      const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      if (Object.hasOwn(dependencies, 'aem-clientlib-generator')) signals.push('AEM client library generator dependency');
      for (const name of ['react', 'vue', 'next', '@angular/core']) if (Object.hasOwn(dependencies, name)) signals.push(`${name} dependency`);
      signals.push('Node package manifest');
    } catch { signals.push('Node package manifest unreadable or invalid'); }
  }
  if (has('ui.apps') || has('ui.content') || has('ui.frontend') || has('clientlib.config.js') || has('clientlib.config.cjs')) signals.push('AEM-style project structure marker');
  return { root, markers, signals, scope: 'Local markers only; project type, provider access and runtime behavior are not verified.' };
}
