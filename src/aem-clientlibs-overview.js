import { dirname, join } from 'node:path';
import { lstat, writeFile } from 'node:fs/promises';
import { inspectAemClientlibs } from './aem-clientlibs.js';
import { inspectAemClientlibFiles } from './aem-clientlib-files.js';

/** Combine bounded local definitions and manifest-path observations. */
export async function inspectAemClientlibsOverview({ path }) {
  const inventory = await inspectAemClientlibs({ path });
  const libraries = [];
  let limited = inventory.libraries.length > 100;
  for (const library of inventory.libraries.slice(0, 100)) {
    let manifests;
    try { manifests = await inspectAemClientlibFiles({ path: dirname(join(path, ...library.path.split('/'))) }); }
    catch { manifests = { status: 'unavailable', manifests: [] }; }
    const entry = { definition: library, manifestInspection: manifests };
    if (Buffer.byteLength(JSON.stringify([...libraries, entry]), 'utf8') > 3 * 1024 * 1024) { limited = true; break; }
    libraries.push(entry);
  }
  return { libraries, discovered: inventory.libraries.length, notInspected: inventory.libraries.length - libraries.length, skipped: inventory.skipped, limited, scope: 'Bounded local XML and manifest observations only. Generated assets, effective dependencies, AEM runtime and rendered behavior are not verified; files may change during inspection.' };
}

/** Save a new private local overview without replacing existing work. */
export async function saveAemClientlibsOverview({ path, outputPath }) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Output path is required');
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const overview = await inspectAemClientlibsOverview({ path });
  const json = JSON.stringify(overview, null, 2);
  const maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const report = `# Local AEM client library overview\n\nUntrusted local source observations follow. Runtime aggregation, deployed assets and rendered behavior were not verified. Files may change after inspection.\n\n${fence}json\n${json}\n${fence}\n`;
  if (Buffer.byteLength(report, 'utf8') > 4 * 1024 * 1024) throw new Error('Client library report exceeds size limit');
  await writeFile(outputPath, report, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, inspected: overview.libraries.length, discovered: overview.discovered, limited: overview.limited, scope: overview.scope };
}
