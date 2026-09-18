/** Browser/IndexedDB pixel extraction check. Isolated profile; network limited to local fixture app. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3017', entry = `${base}/experiments/presentations/`;
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], blocked = [], errors = [];
let server, browser, socket, evaluate;
try {
  if (!await fetch(entry).then(r => r.ok).catch(() => false)) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.composition-test.config.ts'], { windowsHide: true, stdio: 'ignore' });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !await fetch(entry).then(r => r.ok).catch(() => false)) await delay(150);
    assert(await fetch(entry).then(r => r.ok), 'Local fixture server starts');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'composition-browser-'));
  browser = spawn(process.env.DESAING_TEST_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome launch timed out')), 20000);
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.stderr.on('data', bytes => { const match = bytes.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id); pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const remote = /^https?:/.test(request.url) && new URL(request.url).origin !== base;
      if (remote) blocked.push(request.url);
      void send(remote ? 'Fetch.failRequest' : 'Fetch.continueRequest', remote ? { requestId, errorReason: 'BlockedByClient' } : { requestId }, message.sessionId).catch(error => errors.push(error.message));
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timeout: ${expression}`);
  };
  const click = async label => {
    const selector = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;
    await wait(`!!(${selector})`); await evaluate(`${selector}.click()`);
  };
  const setInput = async (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(path.join(artifacts, `composition-${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  const control = async query => {
    const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
      method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
    }); assert.equal(response.status, 200); return response.json();
  };
  const deck = 'JSON.parse(localStorage.getItem(window.__presentationHarness.draftKey))';
  const open = async () => { await click('Usar diseño para HTML'); await wait("document.querySelector('.hcp-dialog')?.getAttribute('aria-busy')==='false' && !document.querySelector('[aria-label=\"Contenido aprobado para HTML\"]').disabled"); };
  const close = async () => { await wait("!document.querySelector('[aria-label=\"Cerrar diseño para HTML\"]').disabled"); await evaluate("document.querySelector('[aria-label=\"Cerrar diseño para HTML\"]').click()"); await wait("!document.querySelector('.hcp-dialog')"); };
  const copy = '  Un mundo <con ideas> & proyectos  \nIngresos: $ 5.00\nTexto aprobado literalmente.';
  const setCopy = async text => evaluate(`(()=>{const el=document.querySelector('[aria-label="Contenido aprobado para HTML"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const upload = async (selector, name, width, height) => evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};const ctx=canvas.getContext('2d');
    ctx.fillStyle='#eef5ef';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#167c75';ctx.fillRect(canvas.width*.6,canvas.height*.15,canvas.width*.3,canvas.height*.6);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png')),dt=new DataTransfer();dt.items.add(new File([blob],${JSON.stringify(name)},{type:'image/png'}));
    const input=document.querySelector(${JSON.stringify(selector)});input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  const preview = "new DOMParser().parseFromString(document.querySelector('iframe[title=\"Composición HTML editable\"]').srcdoc,'text/html')";
  await send('Page.navigate', { url: entry }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Usar diseño para HTML')");
  const initial = await evaluate(deck);
  await open(); await setCopy(copy); await close(); await open();
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Contenido aprobado para HTML\"]').value"), copy);
  await upload('[aria-label="Diseño para convertir"]', 'diseno-elegido.png', 1200, 675);
  await wait("document.querySelector('.hcp-dialog')?.getAttribute('aria-busy')==='false' && !!document.querySelector('img[alt=\"Diseño elegido como referencia\"]')");
  assert.equal((await control()).html_requests.length, 0);
  await evaluate("document.querySelector('.hcp-confirm input').click()");
  await control('lose_html=true'); await click('Crear HTML editable');
  await wait("document.body.innerText.includes('Conversión pendiente de confirmar') && document.querySelector('.hcp-dialog').getAttribute('aria-busy')==='false'");
  assert.equal((await control()).html_requests.length, 1);
  assert.deepEqual(await evaluate(deck), initial);
  await close(); await send('Page.reload', {}, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Usar diseño para HTML')");
  await click('Usar diseño para HTML'); await wait("document.querySelector('.hcp-dialog')?.getAttribute('aria-busy')==='false'");
  await click('Recuperar composición'); await wait("document.querySelectorAll('[data-testid=composition-slot]').length===2");
  assert.equal((await control()).html_requests.length, 1);
  assert.equal((await control()).adapter_requests.length, 0);
  assert.deepEqual((await control()).html_requests[0].dimensions, { width: 1200, height: 675 });
  assert.deepEqual((await control()).html_requests[0].copy.map(b => b.text), copy.split('\n'));
  checks.push('Uploaded design uses actual PNG and exact approved text; lost reply survives reload and recovers with one vision call and zero image calls');
  assert.deepEqual(await evaluate(`${preview}.querySelectorAll('[data-composition-kind="text"]').length`), 3);
  assert.equal(await evaluate(`${preview}.querySelector('h1').textContent`), copy.split('\n')[0]);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Aplicar HTML revisado').disabled"), true);
  await screenshot('comparison-pending');
  checks.push('Comparison separates literal editable text, CSS shapes and unresolved slots; unresolved pieces block applying');

  await evaluate("Array.from(document.querySelector('[data-slot-id=hero_piece]').querySelectorAll('button')).find(b=>b.textContent==='Extraer del diseño').click()");
  for (const [label, value] of [['Recorte izquierda', 700], ['Recorte arriba', 100], ['Recorte ancho', 360], ['Recorte alto', 400]]) await setInput(`input[aria-label="${label}"]`, value);
  await click('Revisar extracción'); await wait("!!document.querySelector('[data-testid=manual-extraction-review] img')");
  await click('Guardar pieza revisada');
  await wait("!document.querySelector('[data-testid=manual-extraction]') && document.querySelector('[data-slot-id=hero_piece]').innerText.includes('Elección guardada')");
  await evaluate("Array.from(document.querySelector('[data-slot-id=small_piece]').querySelectorAll('button')).find(b=>b.textContent==='Omitir esta pieza').click()");
  await wait("document.querySelector('.hcp-dialog').getAttribute('aria-busy')==='false' && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Aplicar HTML revisado'&&!b.disabled)");
  const versions = await evaluate("(async()=>{const m=await import('/src/lib/presentations/presentationAssets.ts');return(await m.listPresentationAssets(window.__presentationHarness.businessId)).map(x=>x.version)})()");
  assert.equal(versions.length, 2); assert.equal(versions[1].provenance.kind, 'pixel_extraction');
  assert.deepEqual(versions[1].provenance.source, versions[0].identity);
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await screenshot('tablet-reviewed');
  await click('Aplicar HTML revisado'); await wait(`!document.querySelector('.hcp-dialog') && ${deck}[0].mounted_assets?.length===1`);
  const mounted = await evaluate(deck);
  assert.equal(mounted[0].revision, initial[0].revision + 1);
  assert.equal(mounted[1].html, initial[1].html);
  assert.deepEqual(mounted[0].mounted_assets[0].asset, versions[1].identity);
  assert.equal(await evaluate(`new DOMParser().parseFromString(${deck}[0].html,'text/html').querySelectorAll('img').length`), 1);
  checks.push('Reviewed crop saves source lineage and reusable pixels; explicit omission and tablet comparison precede revision-safe application');

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await click('Editor Visual');
  await wait("document.querySelector('iframe')?.contentDocument?.querySelector('h1') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Un mundo <con idea'))");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Un mundo <con idea')).click()");
  await wait("document.querySelector('iframe').contentDocument.querySelector('h1')?.isContentEditable");
  await evaluate("(()=>{const doc=document.querySelector('iframe').contentDocument,el=doc.querySelector('h1');el.focus();el.textContent='Título editado después de convertir';el.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));el.blur();})()");
  await wait("!document.querySelector('iframe').contentDocument?.querySelector('[contenteditable=true]')");
  await click('Guardar'); await wait(`${deck}[0].html.includes('Título editado después de convertir')`);
  const edited = await evaluate(deck); assert.deepEqual(edited[0].mounted_assets[0].asset, versions[1].identity);
  await send('Page.reload', {}, sessionId); await wait(`!!window.__presentationHarness && ${deck}[0].html.includes('Título editado después de convertir')`);
  assert.deepEqual(await evaluate(deck), edited);
  checks.push('Existing visual editor edits converted text independently of raster piece and persists exact asset identity across reload');

  // Current slide revision differs from the frozen conversion; opening saved work must never call vision again.
  await click('Usar diseño para HTML'); await wait("document.querySelector('.hcp-dialog')?.getAttribute('aria-busy')==='false'");
  await click('Aplicar HTML revisado'); await wait("document.querySelector('.hcp-dialog [role=alert]')?.textContent.includes('Cambió la diapositiva')");
  assert.deepEqual(await evaluate(deck), edited); assert.equal((await control()).html_requests.length, 1);
  await close();
  checks.push('Stale converted result cannot overwrite subsequent visual edits and reopening never regenerates');

  // Move to another page: a new composition is independent, and quota gate affects new calls only.
  await click('Siguiente'); await open(); await setCopy('Segunda página\nPieza reutilizada');
  await upload('[aria-label="Diseño para convertir"]', 'segunda-referencia.png', 800, 450);
  await wait("document.querySelector('.hcp-dialog')?.getAttribute('aria-busy')==='false'");
  await evaluate("document.querySelector('.hcp-confirm input').click()"); await click('Crear HTML editable');
  await wait("document.querySelectorAll('[data-testid=composition-slot]').length===2 && document.querySelector('.hcp-dialog')?.getAttribute('aria-busy')==='false'");
  await evaluate(`(()=>{const select=document.querySelector('[aria-label="Pieza para Ilustración principal"]');select.value='local:1';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("document.querySelector('[data-slot-id=hero_piece]').innerText.includes('Elección guardada') && document.querySelector('.hcp-dialog').getAttribute('aria-busy')==='false'");
  await evaluate("Array.from(document.querySelector('[data-slot-id=small_piece]').querySelectorAll('button')).find(b=>b.textContent==='Omitir esta pieza').click()");
  await wait("document.querySelector('.hcp-dialog').getAttribute('aria-busy')==='false'");
  await control('text_enabled=false'); await click('Recuperar composición');
  await wait("document.body.innerText.includes('La conversión está pausada')");
  await click('Aplicar HTML revisado'); await wait(`${deck}[1].mounted_assets?.length===1`);
  assert.deepEqual((await evaluate(deck))[1].mounted_assets[0].asset, versions[1].identity);
  checks.push('Second slide reuses extracted asset without image generation; disabling conversion preserves recovery and applying saved HTML');
  const metrics = await control();
  assert.equal(metrics.html_requests.length, 2); assert.equal(metrics.adapter_requests.length, 0); assert.equal(metrics.real_provider_calls, 0);
  assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, 'composition-smoke-result.json'), JSON.stringify({ ok: true, checks, metrics, external_requests: blocked, exceptions: errors }, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, simulated_vision_calls: metrics.html_requests.length, paid_calls: 0 }, null, 2));
} catch (error) {
  await writeFile(path.join(artifacts, 'composition-smoke-result.json'), JSON.stringify({ ok: false, checks, error: error.stack, blocked, errors,
    ui: evaluate ? await evaluate('document.body.innerText').catch(() => null) : null }, null, 2));
  throw error;
} finally { if (socket) socket.close(); if (browser) browser.kill(); if (server) server.kill(); }

