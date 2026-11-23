import { createRequire } from 'node:module';
import { lstat, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
function loadBrowser(root) {
  const browser = createRequire(join(root, 'package.json'))('playwright');
  if (!browser?.chromium) throw new Error('Project Playwright is unavailable');
  return browser.chromium;
}
function settings(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !['url', 'allowOrigins', 'waitForSelector', 'selector', 'timeoutMs', 'viewport'].includes(key))) throw new TypeError('Invalid screenshot settings');
  const page = new URL(config.url);
  if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password || page.search || page.hash) throw new TypeError('Page URL must not include credentials, query or fragment');
  const origins = config.allowOrigins ?? [];
  if (!Array.isArray(origins) || origins.length > 10) throw new TypeError('Invalid origins');
  const allowedOrigins = [...new Set([page.origin, ...origins.map(value => { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Invalid origin'); return url.origin; })])];
  const timeoutMs = config.timeoutMs ?? 30000, viewport = config.viewport ?? { width: 1280, height: 720 };
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000 || !viewport || Object.keys(viewport).some(key => !['width', 'height'].includes(key)) || !Number.isSafeInteger(viewport.width) || !Number.isSafeInteger(viewport.height) || viewport.width < 320 || viewport.width > 3840 || viewport.height < 240 || viewport.height > 2160) throw new TypeError('Invalid viewport or timeout');
  for (const key of ['waitForSelector', 'selector']) if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key].trim() || config[key].length > 512 || /[\u0000-\u001f\u007f]/.test(config[key]))) throw new TypeError('Invalid selector');
  return { url: page.href, allowedOrigins, timeoutMs, viewport, waitForSelector: config.waitForSelector ?? null, selector: config.selector ?? null };
}
/** Capture an explicit page or element with a target project's Playwright, without overwriting. */
export async function captureAemScreenshot({ project, config, outputPath }, { load = loadBrowser } = {}) {
  if (typeof project !== 'string' || !project.trim() || typeof outputPath !== 'string' || !outputPath.trim() || !outputPath.toLowerCase().endsWith('.png')) throw new TypeError('Project and PNG output path required');
  const info = await lstat(project); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid project directory');
  const root = await realpath(project), input = settings(config);
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const chromium = await load(root), browser = await chromium.launch({ headless: true }); let context;
  try {
    context = await browser.newContext({ viewport: input.viewport, acceptDownloads: false, serviceWorkers: 'block' });
    const page = await context.newPage(); let blockedRequests = 0;
    await context.route('**/*', async route => {
      const request = route.request(); let allowed = false;
      try { const url = new URL(request.url()); allowed = ['http:', 'https:'].includes(url.protocol) && input.allowedOrigins.includes(url.origin) && ['GET', 'HEAD'].includes(request.method()); } catch { /* Block invalid network requests. */ }
      if (allowed) await route.continue(); else { blockedRequests++; await route.abort(); }
    });
    const response = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: input.timeoutMs });
    if (!response?.ok() || !input.allowedOrigins.includes(new URL(page.url()).origin)) throw new Error('Page navigation failed');
    if (input.waitForSelector) await page.waitForSelector(input.waitForSelector, { timeout: input.timeoutMs });
    const target = input.selector ? page.locator(input.selector) : page;
    if (input.selector && await target.count() !== 1) throw new Error('Selector must match exactly one element');
    const bytes = await target.screenshot({ type: 'png', timeout: input.timeoutMs, ...(input.selector ? {} : { fullPage: false }) });
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 8 || bytes.byteLength > 16 * 1024 * 1024 || !Buffer.from(bytes).subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid screenshot output');
    await writeFile(outputPath, bytes, { flag: 'wx', mode: 0o600 });
    return { path: outputPath, capturedAt: new Date().toISOString(), url: input.url, viewport: input.viewport, selector: input.selector, blockedRequests, scope: 'One screenshot only; blocked requests, page timing, authentication and visual correctness are not established. The image may contain sensitive page content.' };
  } finally { try { if (context) await context.close(); } finally { await browser.close(); } }
}

/** Compare two PNG pixel buffers; changes are observations, not visual defects. */
export async function compareAemScreenshots({ project, beforePath, afterPath, threshold = 0 }, { load = loadBrowser } = {}) {
  if (typeof project !== 'string' || !project.trim() || !Number.isSafeInteger(threshold) || threshold < 0 || threshold > 255) throw new TypeError('Invalid screenshot comparison');
  const info = await lstat(project); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid project directory');
  const { readLimitedFile } = await import('./read-limited.js');
  const inputs = await Promise.all([readLimitedFile(beforePath, 16 * 1024 * 1024), readLimitedFile(afterPath, 16 * 1024 * 1024)]);
  const dimensions = inputs.map(bytes => {
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216) throw new Error('PNG dimensions exceed limits');
    return { width, height };
  });
  if (dimensions[0].width !== dimensions[1].width || dimensions[0].height !== dimensions[1].height) return { comparable: false, reason: 'dimensions-differ', before: dimensions[0], after: dimensions[1] };
  const chromium = await load(await realpath(project)), browser = await chromium.launch({ headless: true }); let context;
  try {
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage(); let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Screenshot comparison timed out')), 30000); });
    let changedPixels;
    try {
      changedPixels = await Promise.race([page.evaluate(async ({ images, width, height, threshold: limit }) => {
        const decoded = await Promise.all(images.map(value => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = `data:image/png;base64,${value}`; })));
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx || decoded.some(image => image.naturalWidth !== width || image.naturalHeight !== height)) throw new Error('Invalid decoded image');
        ctx.drawImage(decoded[0], 0, 0); const first = ctx.getImageData(0, 0, width, height).data; ctx.clearRect(0, 0, width, height); ctx.drawImage(decoded[1], 0, 0); const second = ctx.getImageData(0, 0, width, height).data;
        let changed = 0; for (let i = 0; i < first.length; i += 4) if (Math.max(Math.abs(first[i] - second[i]), Math.abs(first[i + 1] - second[i + 1]), Math.abs(first[i + 2] - second[i + 2]), Math.abs(first[i + 3] - second[i + 3])) > limit) changed++;
        return changed;
      }, { images: inputs.map(bytes => bytes.toString('base64')), ...dimensions[0], threshold }), timeout]);
    } finally { clearTimeout(timer); }
    const pixels = dimensions[0].width * dimensions[0].height;
    if (!Number.isSafeInteger(changedPixels) || changedPixels < 0 || changedPixels > pixels) throw new Error('Invalid image comparison');
    return { comparable: true, ...dimensions[0], threshold, changedPixels, totalPixels: pixels, changedPercent: changedPixels / pixels * 100, scope: 'Pixel comparison only; timing, viewport configuration and meaningful visual differences require human inspection.' };
  } finally { try { if (context) await context.close(); } finally { await browser.close(); } }
}
