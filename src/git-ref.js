/** Validate a Git branch name and return its full reference. */
export function branchRef(value) {
  if (typeof value !== 'string' || !value || value.startsWith('-') || value.startsWith('/') || value.endsWith('/') || value.endsWith('.') || value.includes('..') || value.includes('//') || value.includes('@{') || /[\x00-\x20\x7f~^:?*\[\\]/.test(value) || value.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) throw new TypeError('Invalid branch name');
  return `refs/heads/${value}`;
}
