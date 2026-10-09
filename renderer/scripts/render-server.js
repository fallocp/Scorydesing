#!/usr/bin/env node

/**
 * render-server.js — HTTP server for rendering HTML to PNG via Puppeteer.
 * Runs locally or on the same server as the application.
 *
 * Usage: node scripts/render-server.js
 * Runs on PORT (default 3333)
 *
 * Endpoints:
 *   POST /render       — Single render: { html, width, height, filename, waitForFonts? }
 *   POST /render-batch — Batch render: { items: [{ html, width, height, filename }], waitForFonts? }
 *   GET  /health       — Health check: { status, puppeteer, activePages }
 *   POST /design-preview — Design screenshot and layout diagnostics
 *   POST /reference-import — PDF/PPTX pages and public web references
 *
 * Previews/imports: local loopback in development; user session + brand access in production.
 * Legacy exports: RENDER_SERVICE_TOKEN retains their existing Bearer-token contract.
 */

const http = require('http');
const puppeteer = require('puppeteer');
const { inspectDesignLayout } = require('./design-diagnostics');
const { handleReferenceImport, getActiveReferenceImports } = require('./reference-import');
const { handleDesignPreview, getActiveDesignPreviews } = require('./design-preview');

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const AUTH_TOKEN = process.env.RENDER_SERVICE_TOKEN || null;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10);
const startTime = Date.now();

let browser = null;
let activePages = 0;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });
  }
  return browser;
}

async function renderHtml(html, width, height, waitForFonts = false, includeDiagnostics = false) {
  const b = await getBrowser();
  const page = await b.newPage();
  activePages++;

  try {
    await page.setViewport({ width, height });
    await page.setContent(html, {
      waitUntil: waitForFonts ? 'networkidle0' : 'domcontentloaded',
      timeout: 30000,
    });

    // If waitForFonts, give extra time for Google Fonts to render
    if (waitForFonts) {
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 500));
    }

    const diagnostics = includeDiagnostics ? await page.evaluate(inspectDesignLayout) : undefined;
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
      encoding: 'base64',
    });

    return includeDiagnostics ? { pngBase64: screenshot, diagnostics } : screenshot;
  } finally {
    activePages--;
    await page.close();
  }
}

// Concurrency-limited batch processing
async function renderBatch(items, waitForFonts = false) {
  const results = [];
  const queue = [...items];
  const running = [];

  while (queue.length > 0 || running.length > 0) {
    // Fill up to MAX_CONCURRENT
    while (queue.length > 0 && running.length < MAX_CONCURRENT) {
      const item = queue.shift();
      const idx = items.indexOf(item);
      const promise = renderHtml(item.html, item.width, item.height, waitForFonts)
        .then((pngBase64) => ({
          index: idx,
          success: true,
          pngBase64,
          filename: item.filename || `piece-${idx}.png`,
        }))
        .catch((err) => ({
          index: idx,
          success: false,
          error: err.message,
          filename: item.filename || `piece-${idx}.png`,
        }));
      running.push(promise);
    }

    // Wait for at least one to finish
    if (running.length > 0) {
      const finished = await Promise.race(running.map((p, i) => p.then((r) => ({ result: r, i }))));
      results.push(finished.result);
      running.splice(finished.i, 1);
    }
  }

  // Sort by original index
  results.sort((a, b) => a.index - b.index);
  return results;
}

// Render multiple slides into a single multi-page PDF at exact pixel dimensions.
// Cada slide se renderiza primero a PNG (mismas dimensiones que el export PNG) y
// luego se ensamblan como páginas a tamaño completo, garantizando dimensiones idénticas.
async function renderPdf(items, waitForFonts = true) {
  const results = await renderBatch(items, waitForFonts);
  const ok = results.filter((r) => r.success);
  if (ok.length === 0) throw new Error('No slides rendered for PDF');

  const W = items[0].width;
  const H = items[0].height;
  const pages = ok
    .map((r) => `<div class="page"><img src="data:image/png;base64,${r.pngBase64}"/></div>`)
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: ${W}px ${H}px; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.page { width: ${W}px; height: ${H}px; overflow: hidden; page-break-after: always; }
.page:last-child { page-break-after: auto; }
img { width: ${W}px; height: ${H}px; display: block; }
</style></head><body>${pages}</body></html>`;

  // page.pdf() crashea con '--single-process'; usamos un navegador dedicado sin ese flag.
  const pdfBrowser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  activePages++;
  try {
    const page = await pdfBrowser.newPage();
    await page.setViewport({ width: W, height: H });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdf = await page.pdf({
      width: `${W}px`,
      height: `${H}px`,
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf).toString('base64');
  } finally {
    activePages--;
    await pdfBrowser.close();
  }
}

function validateAuth(req) {
  if (!AUTH_TOKEN) return true; // No token configured = open access
  const authHeader = req.headers['authorization'] || '';
  return authHeader === `Bearer ${AUTH_TOKEN}`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // Health check (no auth required)
  if (req.method === 'GET' && req.url === '/health') {
    const puppeteerConnected = !!browser && browser.isConnected();
    jsonResponse(res, 200, {
      status: puppeteerConnected || activePages === 0 ? 'ok' : 'degraded',
      puppeteer: puppeteerConnected,
      activePages,
      activeReferenceImports: getActiveReferenceImports(),
      activeDesignPreviews: getActiveDesignPreviews(),
      maxConcurrent: MAX_CONCURRENT,
      apiVersion: 2,
      capabilities: ['design-preview', 'reference-import'],
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
    return;
  }

  // New presentation endpoints use user sessions/RLS (or native loopback), not the legacy shared token.
  if (req.method === 'POST' && ['/reference-import', '/renderer/reference-import'].includes(req.url)) {
    await handleReferenceImport(req, res);
    return;
  }
  if (req.method === 'POST' && ['/design-preview', '/renderer/design-preview'].includes(req.url)) {
    await handleDesignPreview(req, res);
    return;
  }

  // Preserve the existing auth contract for legacy export endpoints.
  if (!validateAuth(req)) {
    jsonResponse(res, 401, { error: 'Unauthorized' });
    return;
  }

  // POST /render — Single render
  if (req.method === 'POST' && req.url === '/render') {
    try {
      const { html, width, height, filename, waitForFonts, includeDiagnostics } = await readBody(req);

      if (!html || !width || !height) {
        jsonResponse(res, 400, { error: 'Missing: html, width, height' });
        return;
      }

      console.log(`Rendering ${filename || 'piece'} (${width}x${height})...`);
      const renderStart = Date.now();
      const rendered = await renderHtml(html, width, height, waitForFonts ?? true, includeDiagnostics === true);
      const renderTime = Date.now() - renderStart;
      console.log(`  ✅ Done: ${filename || 'piece'} (${renderTime}ms)`);

      jsonResponse(res, 200, { ...(typeof rendered === 'string' ? { pngBase64: rendered } : rendered), filename: filename || 'piece.png', renderTime });
    } catch (err) {
      console.error('Render error:', err.message);
      jsonResponse(res, 500, { error: err.message });
    }
    return;
  }

  // POST /render-batch — Batch render with concurrency control
  if (req.method === 'POST' && req.url === '/render-batch') {
    try {
      const { items, waitForFonts } = await readBody(req);

      if (!items || !Array.isArray(items) || items.length === 0) {
        jsonResponse(res, 400, { error: 'Missing or empty items array' });
        return;
      }

      // Validate each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.html || !item.width || !item.height) {
          jsonResponse(res, 400, { error: `Item ${i}: missing html, width, or height` });
          return;
        }
      }

      console.log(`Batch rendering ${items.length} items (max ${MAX_CONCURRENT} concurrent)...`);
      const batchStart = Date.now();
      const results = await renderBatch(items, waitForFonts ?? true);
      const totalTime = Date.now() - batchStart;
      const successCount = results.filter((r) => r.success).length;
      console.log(`  ✅ Batch done: ${successCount}/${items.length} successful (${totalTime}ms)`);

      jsonResponse(res, 200, { results, totalTime });
    } catch (err) {
      console.error('Batch render error:', err.message);
      jsonResponse(res, 500, { error: err.message });
    }
    return;
  }

  // POST /render-pdf — Render slides to a single multi-page PDF (mismas dimensiones que PNG)
  if (req.method === 'POST' && req.url === '/render-pdf') {
    try {
      const { items, waitForFonts, filename } = await readBody(req);

      if (!items || !Array.isArray(items) || items.length === 0) {
        jsonResponse(res, 400, { error: 'Missing or empty items array' });
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.html || !item.width || !item.height) {
          jsonResponse(res, 400, { error: `Item ${i}: missing html, width, or height` });
          return;
        }
      }

      console.log(`Rendering PDF (${items.length} pages)...`);
      const pdfStart = Date.now();
      const pdfBase64 = await renderPdf(items, waitForFonts ?? true);
      console.log(`  ✅ PDF done (${Date.now() - pdfStart}ms)`);

      jsonResponse(res, 200, { pdfBase64, filename: filename || 'presentation.pdf' });
    } catch (err) {
      console.error('PDF render error:', err.message);
      jsonResponse(res, 500, { error: err.message });
    }
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`\n🎨 Render Service running on ${HOST}:${PORT}`);
  console.log(`   POST /render       — Single HTML → PNG`);
  console.log(`   POST /render-batch — Batch HTML → PNG (max ${MAX_CONCURRENT} concurrent)`);
  console.log(`   POST /render-pdf   — Slides → single multi-page PDF`);
  console.log(`   POST /design-preview — Design screenshot and diagnostics`);
  console.log(`   POST /reference-import — Document and web references`);
  console.log(`   GET  /health       — Health check`);
  console.log(`   Preview/import access: ${process.env.NODE_ENV === 'production' ? 'Supabase user session and brand membership' : 'local development; remote requests require a user session'}`);
  console.log(`   Legacy export token: ${AUTH_TOKEN ? 'enabled' : 'not configured'}\n`);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (browser) await browser.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nSIGTERM received, shutting down...');
  if (browser) await browser.close();
  process.exit(0);
});
