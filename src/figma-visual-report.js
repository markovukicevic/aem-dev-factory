import { createHash } from 'node:crypto';
import { realpath, writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { compareAemScreenshots } from './aem-screenshot.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Save a bounded local pixel observation, without classifying visual correctness. */
export async function saveFigmaVisualReport({ project, referencePath, actualPath, outputPath, threshold = 0 }, { compare = compareAemScreenshots } = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim() || !Number.isSafeInteger(threshold) || threshold < 0 || threshold > 255) throw new TypeError('Invalid visual report request');
  const [reference, actual] = await Promise.all([realpath(referencePath), realpath(actualPath)]);
  if (reference === actual) throw new Error('Reference and actual images must be different files');
  const before = await Promise.all([readLimitedFile(reference, 16 * 1024 * 1024), readLimitedFile(actual, 16 * 1024 * 1024)]), hashes = before.map(hash);
  const comparison = await compare({ project, beforePath: reference, afterPath: actual, threshold });
  const after = await Promise.all([readLimitedFile(reference, 16 * 1024 * 1024), readLimitedFile(actual, 16 * 1024 * 1024)]);
  if (after.some((bytes, index) => hash(bytes) !== hashes[index])) throw new Error('Images changed during comparison');
  if (!comparison || typeof comparison.comparable !== 'boolean') throw new Error('Invalid comparison');
  const record = { reference: { path: reference, sha256: hashes[0] }, actual: { path: actual, sha256: hashes[1] }, threshold, comparison };
  const json = JSON.stringify(record, null, 2), maxTicks = (json.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0), fence = '`'.repeat(Math.max(3, maxTicks + 1));
  const text = `# Figma visual observation\n\nThe named images and their provenance were supplied locally. Pixel differences are not design approval, accessibility verification or proof that these images represent the intended versions. Review crops, scale, fonts and both images.\n\n${fence}json\n${json}\n${fence}\n`;
  await writeFile(outputPath, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, comparable: comparison.comparable, comparison, scope: 'Editable local pixel observation only; source identity, visual correctness, approval and accessibility remain unverified.' };
}
