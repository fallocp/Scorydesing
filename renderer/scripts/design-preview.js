const puppeteer = require('puppeteer');
const http = require('node:http');
const { fetchPublic } = require('./reference-web');
const { inspectDesignLayout } = require('./design-diagnostics');
const { authorizeRendererRequest, assertRendererSessionHeader } = require('./renderer-access');

const MAX_HTML_BYTES = 5 * 1024 * 1024, MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
let active = 0;

function validateDesignPreview(input) {
  if (!input || typeof input.html !== 'string' || !input.html.trim() || Buffer.byteLength(input.html, 'utf8') > MAX_HTML_BYTES
    || ![input.width, input.height].every(size => Number.isSafeInteger(size) && size >= 256 && size <= 3840)
    || input.width * input.height > 16 * 1024 * 1024) throw new Error('Usa HTML de hasta 5 MB y un lienzo entre 256 y 3840 píxeles por lado.');
  return { html: input.html, width: input.width, height: input.height };
}

/** Development only: the local Supabase (npm run dev:local passes SCORY_LOCAL_SUPABASE_URL) serves public
 * Storage over plain HTTP on loopback. Only GET of that exact origin under /storage/v1/object/public/. */
function localSupabaseStorage(env = process.env) {
  if (env.NODE_ENV === 'production' || !env.SCORY_LOCAL_SUPABASE_URL) return null;
  let origin;
  try { origin = new URL(env.SCORY_LOCAL_SUPABASE_URL); } catch { return null; }
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname)) return null;
  const prefix = `${origin.origin}/storage/v1/object/public/`;
  return {
    matches: value => { try { const url = new URL(value); return url.origin === origin.origin && `${url.origin}${url.pathname}`.startsWith(prefix)
      && !url.username && !url.password && !url.pathname.includes('..'); } catch { return false; } },
    fetch: (value, budget) => new Promise((resolve, reject) => {
      if (++budget.requests > 160 || budget.bytes > 32 * 1024 * 1024) return reject(new Error('El diseño excede el límite de recursos.'));
      const request = http.get(value, { agent: false, timeout: 12000, headers: { Accept: '*/*', 'Accept-Encoding': 'identity' } }, response => {
        const chunks = []; let size = 0;
        response.on('data', chunk => { size += chunk.length; budget.bytes += chunk.length;
          if (size > 8 * 1024 * 1024) { request.destroy(new Error('Un recurso del diseño es demasiado grande.')); return; } chunks.push(chunk); });
        response.on('end', () => resolve({ status: response.statusCode || 502, headers: response.headers, body: Buffer.concat(chunks) }));
        response.on('error', reject);
      });
      request.on('timeout', () => request.destroy(new Error('El recurso tardó demasiado.')));
      request.on('error', reject);
    }),
  };
}

/** No page may navigate, execute scripts or connect directly to an origin. Only passive
 * assets reach the DNS-pinned public fetcher, without user cookies/Authorization headers. */
async function fulfillDesignResource(request, budget, fetchResource = fetchPublic, localStorage = localSupabaseStorage()) {
  const type = request.resourceType(), url = request.url();
  if (request.isNavigationRequest() || !['stylesheet', 'image', 'font'].includes(type)) return request.abort();
  if (/^data:(?:image\/|font\/|application\/(?:font|x-font)|text\/css)/i.test(url)) return request.continue();
  if (localStorage && localStorage.matches(url)) {
    const response = await localStorage.fetch(url, budget);
    return request.respond({ status: response.status, contentType: String(response.headers['content-type'] || 'application/octet-stream'),
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, body: response.body });
  }
  if (!/^https:\/\//i.test(url)) throw new Error('Solo se permiten recursos públicos HTTPS.');
  const response = await fetchResource(url, budget);
  await request.respond({ status: response.status, contentType: String(response.headers['content-type'] || 'application/octet-stream'),
    headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, body: response.body });
}

async function renderDesignPreview(rawInput, dependencies = {}) {
  const input = validateDesignPreview(rawInput);
  const browser = await (dependencies.puppeteer || puppeteer).launch({ headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--dns-prefetch-disable'] });
  let timer;
  try {
    const render = async () => {
      const page = await browser.newPage(), budget = { requests: 0, bytes: 0 };
      let blocked = 0;
      await page.setJavaScriptEnabled(false);
      await page.setBypassServiceWorker(true);
      await page.setViewport({ width: input.width, height: input.height, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on('request', request => {
        void fulfillDesignResource(request, budget, dependencies.fetchPublic || fetchPublic).catch(() => {
          blocked++;
          if (!request.isInterceptResolutionHandled()) void request.abort().catch(() => {});
        });
      });
      const localOrigin = localSupabaseStorage() ? ` ${new URL(process.env.SCORY_LOCAL_SUPABASE_URL).origin}` : '';
      const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\' data: https:; img-src data: https:' + localOrigin + '; font-src data: https:; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">';
      const html = /<head(?:\s[^>]*)?>/i.test(input.html)
        ? input.html.replace(/<head(?:\s[^>]*)?>/i, head => `${head}${csp}`)
        : `<!doctype html>${csp}${input.html.replace(/<!doctype[^>]*>/ig, '')}`;
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      const diagnostics = await page.evaluate(inspectDesignLayout);
      if (blocked && diagnostics.issues.length < 40) diagnostics.issues.push({ code: 'blocked_resource', message: 'No se pudo cargar un recurso público del diseño; comprueba sus imágenes y fuentes.' });
      const pngBase64 = await page.screenshot({ type: 'png', encoding: 'base64', clip: { x: 0, y: 0, width: input.width, height: input.height } });
      if (Buffer.byteLength(pngBase64, 'base64') > MAX_PNG_BYTES) throw new Error('La captura excede el límite de 8 MB. Reduce la complejidad de las imágenes.');
      return { pngBase64, diagnostics };
    };
    return await Promise.race([render(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('La captura tardó demasiado.')), 40000); })]);
  } finally { clearTimeout(timer); await browser.close(); }
}

async function handleDesignPreview(req, res, dependencies = {}) {
  const respond = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  try { assertRendererSessionHeader(req, dependencies.env); } catch (error) { respond(error.status, { error: error.code, message: error.message }); return; }
  if (active >= 2) { respond(429, { error: 'preview_busy', message: 'El renderizador está ocupado. Intenta de nuevo en unos segundos.' }); return; }
  active++;
  try {
    req.setTimeout?.(30000, () => req.destroy());
    let size = 0; const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { respond(413, { error: 'preview_too_large', message: 'El HTML excede el tamaño permitido.' }); return; }
      chunks.push(chunk);
    }
    req.setTimeout?.(0);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    await authorizeRendererRequest(req, body?.business_id, dependencies);
    const input = validateDesignPreview(body);
    respond(200, await (dependencies.render || renderDesignPreview)(input));
  } catch (error) {
    respond(error.status || 400, { error: error.code || 'design_preview_failed', message: error instanceof SyntaxError ? 'Solicitud de vista previa inválida.' : error.message });
  } finally { active--; }
}

module.exports = { validateDesignPreview, fulfillDesignResource, localSupabaseStorage, renderDesignPreview, handleDesignPreview, getActiveDesignPreviews: () => active };
