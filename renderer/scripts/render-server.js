#!/usr/bin/env node

/**
 * render-server.js — Local HTTP server for rendering HTML to PNG via Puppeteer.
 * The React UI calls this server to render pieces with full branding.
 *
 * Usage: node scripts/render-server.js
 * Runs on http://localhost:3333
 *
 * POST /render
 * Body: { html: string, width: number, height: number, filename: string }
 * Returns: PNG image as base64 JSON { pngBase64: string, filename: string }
 */

const http = require('http');
const puppeteer = require('puppeteer');

const PORT = 3333;
let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

async function renderHtml(html, width, height) {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
      encoding: 'base64',
    });

    return screenshot;
  } finally {
    await page.close();
  }
}

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/render') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { html, width, height, filename } = JSON.parse(body);

        if (!html || !width || !height) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing: html, width, height' }));
          return;
        }

        console.log(`Rendering ${filename || 'piece'} (${width}x${height})...`);
        const pngBase64 = await renderHtml(html, width, height);
        console.log(`  ✅ Done: ${filename || 'piece'}`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ pngBase64, filename: filename || 'piece.png' }));
      } catch (err) {
        console.error('Render error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', puppeteer: !!browser }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🎨 Xending Render Server running on http://localhost:${PORT}`);
  console.log('   POST /render — Send HTML, get PNG');
  console.log('   GET /health — Check status\n');
});

// Cleanup on exit
process.on('SIGINT', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
