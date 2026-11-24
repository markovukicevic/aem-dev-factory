import { request } from 'node:http';

/** Observe a loopback HTTP response, without claiming worker identity or readiness. */
export async function inspectLocalWorker({ port }, { send = request } = {}) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new TypeError('Invalid local worker port');
  const value = await new Promise((resolve, reject) => {
    const req = send({ hostname: '127.0.0.1', port, path: '/health', method: 'GET', timeout: 3000, headers: { Accept: 'application/json' } }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('Worker status unavailable')); return; }
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 4096) { req.destroy(new Error('Worker status too large')); return; } chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => { try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); } catch { reject(new Error('Invalid worker status')); } });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Worker status timeout'))); req.end();
  });
  if (value?.service !== 'aem-dev-flow-max-github-worker' || value.version !== 1 || typeof value.busy !== 'boolean') throw new Error('Unexpected worker status');
  return { port, responding: true, busy: value.busy, scope: 'Unauthenticated loopback response only; service identity, process liveness, queue health and readiness are not established.' };
}
