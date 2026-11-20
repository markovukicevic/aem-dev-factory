import { parse as parseYaml } from 'yaml';
import { parse as parseShell } from 'shell-quote';

/** Split a simple legacy command into an executable and arguments without evaluating a shell. */
export function parseLegacyTestCommand(command) {
  if (typeof command !== 'string' || !command.trim() || /[`\r\n\0]/.test(command)) throw new TypeError('Unsupported legacy test command');
  let quote = null;
  let escaped = false;
  for (const char of command) {
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote === char) { quote = null; continue; }
    if (!quote && (char === '"' || char === "'")) quote = char;
  }
  if (quote || escaped) throw new TypeError('Unsupported legacy test command');
  let parts;
  try {
    parts = parseShell(command, () => { throw new Error('Variables are not supported'); });
  } catch {
    throw new TypeError('Unsupported legacy test command');
  }
  if (!parts.length || parts.some(part => typeof part !== 'string') || !parts[0] || /^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[0])) {
    throw new TypeError('Unsupported legacy test command');
  }
  return { executable: parts[0], args: parts.slice(1) };
}

/** Extract the two supported settings from a legacy AEM DevFlow YAML config. */
export function parseLegacyConfig(source) {
  const config = parseYaml(source, { uniqueKeys: true, maxAliasCount: 0 });
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Legacy configuration must be an object');
  const scm = config.scm;
  if (scm !== undefined && (!scm || typeof scm !== 'object' || Array.isArray(scm))) throw new TypeError('scm must be an object');
  const base = scm?.['base-branch'];
  if (base !== undefined && (typeof base !== 'string' || !base.trim() || /{{.*}}/.test(base))) throw new TypeError('scm.base-branch must be configured');
  const command = config.build?.test;
  if (typeof command !== 'string' || /{{.*}}/.test(command)) throw new TypeError('build.test must be configured');
  return { scm: { baseBranch: base }, test: parseLegacyTestCommand(command) };
}
