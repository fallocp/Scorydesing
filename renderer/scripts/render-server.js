#!/usr/bin/env node

/**
 * render-server.js — HTTP server for rendering HTML to PNG via Puppeteer.
 * Designed for cloud deployment (Fly.io, Railway, etc.) and local development.
 *
 * Usage: node scripts/render-server.js
 * Runs on PORT (default 3333)
 *
 * Endpoints:
 *   POST /render       — Single render: { html, width, height, filename, waitForFonts? }
 *   POST /render-batch — Batch render: { items: [{ html, width, height, filename }], waitForFonts? }
 *   GET  /health       — Health check: { status, puppeteer, activePages }
 *
 * Auth: Set RENDER_SERVICE_TOKEN env var to require Bearer token authentication.
 */

const http = require('http');
const puppeteer = require('puppeteer');

const PORT = process.env.PORT || 3333;
const AUTH_TOKEN = process.env.RENDER_SERVICE_TOKEN || null;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10);

let browser = null;
let activePages = 0;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
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

async function renderHtml(html, width, height, waitForFonts = false) {
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

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
      encoding: 'base64',
    });

    return screenshot;
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
    jsonResponse(res, 200, {
      status: 'ok',
      puppeteer: !!browser && browser.isConnected(),
      activePages,
      maxConcurrent: MAX_CONCURRENT,
    });
    return;
  }

  // Auth check for render endpoints
  if (!validateAuth(req)) {
    jsonResponse(res, 401, { error: 'Unauthorized' });
    return;
  }

  // POST /render — Single render
  if (req.method === 'POST' && req.url === '/render') {
    try {
      const { html, width, height, filename, waitForFonts } = await readBody(req);

      if (!html || !width || !height) {
        jsonResponse(res, 400, { error: 'Missing: html, width, height' });
        return;
      }

      console.log(`Rendering ${filename || 'piece'} (${width}x${height})...`);
      const pngBase64 = await renderHtml(html, width, height, waitForFonts ?? true);
      console.log(`  ✅ Done: ${filename || 'piece'}`);

      jsonResponse(res, 200, { pngBase64, filename: filename || 'piece.png' });
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
      const results = await renderBatch(items, waitForFonts ?? true);
      const successCount = results.filter((r) => r.success).length;
      console.log(`  ✅ Batch done: ${successCount}/${items.length} successful`);

      jsonResponse(res, 200, { results });
    } catch (err) {
      console.error('Batch render error:', err.message);
      jsonResponse(res, 500, { error: err.message });
    }
    return;
  }

  jsonResponse(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`\n🎨 Render Service running on port ${PORT}`);
  console.log(`   POST /render       — Single HTML → PNG`);
  console.log(`   POST /render-batch — Batch HTML → PNG (max ${MAX_CONCURRENT} concurrent)`);
  console.log(`   GET  /health       — Health check`);
  console.log(`   Auth: ${AUTH_TOKEN ? 'ENABLED (Bearer token)' : 'DISABLED (open)'}\n`);
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
