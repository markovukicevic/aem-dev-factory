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
