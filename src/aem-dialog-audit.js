import { readAemDialog } from './aem-dialog.js';

/** Report exact-name and missing-label candidates from explicit local XML fields. */
export async function auditAemDialog(path) {
  const { fields } = await readAemDialog(path);
  const byName = new Map();
  const missingLabels = [];
  for (const field of fields) {
    if (!byName.has(field.name)) byName.set(field.name, []);
    byName.get(field.name).push(field.path);
    if (typeof field.label !== 'string' || !field.label.trim()) {
      missingLabels.push({ path: field.path, name: field.name, resourceType: field.resourceType });
    }
  }
  const duplicateNames = [...byName].filter(([, paths]) => paths.length > 1)
    .map(([name, paths]) => ({ name, paths: paths.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  missingLabels.sort((a, b) => a.path.localeCompare(b.path));
  return {
    fieldCount: fields.length, duplicateNames, missingLabels,
    scope: 'Candidates from explicit local XML only, not proven defects or accessibility results. Different multifield scopes and hidden fields may be intentional; inheritance and live behavior were not checked.',
  };
}
