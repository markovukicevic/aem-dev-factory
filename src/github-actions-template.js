import { createHash } from 'node:crypto';
import { realpath, writeFile } from 'node:fs/promises';
import { readLimitedFile } from './read-limited.js';
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
function normalize(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !['actors', 'entrypoint', 'nodeVersion'].includes(key)) || !Array.isArray(config.actors) || !config.actors.length || config.actors.length > 50 || config.actors.some(actor => typeof actor !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(actor)) || new Set(config.actors.map(actor => actor.toLowerCase())).size !== config.actors.length || typeof config.entrypoint !== 'string' || config.entrypoint.length > 512 || !/^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:js|mjs|cjs)$/.test(config.entrypoint) || !['22', '24'].includes(config.nodeVersion ?? '22')) throw new TypeError('Invalid GitHub Actions template settings');
  return { actors: [...config.actors], entrypoint: config.entrypoint, nodeVersion: config.nodeVersion ?? '22' };
}
function workflow(config) {
  const actors = JSON.stringify(config.actors);
  return `name: AEM DevFlow comment worker\n\non:\n  issue_comment:\n    types: [created]\n\npermissions:\n  contents: read\n  issues: read\n  pull-requests: read\n\nconcurrency:\n  group: aem-devflow-\${{ github.repository }}\n  cancel-in-progress: false\n\njobs:\n  comment-worker:\n    if: \${{ contains(fromJSON('${actors}'), github.actor) && (github.event.comment.body == '@aem-dev' || startsWith(github.event.comment.body, '@aem-dev ')) }}\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    steps:\n      - uses: actions/checkout@v7\n        with:\n          ref: \${{ github.event.repository.default_branch }}\n          persist-credentials: false\n      - uses: actions/setup-node@v7\n        with:\n          node-version: '${config.nodeVersion}'\n          package-manager-cache: false\n      - run: npm ci --ignore-scripts\n      - run: node ./${config.entrypoint}\n        env:\n          GITHUB_TOKEN: \${{ github.token }}\n          AEM_DEVFLOW_EVENT_PROVIDER: github\n          AEM_DEVFLOW_EVENT_REPOSITORY: \${{ github.repository }}\n          AEM_DEVFLOW_EVENT_KIND: \${{ github.event.issue.pull_request && 'pull-request-comment' || 'issue-comment' }}\n          AEM_DEVFLOW_EVENT_NUMBER: \${{ github.event.issue.number }}\n          AEM_DEVFLOW_EVENT_COMMENT_ID: \${{ github.event.comment.id }}\n`;
}
/** Produce a reviewable workflow, without modifying a repository or contacting GitHub. */
export async function planGitHubActionsTemplate({ configPath }) {
  const path = await realpath(configPath), bytes = await readLimitedFile(path, 262144), config = normalize(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))), text = workflow(config), sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  return { config, workflow: text, sourceSha256, digest: hash(JSON.stringify({ path, sourceSha256, config, text })), scope: 'Local template only. Entrypoint behavior, actor identity, package dependencies, GitHub permissions and live workflow execution were not verified.' };
}
/** Save the reviewed template as a new file without configuring GitHub. */
export async function saveGitHubActionsTemplate({ configPath, expectedDigest, outputPath }) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest) || typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Invalid workflow save request');
  const first = await planGitHubActionsTemplate({ configPath });
  if (first.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  const final = await planGitHubActionsTemplate({ configPath });
  if (final.digest !== expectedDigest) return { saved: false, reason: 'preview-changed' };
  await writeFile(outputPath, final.workflow, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return { saved: true, path: outputPath, scope: 'New local workflow file only. It is not enabled until placed on the default branch; inspect code, actions and permissions before use.' };
}
