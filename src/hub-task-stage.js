import { writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
import { planHubDiscovery } from './hub-discovery-plan.js';
import { normalizeHubTask } from './hub-run.js';

/** Save a proposed local task using only explicit command fields and discovered names. */
export async function stageHubDiscoveredTask({ cwd, sourcePath, commentPath, templatePath, outputPath }) {
  if (typeof templatePath !== 'string' || !templatePath.trim() || typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Template and output are required');
  const templateBytes = await readLimitedFile(templatePath, 262144);
  const template = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(templateBytes));
  if (!template || typeof template !== 'object' || Array.isArray(template) || Object.hasOwn(template, 'repositories')) throw new Error('Invalid task template');
  const discovery = await planHubDiscovery({ cwd, sourcePath, commentPath });
  if (discovery.selectedTier === 'none' || discovery.result?.complete === false || !Array.isArray(discovery.result?.repos) || !discovery.result.repos.length) throw new Error('Discovery is incomplete');
  const task = normalizeHubTask({ cwd, task: { ...template, repositories: discovery.result.repos.map(repo => repo.name) } });
  const currentTemplate = await readLimitedFile(templatePath, 262144);
  if (!currentTemplate.equals(templateBytes)) throw new Error('Task template changed');
  await writeFile(outputPath, `${JSON.stringify(task, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { path: outputPath, selectedTier: discovery.selectedTier, repositories: task.repositories, scope: 'Proposed local task only. Source does not authorize execution; inspect the full task, repository identities and preview before any run.' };
}
