// All browser requests are fulfilled through a DNS-pinned public HTTP client.
// Chromium never connects to user-supplied origins itself, including redirects.
const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns/promises');
const net = require('node:net');

function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2)
      || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51)
      || a === 203 && b === 0 && c === 113);
  }
  // Restrict IPv6 to global unicast; refuse transition, mapped and documentation ranges.
  return net.isIP(address) === 6 && /^[23]/i.test(address)
    && !/^2001:(?:0*:|0*2:|0*10:|0*20:|db8:)/i.test(address) && !/^2002:/i.test(address);
}

function publicUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Usa un enlace web completo (https://…).'); }
  if (typeof value !== 'string' || value.length > 2048 || !['https:', 'http:'].includes(url.protocol)
    || url.username || url.password || url.port && !['80', '443'].includes(url.port)
    || /(^|\.)(localhost|local|internal|test|invalid)$/i.test(url.hostname)) {
    throw new Error('Solo se pueden capturar páginas web públicas por HTTP o HTTPS.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && !publicAddress(host)) throw new Error('No se permiten direcciones de redes privadas.');
  return url;
}

async function fetchPublic(value, budget, redirects = 0) {
  const url = publicUrl(value);
  if (++budget.requests > 160 || budget.bytes > 32 * 1024 * 1024) throw new Error('La página excede el límite de recursos.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => !publicAddress(record.address))) throw new Error('El destino no es una dirección pública.');
  const selected = records[0];
  const result = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      agent: false, timeout: 12000,
      headers: { 'User-Agent': 'ScoryDesign-ReferencePreview/1.0', Accept: '*/*', 'Accept-Encoding': 'identity' },
      lookup: (_host, options, callback) => options.all
        ? callback(null, [selected]) : callback(null, selected.address, selected.family),
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length; budget.bytes += chunk.length;
        if (size > 8 * 1024 * 1024 || budget.bytes > 32 * 1024 * 1024) {
          request.destroy(new Error('Un recurso de la página es demasiado grande.')); return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode || 502, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('La página tardó demasiado en responder.')));
    request.on('error', reject);
  });
  if (result.status >= 300 && result.status < 400 && result.headers.location) {
    if (redirects >= 5) throw new Error('La página tiene demasiadas redirecciones.');
    return fetchPublic(new URL(result.headers.location, url).href, budget, redirects + 1);
  }
  return { ...result, finalUrl: url.href };
}

async function captureWeb(input, puppeteer) {
  const url = publicUrl(input.url);
  const budget = { requests: 0, bytes: 0 };
  // Resolve before opening Chromium, so blocked destinations never start a browser.
  const main = await fetchPublic(url.href, budget);
  if (main.status >= 400) throw new Error('No se pudo abrir la página pública. Sube una captura si requiere iniciar sesión.');
  if (!String(main.headers['content-type'] || '').includes('text/html')) throw new Error('El enlace debe apuntar a una página web. Descarga el PDF o PPTX y súbelo como archivo.');
  const browser = await puppeteer.launch({ headless: 'new', executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'] });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setBypassServiceWorker(true);
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: input.preview ? .25 : 1 });
    await page.setRequestInterception(true);
    let servedMain = false;
    page.on('request', request => {
      void (async () => {
        if (!['document', 'stylesheet', 'image', 'font'].includes(request.resourceType())) return request.abort();
        if (request.url().startsWith('data:')) return request.continue();
        const response = !servedMain && request.isNavigationRequest()
          ? (servedMain = true, main) : await fetchPublic(request.url(), budget);
        await request.respond({ status: response.status, contentType: String(response.headers['content-type'] || 'application/octet-stream'),
          headers: { 'content-security-policy': "script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'" }, body: response.body });
      })().catch(() => { if (!request.isInterceptResolutionHandled()) void request.abort().catch(() => {}); });
    });
    await page.goto(main.finalUrl, { waitUntil: 'networkidle0', timeout: 25000 });
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, 1080));
    const pageCount = Math.ceil(height / 1080);
    if (pageCount > 100) throw new Error('La página supera los 100 segmentos. Usa un enlace más específico o sube una captura.');
    const numbers = requestedPages(input, pageCount), pages = [];
    for (const number of numbers) {
      const clipHeight = Math.min(1080, height - (number - 1) * 1080);
      const pngBase64 = await page.screenshot({ type: 'png', encoding: 'base64', captureBeyondViewport: true,
        clip: { x: 0, y: (number - 1) * 1080, width: 1920, height: clipHeight } });
      pages.push({ number, pngBase64 });
    }
    return { name: url.hostname, pageCount, pages, notice: 'Captura pública sin ejecutar scripts. Si faltan elementos dinámicos, sube una captura del navegador.' };
  } finally { await browser.close(); }
}

function requestedPages(input, total) {
  const pages = input.pages || Array.from({ length: Math.min(6, total) }, (_, index) => index + 1);
  if (!Array.isArray(pages) || !pages.length || pages.length > (input.preview ? 6 : 3)
    || pages.some(page => !Number.isSafeInteger(page) || page < 1 || page > total) || new Set(pages).size !== pages.length) {
    throw new Error('Selecciona páginas válidas dentro del documento.');
  }
  return pages;
}

module.exports = { publicAddress, publicUrl, fetchPublic, captureWeb, requestedPages };
