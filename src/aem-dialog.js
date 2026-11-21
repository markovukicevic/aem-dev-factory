import { open } from 'node:fs/promises';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

/** Inspect explicit field attributes in local dialog XML, without expanding DTDs. */
export function parseAemDialog(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new TypeError('Dialog XML is required');
  if (Buffer.byteLength(xml, 'utf8') > 1024 * 1024) throw new Error('Dialog XML exceeds size limit');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw new Error('DTD and entity declarations are not supported');
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid dialog XML');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, processEntities: true });
  const document = parser.parse(xml);
  const fields = [];
  const queue = [{ value: document, path: '' }];
  while (queue.length) {
    const { value, path } = queue.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => queue.push({ value: item, path: `${path}[${index}]` }));
      continue;
    }
    if (typeof value['@_name'] === 'string' && typeof value['@_sling:resourceType'] === 'string') {
      fields.push({
        path,
        name: value['@_name'],
        resourceType: value['@_sling:resourceType'],
        label: value['@_fieldLabel'] ?? null,
        description: value['@_fieldDescription'] ?? null,
        required: value['@_required'] ?? null,
        value: value['@_value'] ?? null,
        defaultValue: value['@_defaultValue'] ?? null,
      });
    }
    for (const [key, child] of Object.entries(value)) {
      if (!key.startsWith('@_') && key !== '#text') queue.push({ value: child, path: `${path}/${key}` });
    }
  }
  fields.sort((a, b) => a.path.localeCompare(b.path));
  return { fields, scope: 'Explicit local XML attributes only; inheritance, authored content and runtime behavior were not checked.' };
}

export async function readAemDialog(path) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('Dialog path is required');
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('Dialog path must be a regular file');
    if (info.size > 1024 * 1024) throw new Error('Dialog XML exceeds size limit');
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > 1024 * 1024) throw new Error('Dialog XML exceeds size limit');
    return parseAemDialog(buffer.subarray(0, offset).toString('utf8'));
  } finally {
    await file.close();
  }
}
