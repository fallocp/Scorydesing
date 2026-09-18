/** Real PresentationsPage + IndexedDB in Chrome. The test-only Vite aliases replace cloud boundaries. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3012';
const entry = `${base}/experiments/presentations/`;
const browserPath = process.env.DESAING_TEST_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], events = [], blocked = [];
let server, browser, socket, main;
let send;

try {
  if (!await fetch(entry).then(response => response.ok).catch(() => false)) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.presentations-test.config.ts'],
      { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let startupError = '';
    server.on('error', error => { startupError += error.message; });
    server.stderr.on('data', bytes => { startupError += bytes.toString(); });
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
      if (await fetch(entry).then(response => response.ok).catch(() => false)) { ready = true; break; }
      if (server.exitCode !== null) break;
      await delay(150);
    }
    if (!ready) throw new Error(`Presentations test server did not start: ${startupError}`);
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'presentations-browser-'));
  browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not expose a debugging endpoint.')), 20000);
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.stderr.on('data', bytes => {
      const match = bytes.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
      return;
    }
    events.push(message);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const remote = /^https?:/.test(request.url) && new URL(request.url).origin !== base;
      if (remote) blocked.push(request.url);
      void send(remote ? 'Fetch.failRequest' : 'Fetch.continueRequest',
        remote ? { requestId, errorReason: 'BlockedByClient' } : { requestId }, message.sessionId)
        .catch(error => { events.push({ method: 'Test.interceptionError', error: error.message }); });
    }
  });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Network.enable', {}, sessionId);
  // Intercept before navigation: unexpected APIs and remote resources never leave this tab.
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, label = expression) => {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timed out: ${label}`);
  };
  const click = async text => {
    const encoded = JSON.stringify(text);
    await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${encoded}&&!b.disabled)`, `button ${text}`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${encoded}&&!b.disabled).click()`);
  };
  const screenshot = async name => {
    await delay(750);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(path.join(artifacts, `presentations-${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  main = { sessionId, evaluate, screenshot };
  const deck = 'JSON.parse(localStorage.getItem(window.__presentationHarness.draftKey))';
  await send('Page.navigate', { url: entry }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Añadir imágenes montadas')", 'real PresentationsPage mounted');
  await wait(`${deck}.length===2 && ${deck}.every(s=>s.id&&s.revision===1)`, 'legacy draft normalized');
  const initial = await evaluate(deck);
  assert.equal(new Set(initial.map(slide => slide.id)).size, 2);
  assert.match(initial[0].html, /Un mundo de ideas/);
  checks.push('real PresentationsPage loads legacy draft with stable IDs and revision 1');

  await click('Añadir imágenes montadas');
  await wait("!!document.querySelector('.mip-file-input') && !document.querySelector('.mip-dialog')?.getAttribute('aria-busy')?.includes('true')");
  await evaluate(`(async()=>{
    const canvas=document.createElement('canvas'); canvas.width=320;canvas.height=180;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#d9ece8';ctx.fillRect(0,0,320,180);
    ctx.fillStyle='#128f88';ctx.beginPath();ctx.arc(116,90,62,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#a9e6d6';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(116,90,27,62,0,0,Math.PI*2);ctx.stroke();
    ctx.beginPath();ctx.ellipse(116,90,62,22,0,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='#ed794f';ctx.beginPath();ctx.moveTo(183,101);ctx.lineTo(283,56);ctx.lineTo(245,133);ctx.lineTo(225,103);ctx.closePath();ctx.fill();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const transfer=new DataTransfer();transfer.items.add(new File([blob],'mundo-avion.png',{type:'image/png'}));
    const input=document.querySelector('.mip-file-input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await wait("document.querySelector('.mip-file-choice')?.textContent.includes('mundo-avion.png')", 'PNG selected');
  // Select a free area using actual React form events, without changing application state directly.
  await evaluate("(()=>{const ratio=document.querySelector('.mip-ratio input');if(ratio.checked)ratio.click()})()");
  for (const [index, value] of [460, 240, 280, 158].entries()) {
    await evaluate(`(()=>{const input=document.querySelectorAll('.mip-controls input[type=number]')[${index}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  assert.match(await evaluate("new DOMParser().parseFromString(document.querySelector('.mip-preview iframe').srcdoc,'text/html').querySelector('img').src"), /^data:image\/png;base64,/);
  await screenshot('desktop-panel');
  await click('Montar imagen');
  await wait(`${deck}[0].mounted_assets?.length===1`, 'mounted image saved in active local deck');
  await wait("!document.querySelector('.mip-dialog')", 'mount panel closed');
  const mounted = await evaluate(deck);
  assert.equal(mounted[0].id, initial[0].id);
  assert.equal(mounted[0].revision, 2);
  assert.match(mounted[0].html, /data:image\/png;base64,/);
  assert.match(mounted[0].html, /Un mundo de ideas/);
  assert.equal(mounted[0].mounted_assets[0].fit, 'contain');
  assert.equal(mounted[0].mounted_assets[0].asset.business_id, await evaluate('window.__presentationHarness.businessId'));
  assert.equal(mounted[1].html, initial[1].html);
  checks.push('upload validates PNG, mounts with contain, retains text and stores asset manifest');
  await screenshot('desktop-mounted');

  await send('Page.reload', {}, sessionId);
  await wait(`!!window.__presentationHarness && ${deck}[0].mounted_assets?.length===1 && !!document.querySelector('iframe')`, 'mounted deck survives actual reload');
  assert.deepEqual(await evaluate(deck), mounted);
  await click('Añadir imágenes montadas');
  await wait("document.querySelectorAll('.mip-library-item').length===1", 'asset library reopens from IndexedDB');
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate("document.querySelector('.mip-library-item').click()");
  await screenshot('tablet-panel');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await evaluate("document.querySelector('button[aria-label=\"Cerrar panel\"]').click()");
  checks.push('reload preserves HTML and metadata; local asset library reopens on tablet without horizontal overflow');

  await click('Duplicar slide');
  await wait(`${deck}.length===3`, 'duplicated slide saved');
  const duplicated = await evaluate(deck);
  assert.equal(new Set(duplicated.map(slide => slide.id)).size, 3);
  assert.notEqual(duplicated[1].id, duplicated[0].id);
  assert.equal(duplicated[1].revision, 1);
  assert.deepEqual(duplicated[1].mounted_assets, duplicated[0].mounted_assets);
  assert.equal(duplicated[1].html, duplicated[0].html);
  checks.push('duplicate gets a new stable slide ID and revision 1 while retaining mounted asset references');

  await evaluate(`window.__exported=null;window.__anchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){
      fetch(this.href).then(r=>r.text()).then(text=>window.__exported=text);
    }else window.__anchorClick.call(this)}`);
  await click('Exportar Todo');
  await wait("typeof window.__exported==='string'", 'actual downloaded HTML captured');
  const exported = await evaluate('window.__exported');
  const exportFrames = await evaluate("Array.from(new DOMParser().parseFromString(window.__exported,'text/html').querySelectorAll('iframe')).map(f=>({html:f.srcdoc,sandbox:f.getAttribute('sandbox'),width:f.width,height:f.height}))");
  assert.equal(exportFrames.length, 3);
  assert.deepEqual(exportFrames.map(frame => frame.html), duplicated.map(slide => slide.html));
  assert(exportFrames.every(frame => frame.sandbox === '' && frame.width === '800' && frame.height === '450'));
  assert.match(exportFrames[0].html, /data:image\/png;base64,/);
  assert.match(exportFrames[2].html, /Segunda página activa/);
  await evaluate('HTMLAnchorElement.prototype.click=window.__anchorClick');
  await writeFile(path.join(artifacts, 'presentations-export.html'), exported);
  await screenshot('tablet-mounted');
  checks.push('Exportar Todo downloads the actual active three-slide snapshot with embedded PNG and isolated slide CSS');

  const isolation = await evaluate(`(async()=>{
    const {listPresentationAssets,validatePresentationRaster}=await import('/src/lib/presentations/presentationAssets.ts');
    const harness=window.__presentationHarness;
    const own=await listPresentationAssets(harness.businessId),other=await listPresentationAssets(harness.otherBusinessId);
    let rejected=false;try{await validatePresentationRaster(new File(['<svg onload="alert(1)"></svg>'],'fake.png',{type:'image/png'}))}catch{rejected=true}
    return{own:own.length,other:other.length,rejected,inline:own[0]?.dataUrl.startsWith('data:image/png;base64,')};
  })()`);
  assert.deepEqual(isolation, { own: 1, other: 0, rejected: true, inline: true });
  checks.push('real IndexedDB library is scoped by business; SVG disguised as PNG is rejected');

  const sanitizer = await evaluate(`(async()=>{
    const {sanitizePresentationHtml}=await import('/src/lib/presentations/presentationHtml.ts');
    const hostile='<html><head><script>parent.__presentationAttack=true<\/script></head><body onload="parent.__presentationAttack=true"><h1>Conservar título</h1><iframe srcdoc="<script>parent.__presentationAttack=true<\\/script>"></iframe><form action="javascript:parent.__presentationAttack=true"><input autofocus onfocus="parent.__presentationAttack=true"></form><a href="javascript:parent.__presentationAttack=true" onclick="parent.__presentationAttack=true">Enlace</a><script id="__ed_cfg" type="application/json">{"safe":"metadata"}<\/script></body></html>';
    const html=sanitizePresentationHtml(hostile),doc=new DOMParser().parseFromString(html,'text/html');
    const unsafeScripts=Array.from(doc.querySelectorAll('script')).filter(s=>s.id!=='__ed_cfg'||s.type!=='application/json');
    const handlers=Array.from(doc.querySelectorAll('*')).flatMap(e=>Array.from(e.attributes)).filter(a=>a.name.startsWith('on'));
    window.__presentationAttack=false;
    const frame=document.createElement('iframe');frame.setAttribute('sandbox','');frame.srcdoc=html;
    await new Promise(resolve=>{frame.onload=resolve;document.body.append(frame)});frame.remove();
    return{scripts:unsafeScripts.length,handlers:handlers.length,forbidden:doc.querySelectorAll('iframe,form,input,object,embed').length,
      executableLink:!!doc.querySelector('a[href]'),inert:doc.querySelector('script#__ed_cfg')?.textContent,
      title:doc.querySelector('h1')?.textContent,executed:window.__presentationAttack,csp:doc.querySelector('meta[http-equiv]')?.content};
  })()`);
  assert.equal(sanitizer.scripts, 0); assert.equal(sanitizer.handlers, 0); assert.equal(sanitizer.forbidden, 0);
  assert.equal(sanitizer.executableLink, false); assert.equal(sanitizer.executed, false);
  assert.deepEqual(JSON.parse(sanitizer.inert), { safe: 'metadata' });
  assert.equal(sanitizer.title, 'Conservar título'); assert.match(sanitizer.csp, /script-src 'none'/);
  checks.push('hostile HTML loses executable script, iframe, handlers and forms; inert editor JSON and heading survive');

  await click('Editor Visual');
  await wait("document.querySelector('iframe')?.contentDocument?.querySelector('h1') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Un mundo de ideas'))", 'editor document and text control loaded');
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Un mundo de ideas')).click()");
  await wait("document.querySelector('iframe').contentDocument.querySelector('h1')?.isContentEditable", 'existing visual editor activates title editing');
  await evaluate("(()=>{const doc=document.querySelector('iframe').contentDocument;const el=doc.querySelector('h1');el.focus();el.textContent='Texto editado con pieza intacta';el.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));el.blur();})()");
  await wait("!document.querySelector('iframe').contentDocument?.querySelector('[contenteditable=true]')", 'inline edit committed');
  await click('Guardar');
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Editor Visual') && ${deck}[1].html.includes('Texto editado con pieza intacta')`, 'visual text saved through real Page');
  const edited = await evaluate(deck);
  assert.equal(edited[1].mounted_assets.length, 1);
  assert.deepEqual(edited[1].mounted_assets[0].asset, duplicated[1].mounted_assets[0].asset);
  assert.equal(edited[1].revision, 2);
  checks.push('real visual editor changes text and saves while preserving mounted pixels, asset version and revision');

  const manifestChecks = await evaluate(`(async()=>{
    const {serializeMountedImages,reconcileMountedAssets,detachUnverifiedMountedImages}=await import('/src/lib/presentations/presentationManifest.ts');
    const {sanitizePresentationHtml}=await import('/src/lib/presentations/presentationHtml.ts');
    const slide=${deck}[1]; const d=new DOMParser().parseFromString(slide.html,'text/html');
    const img=d.querySelector('img[data-asset-id]');img.style.left='125px';img.style.top='80px';img.style.width='200px';img.style.height='100px';
    const clone=img.cloneNode(true);clone.dataset.eid='copied-image';clone.style.left='400px';img.after(clone);
    const next=d.documentElement.outerHTML;const frame=document.createElement('iframe');frame.width='800';frame.height='450';frame.setAttribute('sandbox','allow-same-origin');frame.srcdoc=sanitizePresentationHtml(next);
    await new Promise(resolve=>{frame.onload=resolve;document.body.appendChild(frame)});
    const serialized=serializeMountedImages(slide.html,next,frame.contentDocument,{width:800,height:450});
    const mounted=reconcileMountedAssets(slide,serialized);frame.remove();
    const altered=next.replace(img.getAttribute('src'),'data:image/png;base64,AAAA');
    const detached=detachUnverifiedMountedImages(slide.html,altered);
    const copyOnly=detachUnverifiedMountedImages(slide.html,slide.html.replace('Texto editado con pieza intacta','Otro texto'));
    return{count:mounted.length,region:mounted[0]?.region,cloneX:mounted[1]?.region.x,detached:reconcileMountedAssets(slide,detached).length,copy:reconcileMountedAssets(slide,copyOnly).length,
      idempotent:sanitizePresentationHtml(slide.html)===sanitizePresentationHtml(sanitizePresentationHtml(slide.html)),cta:sanitizePresentationHtml('<button class="cta-btn">Acción</button>').includes('class="cta-btn"')};
  })()`);
  assert.equal(manifestChecks.count,2);assert.deepEqual(manifestChecks.region,{x:125,y:80,width:200,height:100});
  assert.equal(manifestChecks.cloneX,400);assert.equal(manifestChecks.detached,0);assert.equal(manifestChecks.copy,1);
  assert.equal(manifestChecks.idempotent,true);assert.equal(manifestChecks.cta,true);
  checks.push('rendered geometry and clones reconcile; replacement/layout changes detach lineage; copy, CTA and sanitizer idempotence survive');

  // Integrated server flow: real HTTP + PostgreSQL CAS, simulated Auth/Storage/provider.
  const control = async query => {
    const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
      method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
    });
    assert.equal(response.status, 200); return response.json();
  };
  const attachCapture = async encoded => {
    await evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0));
      const transfer=new DataTransfer();transfer.items.add(new File([bytes],'captura-del-slide.png',{type:'image/png'}));
      const input=document.querySelector('.sdp-capture');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  const setBrief = async value => evaluate(`(()=>{const input=document.querySelector('.sdp-field textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(value)});
    input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const captureCurrent = async () => {
    const clip = await evaluate("(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()");
    return (await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true }, sessionId)).data;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await delay(200);
  const capture = await captureCurrent();
  const beforeServerDeck = await evaluate(deck);
  await control('pause=true&lose_upload=true');
  await click('Crear pieza de prueba');
  await wait("!!document.querySelector('.sdp-dialog') && !document.body.innerText.includes('Conectando con tus trabajos')");
  await setBrief('Un avión para la zona marcada, conservando el título y los textos.');
  await attachCapture(capture);
  await wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Generar muestra'&&!b.disabled)");
  await evaluate("(()=>{const b=Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Generar muestra');b.click();b.click()})()");
  await wait("document.querySelector('.sdp-dialog [role=alert]')?.textContent.includes('No se confirmó la captura')");
  const lostUpload = await control();
  assert.equal(lostUpload.objects, 1); assert.equal(lostUpload.audits.filter(event => event.event === 'asset_imported').length, 1);
  await control('pause=true&lose_enqueue=true');
  await click('Generar muestra');
  await wait("document.querySelector('.sdp-dialog [role=alert]')?.textContent.includes('No llegó la confirmación')", 'ambiguous enqueue response retained');
  const afterLost = await control();
  assert.equal(afterLost.audits.filter(event => event.event === 'job_enqueued').length, 1);
  assert.equal(afterLost.simulated_dispatches, 0);
  assert.equal(afterLost.objects, 1); assert.equal(afterLost.audits.filter(event => event.event === 'asset_imported').length, 1);
  assert.deepEqual(await evaluate(deck), beforeServerDeck);
  await send('Page.reload', { ignoreCache: true }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza de prueba')");
  // Reload opens the first slide; return to the same stable target slide.
  await click('Siguiente');
  await click('Crear pieza de prueba');
  await wait("document.querySelector('.sdp-status')?.textContent==='Solicitud guardada'", 'saved request recovered from SQL after reload');
  assert.equal((await control()).audits.filter(event => event.event === 'job_enqueued').length, 1);
  checks.push('double click plus lost HTTP acknowledgement stores one SQL job; reload recovers the same target and key without dispatch');

  await control('pause=false');
  await wait("document.querySelector('.sdp-status')?.textContent==='Borrador listo para elegir dirección'", 'worker PNG validated and returned through HTTP');
  await wait("new DOMParser().parseFromString(document.querySelector('.sdp-preview iframe').srcdoc,'text/html').querySelectorAll('img[data-asset-id]').length===2");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.includes('Montar pieza aprobada')).disabled"), true);
  assert.deepEqual(await evaluate(deck), beforeServerDeck);
  await screenshot('server-draft-desktop');
  const afterGeneration = await control();
  assert.equal(afterGeneration.simulated_dispatches, 1); assert.equal(afterGeneration.references_read, 1);
  assert.equal(afterGeneration.real_provider_calls, 0); assert.deepEqual(afterGeneration.worker_errors, []);
  await evaluate("(()=>{const b=Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Aprobar dirección');b.click();b.click()})()");
  await wait("document.querySelector('.sdp-status')?.textContent==='Dirección aprobada'");
  const afterDirection = await control();
  assert.equal(afterDirection.simulated_dispatches, 1);
  assert.equal(afterDirection.audits.filter(event => event.event === 'direction_approved').length, 1);
  assert.equal(afterDirection.audits.filter(event => event.event === 'output_reviewed').length, 0);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.includes('Montar pieza aprobada')).disabled"), true);
  assert.deepEqual(await evaluate(deck), beforeServerDeck);
  checks.push('approving a low direction records one approval without generation, final review, HTML changes or mounting permission');

  await control('quota=1');
  await click('Generar versión en media');
  await wait("document.querySelector('.sdp-dialog [role=alert]')?.textContent.includes('No hay cuota disponible')", 'medium quota rejection is explicit');
  assert.equal(await evaluate("document.querySelector('.sdp-status')?.textContent"), 'Dirección aprobada');
  assert.equal((await control()).audits.filter(event => event.event === 'job_enqueued').length, 1);
  assert.equal((await control()).simulated_dispatches, 1);
  checks.push('a definitive medium quota rejection preserves the approved draft for an explicit later request');

  await control('quota=20&pause=true&lose_enqueue=true');
  await evaluate("(()=>{const b=Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Generar versión en media');b.click();b.click()})()");
  await wait("document.querySelector('.sdp-dialog [role=alert]')?.textContent.includes('No llegó la confirmación')", 'medium enqueue acknowledgement lost after SQL commit');
  assert.equal((await control()).audits.filter(event => event.event === 'job_enqueued').length, 2);
  assert.equal((await control()).simulated_dispatches, 1);
  await send('Page.reload', { ignoreCache: true }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza de prueba')");
  await click('Siguiente'); await click('Crear pieza de prueba');
  await wait("document.querySelector('.sdp-status')?.textContent==='Solicitud guardada'", 'exact medium request restored after reload');
  await control('pause=false');
  await wait("document.querySelector('.sdp-status')?.textContent==='Versión en media lista para revisar'", 'medium output needs its own final review');
  const afterMedium = await control();
  assert.equal(afterMedium.simulated_dispatches, 2); assert.equal(afterMedium.references_read, 3);
  assert.equal(afterMedium.real_provider_calls, 0); assert.deepEqual(afterMedium.worker_errors, []);
  const mediumState = await evaluate('(async()=>window.__presentationHarness.designClient.read(window.__presentationHarness.businessId))()');
  const lowJob = mediumState.state.jobs.jobs[0], mediumJob = mediumState.state.jobs.jobs[1];
  const lowAsset = lowJob.calls[0].receipt.outputs[0].asset, mediumAsset = mediumJob.calls[0].receipt.outputs[0].asset;
  assert.equal(mediumJob.plan.operation.action, 'generate_medium');
  assert.equal(mediumJob.plan.operation.image.quality, 'medium');
  assert.deepEqual(mediumJob.plan.operation.context.base_asset, lowAsset);
  for (const key of ['target', 'references', 'placement', 'instruction', 'immutable_elements']) {
    assert.deepEqual(mediumJob.plan.operation.context[key], lowJob.plan.operation.context[key]);
  }
  assert.equal(mediumAsset.asset_id, lowAsset.asset_id); assert.notEqual(mediumAsset.version_id, lowAsset.version_id);
  const mediumVersion = mediumState.state.assets.versions.find(v => v.identity.version_id === mediumAsset.version_id);
  assert.deepEqual(mediumVersion.provenance.parent, lowAsset);
  assert.equal(mediumVersion.provenance.direction_approval_id, mediumState.state.assets.direction_approvals[0].approval_id);
  assert.equal(lowJob.calls[0].state, 'needs_review'); assert.equal(mediumJob.calls[0].state, 'needs_review');
  assert.deepEqual(mediumState.state.assets.reviews, []); assert.deepEqual(await evaluate(deck), beforeServerDeck);
  const visibleVersion = "new DOMParser().parseFromString(document.querySelector('.sdp-preview iframe').srcdoc,'text/html').querySelector('img[data-eid=server-piece-preview]')?.dataset.assetVersion";
  await wait(`${visibleVersion}===${JSON.stringify(mediumAsset.version_id)}`);
  await click('Ver borrador aprobado');
  await wait(`${visibleVersion}===${JSON.stringify(lowAsset.version_id)}`, 'comparison displays exact approved low pixels');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Aprobar versión final').disabled"), true);
  await click('Ver versión en media');
  await wait(`${visibleVersion}===${JSON.stringify(mediumAsset.version_id)}`, 'comparison returns to medium before final review');
  await screenshot('server-review-desktop');
  await click('Aprobar versión final');
  await wait("document.querySelector('.sdp-status')?.textContent==='Versión final aprobada'");
  assert.deepEqual(await evaluate(deck), beforeServerDeck);
  await click('Montar pieza aprobada');
  await wait(`!document.querySelector('.sdp-dialog') && ${deck}[1].mounted_assets.length===2`, 'approved server image mounted');
  const serverMounted = await evaluate(deck);
  assert.equal(serverMounted[1].revision, beforeServerDeck[1].revision + 1);
  assert.match(serverMounted[1].html, /Texto editado con pieza intacta/);
  assert.deepEqual(serverMounted[0], beforeServerDeck[0]); assert.deepEqual(serverMounted[2], beforeServerDeck[2]);
  checks.push('explicit medium request survives lost acknowledgement and reload; worker reads exact low and capture, preserves lineage, and comparison precedes final review and mount');

  await click('Siguiente');
  await click('Crear pieza de prueba');
  await wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Usar pieza guardada 1')");
  await click('Usar pieza guardada 1');
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
  await wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Montar pieza aprobada'&&!b.disabled)");
  await screenshot('server-reuse-tablet');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await click('Montar pieza aprobada');
  await wait(`${deck}[2].mounted_assets?.length===1 && !document.querySelector('.sdp-dialog')`);
  const reusedDeck = await evaluate(deck);
  assert.deepEqual(reusedDeck[2].mounted_assets[0].asset, serverMounted[1].mounted_assets[1].asset);
  assert.equal((await control()).simulated_dispatches, 2);
  await evaluate(`window.__serverExport=null;const original=HTMLAnchorElement.prototype.click;
    window.__restoreServerAnchor=()=>HTMLAnchorElement.prototype.click=original;
    HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:'))fetch(this.href).then(r=>r.text()).then(html=>window.__serverExport=html);else original.call(this)}`);
  await click('Exportar Todo'); await wait("typeof window.__serverExport==='string'");
  const serverFrames = await evaluate("Array.from(new DOMParser().parseFromString(window.__serverExport,'text/html').querySelectorAll('iframe')).map(f=>f.srcdoc)");
  assert.deepEqual(serverFrames, reusedDeck.map(slide => slide.html));
  await writeFile(path.join(artifacts, 'presentations-server-export.html'), await evaluate('window.__serverExport'));
  await evaluate('window.__restoreServerAnchor()');
  checks.push('approved private version reused on another slide and exact active deck exported without another simulation');

  // A second explicit request can fail after dispatch; recovery must keep it uncertain.
  const secondCapture = await captureCurrent();
  await click('Crear pieza de prueba');
  await wait("!!document.querySelector('.sdp-dialog') && !document.body.innerText.includes('Conectando con tus trabajos')");
  await wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Recuperar estado'&&!b.disabled)");
  // Change quota after the panel's read, exercising a genuine stale-capability
  // rejection. A fresh read now correctly disables generation before upload.
  await control('quota=1');
  await setBrief('Otra pieza para comprobar la recuperación de un fallo.'); await attachCapture(secondCapture);
  await click('Generar muestra');
  await wait("document.querySelector('.sdp-dialog [role=alert]')?.textContent.includes('No hay cuota disponible')");
  assert.equal(await evaluate("document.querySelector('.sdp-field textarea').disabled"), false);
  assert.equal((await control()).audits.filter(event => event.event === 'job_enqueued').length, 2);
  await control('quota=20&fail_provider=true');
  await click('Generar muestra');
  await wait("document.querySelector('.sdp-status')?.textContent.includes('Resultado pendiente de conciliación')");
  await click('Recuperar estado');
  await wait("!document.querySelector('.sdp-dialog').getAttribute('aria-busy').includes('true')");
  const finalServer = await control();
  assert.equal(finalServer.simulated_dispatches, 3); assert.equal(finalServer.real_provider_calls, 0);
  assert.equal(finalServer.audits.filter(event => event.event === 'job_enqueued').length, 3);
  assert.deepEqual(await evaluate(deck), reusedDeck);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent==='Nueva pieza').disabled"), true);
  const own = await evaluate('(async()=>window.__presentationHarness.designClient.read(window.__presentationHarness.businessId))()');
  const failedCall = own.state.jobs.jobs.at(-1).calls[0];
  assert.equal(failedCall.state, 'uncertain'); assert.equal(failedCall.reserved_micro_usd, 100); assert.equal(failedCall.settlement, null);
  await wait("!!document.querySelector('[aria-label=\"Cerrar creación de pieza\"]') && !document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').disabled", 'piece panel ready to close');
  await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()");
  await wait("!document.querySelector('.sdp-dialog')", 'piece draft flushed and panel closed');
  checks.push('uncertain simulation retains reservation and does not replay on recovery; deck remains unchanged');
  checks.push('definitive SQL quota rejection unlocks the brief; reference upload is reused when the user explicitly submits again');

  // Existing low/medium results from a different document remain reviewable while
  // generation is paused. Fixture setup dispatches only the deterministic simulator.
  const seededCover = await control('seed_cover_results=true');
  const cover = seededCover.cover_fixture;
  assert(cover); assert.equal(cover.target.document_type, 'cover');
  assert.notEqual(cover.target.document_id, failedCall && own.state.jobs.jobs.at(-1).plan.operation.context.target.document_id);
  assert.equal(seededCover.simulated_dispatches, finalServer.simulated_dispatches + 3);
  assert.equal(seededCover.real_provider_calls, 0); assert.deepEqual(seededCover.worker_errors, []);
  const pausedState = await evaluate('(async()=>window.__presentationHarness.designClient.read(window.__presentationHarness.businessId))()');
  assert.equal(pausedState.enabled, false);
  const coverMediumJob = pausedState.state.jobs.jobs.find(job => job.operation_key === cover.medium_operation_key);
  assert.deepEqual(coverMediumJob.plan.operation.context.base_asset, cover.low);
  assert.deepEqual(coverMediumJob.plan.operation.context.target, cover.target);
  const beforeCoverDeck = await evaluate(deck);
  const resultSelector = asset => `[data-testid="server-result-${asset.version_id}"][data-asset-id="${asset.asset_id}"]`;
  const selectResult = async asset => {
    const selector = JSON.stringify(resultSelector(asset));
    await wait(`!!document.querySelector(${selector})&&!document.querySelector(${selector}).disabled`, 'cross-document result selectable');
    await evaluate(`document.querySelector(${selector}).click()`);
  };
  const previewIdentity = "(()=>{const image=new DOMParser().parseFromString(document.querySelector('.sdp-preview iframe').srcdoc,'text/html').querySelector('img[data-eid=server-piece-preview]');return image?{asset_id:image.dataset.assetId,version_id:image.dataset.assetVersion}:null})()";
  const waitForPreview = async asset => wait(`JSON.stringify(${previewIdentity})===${JSON.stringify(JSON.stringify({ asset_id: asset.asset_id, version_id: asset.version_id }))}`, 'exact selected result pixels displayed');
  await click('Crear pieza de prueba');
  await wait("!!document.querySelector('[data-testid=server-pending-results]')", 'pending results visible from another cover');
  await selectResult(cover.medium);
  await wait("!!document.querySelector('[data-testid=server-library-review]')", 'library review controls displayed');
  await waitForPreview(cover.medium);
  assert.match(await evaluate("document.querySelector('[data-testid=server-library-review]').textContent"), /Origen: Portada/);
  assert.equal(await evaluate("document.querySelector('textarea[aria-label=\"Encargo de la pieza seleccionada\"]').value"),
    coverMediumJob.plan.operation.context.instruction);
  assert.equal(await evaluate("document.querySelector('textarea[aria-label=\"Encargo de la pieza seleccionada\"]').readOnly"), true);
  assert.doesNotMatch(await evaluate("document.querySelector('[data-testid=server-library-review]').textContent"), /external-cover-document/);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(button=>button.textContent.trim()==='Montar pieza aprobada').disabled"), true);
  assert.deepEqual(await evaluate(deck), beforeCoverDeck);
  await click('Ver borrador aprobado'); await waitForPreview(cover.low);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(button=>button.textContent.trim()==='Aprobar versión final').disabled"), true);
  await click('Ver versión en media'); await waitForPreview(cover.medium);
  assert.equal((await control()).simulated_dispatches, seededCover.simulated_dispatches);
  await screenshot('cross-document-review-policy-off');
  await click('Aprobar versión final');
  await wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(button=>button.textContent.trim()==='Montar pieza aprobada'&&!button.disabled)", 'medium reviewed while policy is off');
  assert.deepEqual(await evaluate(deck), beforeCoverDeck);
  await click('Montar pieza aprobada');
  await wait(`!document.querySelector('.sdp-dialog') && ${deck}[2].mounted_assets.length===2`, 'external cover result mounted into current destination');
  const coverMountedDeck = await evaluate(deck);
  assert.equal(coverMountedDeck[2].revision, beforeCoverDeck[2].revision + 1);
  assert.deepEqual(coverMountedDeck[2].mounted_assets.at(-1).asset, cover.medium);
  assert.match(coverMountedDeck[2].html, /Segunda página activa/);
  assert.deepEqual(coverMountedDeck.slice(0, 2), beforeCoverDeck.slice(0, 2));
  const mountedRegion = coverMountedDeck[2].mounted_assets.at(-1).region;
  assert(mountedRegion.x + mountedRegion.width <= 800 && mountedRegion.y + mountedRegion.height <= 450);
  assert.notDeepEqual(mountedRegion, { x: 640, y: 580, width: 330, height: 300 });
  const afterCoverMount = await control();
  assert.equal(afterCoverMount.simulated_dispatches, seededCover.simulated_dispatches);
  assert.equal(afterCoverMount.audits.filter(event => event.event === 'output_reviewed').length, seededCover.audits.filter(event => event.event === 'output_reviewed').length + 1);
  assert.equal(afterCoverMount.audits.filter(event => event.event === 'job_enqueued').length, seededCover.audits.filter(event => event.event === 'job_enqueued').length);
  checks.push('paused generation still lists a pending medium from another cover; exact low comparison and final approval add no dispatch and mount preserves current slide text and geometry');

  await click('Crear pieza de prueba'); await selectResult(cover.rejectedCandidate);
  await waitForPreview(cover.rejectedCandidate);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-testid=server-library-review] button')).some(button=>button.textContent.trim()==='Aprobar versión final')"), false);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-testid=server-library-review] button')).some(button=>button.textContent.trim()==='Generar versión en media')"), false);
  await click('Rechazar pieza');
  await wait(`!document.querySelector('[data-testid=server-pending-results] ${resultSelector(cover.rejectedCandidate)}')`, 'rejected result removed from pending results');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(button=>button.textContent.trim()==='Montar pieza aprobada').disabled"), true);
  assert.deepEqual(await evaluate(deck), coverMountedDeck);
  const rejectedState = await evaluate('(async()=>window.__presentationHarness.designClient.read(window.__presentationHarness.businessId))()');
  assert.equal(rejectedState.enabled, false);
  const rejectedJob = rejectedState.state.jobs.jobs.find(job => job.operation_key === cover.rejected_operation_key);
  assert.equal(rejectedJob.calls[0].state, 'rejected');
  assert.equal(rejectedState.state.assets.reviews.find(review => review.asset.asset_id === cover.rejectedCandidate.asset_id && review.asset.version_id === cover.rejectedCandidate.version_id).decision, 'rejected');
  const deniedOtherBusiness = await evaluate(`(async()=>{
    const harness=window.__presentationHarness, asset=${JSON.stringify(cover.medium)}, result={};
    for(const [name,action] of Object.entries({
      read:()=>harness.designClient.read(harness.otherBusinessId),
      asset:()=>harness.designClient.asset({...asset,business_id:harness.otherBusinessId}),
      review:()=>harness.designClient.command(harness.otherBusinessId,{kind:'review',operation_key:${JSON.stringify(cover.medium_operation_key)},call_key:${JSON.stringify(coverMediumJob.calls[0].call_key)},decision:'approved'})
    })){try{await action();result[name]={allowed:true}}catch(error){result[name]={code:error.code,status:error.httpStatus}}}
    return result;
  })()`);
  for (const outcome of Object.values(deniedOtherBusiness)) assert.deepEqual(outcome, { code: 'business_access_denied', status: 403 });
  await wait("!!document.querySelector('[aria-label=\"Cerrar creación de pieza\"]') && !document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').disabled", 'review panel ready to close');
  await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()");
  await wait("!document.querySelector('.sdp-dialog')", 'review draft flushed before reopening');
  await click('Crear pieza de prueba');
  await wait("!!document.querySelector('[data-testid=server-pending-results]') && Array.from(document.querySelectorAll('.sdp-dialog button')).some(button=>button.textContent.trim()==='Recuperar estado'&&!button.disabled)", 'reopened library has finished loading saved reviews');
  assert.equal(await evaluate(`!!document.querySelector('.sdp-library ${resultSelector(cover.rejectedCandidate)}')`), false);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-library button')).filter(button=>button.textContent.trim().startsWith('Usar pieza guardada ')).length"),
    rejectedState.state.assets.reviews.filter(review => review.decision === 'approved').length);
  await screenshot('cross-document-reusable-policy-off');
  await wait("!!document.querySelector('[aria-label=\"Cerrar creación de pieza\"]') && !document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').disabled", 'reopened library ready to close');
  await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()");
  await wait("!document.querySelector('.sdp-dialog')", 'library draft flushed and panel closed');
  const finalReviewServer = await control();
  assert.equal(finalReviewServer.simulated_dispatches, seededCover.simulated_dispatches);
  assert.equal(finalReviewServer.real_provider_calls, 0); assert.deepEqual(finalReviewServer.worker_errors, []);
  assert.equal(finalReviewServer.audits.filter(event => event.event === 'output_reviewed').length, seededCover.audits.filter(event => event.event === 'output_reviewed').length + 2);
  checks.push('rejecting another cover draft while paused removes it from pending and reusable results without mounting or dispatch; foreign-business reads, pixels and reviews are denied');

  const cloudCalls = await evaluate('window.__presentationHarness.cloudCalls');
  assert(cloudCalls.length > 0 && cloudCalls.every(call => call.kind === 'read' && call.target === 'presentations'));
  const exceptions = events.filter(event => event.method === 'Runtime.exceptionThrown' || event.method === 'Test.interceptionError');
  assert.deepEqual(exceptions, []);
  assert.deepEqual(blocked, []);
  const remote = events.filter(event => event.method === 'Network.requestWillBeSent').map(event => event.params.request.url)
    .filter(url => /^https?:/.test(url) && new URL(url).origin !== base);
  assert.deepEqual(remote, []);
  checks.push('zero external HTTP attempts, provider calls, cloud writes or unhandled browser exceptions');
  const result = { success: true, checks, actual_provider_calls: 0, simulated_dispatches: finalReviewServer.simulated_dispatches,
    sql_audits: finalReviewServer.audits.length, mocked_cloud_reads: cloudCalls.length, artifacts };
  await writeFile(path.join(artifacts, 'presentations-smoke-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (main) {
    await main.screenshot('failure').catch(() => {});
    console.error(await main.evaluate('document.body.innerText').catch(() => 'Could not read failed page'));
  }
  console.error(error);
  console.error(JSON.stringify({ blocked, exceptions: events.filter(event => event.method === 'Runtime.exceptionThrown') }, null, 2));
  process.exitCode = 1;
} finally {
  if (send) await send('Browser.close').catch(() => {});
  socket?.close(); browser?.kill(); server?.kill();
}
