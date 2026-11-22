import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectAemComponent } from './aem-doctor.js';

/** Inspect explicit local candidates only; AEM search-path resolution is not simulated. */
export async function inspectLocalSupertype({ componentPath, jcrRoot }) {
  if (typeof jcrRoot !== 'string' || !jcrRoot.trim()) throw new TypeError('JCR root is required');
  const rootInfo = await lstat(jcrRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('JCR root must be a local directory');
  const component = await inspectAemComponent({ path: componentPath });
  if (component.definition.status !== 'present') throw new Error('Component definition could not be inspected');
  const superType = component.definition.superType;
  if (superType === null) return { superType: null, candidates: [], scope: 'No explicit local supertype; inherited or runtime behavior is not checked.' };
  if (typeof superType !== 'string' || !/^\/?[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(superType) || superType.split('/').some(part => part === '.' || part === '..')) throw new Error('Unsupported supertype path');
  const absolute = superType.startsWith('/');
  const parts = superType.replace(/^\//, '').split('/');
  if (absolute && !['apps', 'libs'].includes(parts[0])) throw new Error('Absolute supertype must be under apps or libs');
  const paths = absolute ? [parts] : [['apps', ...parts], ['libs', ...parts]];
  const candidates = [];
  for (const segments of paths) {
    let current = jcrRoot;
    let status = 'directory';
    for (const segment of segments) {
      current = join(current, segment);
      let info;
      try { info = await lstat(current); }
      catch (error) { if (error?.code === 'ENOENT') { status = 'missing'; break; } throw error; }
      if (info.isSymbolicLink()) { status = 'symlink-skipped'; break; }
      if (!info.isDirectory()) { status = 'not-directory'; break; }
    }
    const candidate = { jcrPath: `/${segments.join('/')}`, status };
    if (status === 'directory') {
      const inspected = await inspectAemComponent({ path: current });
      candidate.definition = inspected.definition;
    }
    candidates.push(candidate);
  }
  return { superType, candidates, scope: 'Local candidates under the supplied JCR root only. Relative paths are checked under apps and libs without establishing search order, inheritance, repository completeness or live AEM behavior.' };
}
