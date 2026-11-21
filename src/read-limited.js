import { open } from 'node:fs/promises';

/** Read a bounded regular file, including a check against growth during the read. */
export async function readLimitedFile(path, maxBytes) {
  if (typeof path !== 'string' || !path.trim() || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('Invalid file path or size limit');
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error('File exceeds size limit or is not regular');
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) throw new Error('File exceeds size limit');
    return buffer.subarray(0, offset);
  } finally { await file.close(); }
}
