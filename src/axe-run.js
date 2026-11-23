import { createRequire } from 'node:module';
import { lstat, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function cleanOrigin(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new TypeError('Invalid origin');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Invalid origin');
  return url.origin;
}
function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some(key => !['url', 'allowOrigins', 'waitForSelector', 'timeoutMs', 'axeTags'].includes(key))) throw new TypeError('Invalid axe run configuration');
  if (typeof config.url !== 'string' || config.url.length > 2048) throw new TypeError('Page URL required');
  const page = new URL(config.url);
  if (!['http:', 'https:'].includes(page.protocol) || page.username || page.password || page.search || page.hash) throw new TypeError('Use an HTTP(S) page URL without credentials, query or fragment');
  const origins = config.allowOrigins ?? [];
  if (!Array.isArray(origins) || origins.length > 10) throw new TypeError('Invalid origins');
  const allowedOrigins = [...new Set([page.origin, ...origins.map(cleanOrigin)])];
  const timeoutMs = config.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new TypeError('Invalid timeout');
  if (config.waitForSelector !== undefined && (typeof config.waitForSelector !== 'string' || !config.waitForSelector.trim() || config.waitForSelector.length > 512 || /[\u0000-\u001f\u007f]/.test(config.waitForSelector))) throw new TypeError('Invalid wait selector');
  const tags = config.axeTags ?? [];
  if (!Array.isArray(tags) || tags.length > 20 || tags.some(tag => typeof tag !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(tag)) || new Set(tags).size !== tags.length) throw new TypeError('Invalid axe tags');
  return { url: page.href, allowedOrigins, timeoutMs, waitForSelector: config.waitForSelector ?? null, tags };
}
function loadProjectTools(root) {
  const require = createRequire(join(root, 'package.json'));
  const browser = require('playwright'), axe = require('axe-core');
  if (!browser?.chromium || typeof axe?.source !== 'string' || !axe.source || Buffer.byteLength(axe.source) > 8 * 1024 * 1024) throw new Error('Playwright or axe-core is unavailable');
  return { chromium: browser.chromium, axeSource: axe.source };
}

/** Explicitly scan one page with project-provided Playwright and axe-core, writing raw output once. */
export async function runAxeAccessibility({ project, config, outputPath }, { load = loadProjectTools } = {}) {
  if (typeof project !== 'string' || !project.trim() || typeof outputPath !== 'string' || !outputPath.trim()) throw new TypeError('Project and output path are required');
  const input = await lstat(project); if (!input.isDirectory() || input.isSymbolicLink()) throw new Error('Invalid project directory');
  const root = await realpath(project), settings = validateConfig(config);
  try { await lstat(outputPath); throw Object.assign(new Error('Output exists'), { code: 'EEXIST' }); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const { chromium, axeSource } = await load(root);
  if (!chromium || typeof chromium.launch !== 'function' || typeof axeSource !== 'string' || !axeSource) throw new Error('Browser tools unavailable');
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ acceptDownloads: false, serviceWorkers: 'block' });
    const page = await context.newPage();
    let blockedRequests = 0;
    await context.route('**/*', async route => {
      const request = route.request();
      let allowed = false;
      try { const url = new URL(request.url()); allowed = ['http:', 'https:'].includes(url.protocol) && settings.allowedOrigins.includes(url.origin) && ['GET', 'HEAD'].includes(request.method()); } catch { /* Block invalid network requests. */ }
      if (allowed) await route.continue(); else { blockedRequests++; await route.abort(); }
    });
    const response = await page.goto(settings.url, { waitUntil: 'domcontentloaded', timeout: settings.timeoutMs });
    if (!response || !response.ok()) throw new Error('Page navigation failed');
    const final = new URL(page.url());
    if (!settings.allowedOrigins.includes(final.origin)) throw new Error('Unexpected page origin');
    if (settings.waitForSelector) await page.waitForSelector(settings.waitForSelector, { timeout: settings.timeoutMs });
    await page.addScriptTag({ content: axeSource });
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Axe scan timed out')), settings.timeoutMs); });
    let raw;
    try { raw = await Promise.race([page.evaluate(async tags => await globalThis.axe.run(document, tags.length ? { runOnly: { type: 'tag', values: tags } } : {}), settings.tags), timeout]); }
    finally { clearTimeout(timer); }
    if (!raw || raw.testEngine?.name !== 'axe-core' || !Array.isArray(raw.violations) || !Array.isArray(raw.incomplete)) throw new Error('Invalid axe result');
    raw.aemDevFlowRun = { version: 1, browser: 'chromium', capturedAt: new Date().toISOString(), allowedOrigins: settings.allowedOrigins, blockedRequests, allowedMethods: ['GET', 'HEAD'], axeTags: settings.tags, waitForSelector: settings.waitForSelector };
    const encoded = `${JSON.stringify(raw, null, 2)}\n`;
    if (Buffer.byteLength(encoded) > 8 * 1024 * 1024) throw new Error('Axe output exceeds size limit');
    await writeFile(outputPath, encoded, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return { path: outputPath, violations: raw.violations.length, incomplete: raw.incomplete.length, blockedRequests, scope: 'One browser scan only; blocked resources, timing, authentication, manual accessibility and WCAG conformance remain unverified. Raw output can contain page data and selectors.' };
  } finally { try { if (context) await context.close(); } finally { await browser.close(); } }
}
