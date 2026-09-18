/** Real workspace UI against isolated local SQL/provider/cloud fixtures; all remote browser requests are blocked. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3018', entry = `${base}/free-design`;
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], blocked = [], errors = [], requests = [], failedResponses = [];
let server, browser, socket, evaluate, screenshot;
try {
  const available = () => fetch(`${base}/experiments/presentations/`).then(r => r.ok).catch(() => false);
  if (!await available()) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.workspace-test.config.ts'], { windowsHide: true, stdio: 'ignore' });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !await available()) await delay(150);
    assert(await available(), 'The local workspace fixture starts');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'workspace-browser-'));
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
      else if (request.method !== 'GET') requests.push({ method: request.method, path: new URL(request.url).pathname });
      void send(remote ? 'Fetch.failRequest' : 'Fetch.continueRequest', remote ? { requestId, errorReason: 'BlockedByClient' } : { requestId }, message.sessionId).catch(error => errors.push(error.message));
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) failedResponses.push({ url: message.params.response.url, status: message.params.response.status });
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId); await send('Network.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] }, sessionId);
  const resize = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await resize(1440, 1100);
  evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, label = expression) => {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timeout: ${label}`);
  };
  const button = (label, root = 'document') => `Array.from(${root}.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;
  const click = async (label, root = 'document') => { await wait(`!!(${button(label, root)})`, `button ${label}`); await evaluate(`${button(label, root)}.click()`); };
  const setValue = async (selector, value) => {
    await wait(`document.querySelector(${JSON.stringify(selector)})?.disabled===false`, `editable input ${selector}`);
    return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing input');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  };
  const text = (label, value) => setValue(`textarea[aria-label="${label}"]`, value);
  screenshot = async name => { await delay(500); const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(path.join(artifacts, `workspace-${name}.png`), Buffer.from(shot.data, 'base64')); };
  const control = async query => { const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
    method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
  }); assert.equal(response.status, 200); return response.json(); };
  const read = () => evaluate('window.__presentationHarness.designClient.read(window.__presentationHarness.businessId)');
  const workspace = () => evaluate(`(async()=>{const {openFreeDesignStore}=await import('/src/lib/desaing/freeDesignStore.ts');const h=window.__presentationHarness;
    const s=await openFreeDesignStore({actor_id:(await h.designClient.session()).actorId,business_id:h.businessId});try{return(await s.read()).value}finally{s.close()}})()`);
  const selected = async () => { const value = await workspace(); return value.documents.find(doc => doc.id === value.selected_id); };
  const ready = () => wait("!!window.__presentationHarness && document.querySelector('.fd-page')?.getAttribute('aria-busy')==='false'");
  const closeImage = async () => { await wait("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]')?.disabled===false"); await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()"); await wait("!document.querySelector('.sdp-dialog')"); };
  const openDesign = async () => { await click('Diseñar con IA'); await wait("!!document.querySelector('.sdp-dialog') && Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Generar borrador'&&!b.disabled)"); };
  const create = async (name, kind, format = 'horizontal') => {
    if (!await evaluate("!!document.querySelector('.fd-create')")) await click('Nuevo diseño');
    await setValue('[aria-label="Nombre del diseño"]', name); await setValue('[aria-label="Tipo de diseño"]', kind); await setValue('[aria-label="Formato del lienzo"]', format);
    await click('Crear lienzo'); await wait("!document.querySelector('.fd-create') && document.querySelector('.fd-page').getAttribute('aria-busy')==='false'");
    return selected();
  };
  const composition = target => evaluate(`(async()=>{const {openCompositionStore}=await import('/src/lib/presentations/compositionStore.ts');const {htmlCompositionSessionId}=await import('/supabase/functions/_shared/desaing/composition.ts');const h=window.__presentationHarness;
    const s=await openCompositionStore({actor:(await h.designClient.session()).actorId,business:h.businessId,session:htmlCompositionSessionId(${JSON.stringify(target)})});try{const r=await s.read();return r?{...r,value:{...r.value,source:r.value.source?{...r.value.source,blob:null}:null}}:null}finally{s.close()}})()`);
  const library = () => evaluate("(async()=>{const m=await import('/src/lib/presentations/presentationAssets.ts');return(await m.listPresentationAssets(window.__presentationHarness.businessId)).map(x=>x.version)})()");
  const deckDraft = doc => evaluate(`(async()=>{const {openDeckComposerStore}=await import('/src/lib/presentations/deckComposerStore.ts');const h=window.__presentationHarness;const s=await openDeckComposerStore({actor:(await h.designClient.session()).actorId,business:h.businessId,document:${JSON.stringify(doc.id)},source:${JSON.stringify(doc.canvas.id)}});try{return await s.read()}finally{s.close()}})()`);

  await send('Page.navigate', { url: entry }, sessionId); await ready();
  assert.equal((await control()).adapter_requests.length, 0, 'Run against a fresh 3018 fixture');
  const originalPresentationDraft = await evaluate('localStorage.getItem(window.__presentationHarness.draftKey)');
  const cover = await create('Portada de marca reutilizable', 'cover');
  const brief = 'Portada editorial con un mundo a la derecha, tonos verdes y texto legible separado del dibujo.';
  const approvedCopy = 'Un mundo de ideas <propias>\nMarca compartida · US$5\nTexto aprobado literalmente.';
  await text('Idea del diseño', brief); await text('Texto del diseño libre', approvedCopy); await openDesign();
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Texto aprobado\"]').value"), approvedCopy);
  assert.equal(await evaluate("document.querySelector('.sdp-capture').files.length"), 0);
  await closeImage(); await send('Page.reload', {}, sessionId); await ready(); await openDesign();
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Descripción de la pieza\"]').value"), brief);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Texto aprobado\"]').value"), approvedCopy);
  assert.equal(requests.filter(r => r.path.endsWith('/assets/upload')).length, 0);
  assert.equal((await control()).adapter_requests.length, 0);
  checks.push('Standalone cover, literal copy and full-design scope survive close/reload with no capture, upload or provider call');

  await click('Generar borrador'); await wait("document.querySelector('.sdp-status')?.textContent==='Borrador listo para elegir dirección'");
  const lowState = await read(), low = lowState.state.jobs.jobs.at(-1), lowIdentity = low.calls[0].receipt.outputs[0].asset;
  const lowContext = low.plan.operation.context;
  assert.equal(lowContext.workspace, 'free_design'); assert.equal(lowContext.brand_id, 'free-design');
  assert.deepEqual(lowContext.target, { document_type: 'cover', document_id: cover.id, page_id: cover.canvas.id, revision: '1' });
  assert.equal(lowContext.session_id, `free_design:cover:${cover.id}:${cover.canvas.id}:full_design`);
  assert.deepEqual(lowContext.references, []); assert.equal(lowContext.placement, undefined);
  assert(lowContext.immutable_elements.includes(`Texto aprobado, conservar literalmente:\n${approvedCopy}`));
  assert.equal((await control()).adapter_requests[0].input_images, 0);
  assert.match((await control()).adapter_requests[0].route, /\/images\/generations$/);
  assert.equal(requests.filter(r => r.path.endsWith('/assets/upload')).length, 0);
  assert.equal((await selected()).canvas.html, cover.canvas.html);
  checks.push('Text-only low uses the real free cover/page identity and zero input images; current canvas and presentation draft remain unchanged');

  await click('Aprobar dirección'); await wait("document.querySelector('.sdp-status')?.textContent==='Dirección aprobada'");
  assert.equal((await control()).adapter_requests.length, 1);
  await click('Generar versión en media'); await wait("document.querySelector('.sdp-status')?.textContent==='Versión en media lista para revisar'");
  const mediumState = await read(), medium = mediumState.state.jobs.jobs.at(-1), mediumIdentity = medium.calls[0].receipt.outputs[0].asset;
  assert.deepEqual(medium.plan.operation.context.base_asset, lowIdentity);
  assert.deepEqual(medium.plan.operation.context.target, lowContext.target);
  assert.deepEqual(medium.plan.operation.context.immutable_elements, lowContext.immutable_elements);
  assert.equal((await control()).adapter_requests[1].input_images, 1);
  await click('Aprobar versión final'); await wait("document.querySelector('.sdp-status')?.textContent==='Versión final aprobada'");
  await click('Usar diseño para HTML', "document.querySelector('.sdp-dialog')");
  await wait("document.querySelector('.hcp-dialog')?.getAttribute('aria-busy')==='false' && !!document.querySelector('img[alt=\"Diseño elegido como referencia\"]')");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Contenido aprobado para HTML\"]').value"), approvedCopy);
  assert.deepEqual((await composition(lowContext.target)).value.source.version.identity, mediumIdentity);
  assert.equal((await control()).html_requests.length, 0);
  await evaluate("document.querySelector('.hcp-confirm input').click()"); await click('Crear HTML editable');
  await wait("document.querySelectorAll('[data-testid=composition-slot]').length===2 && document.querySelector('.hcp-dialog').getAttribute('aria-busy')==='false'");
  const htmlDraft = await composition(lowContext.target);
  assert.deepEqual(htmlDraft.value.request.design_reference, mediumIdentity);
  assert.equal(htmlDraft.value.request.context.workspace, 'free_design');
  assert.deepEqual(htmlDraft.value.request.context.target, lowContext.target);
  assert.deepEqual((await control()).html_requests[0].dimensions, { width: 1536, height: 864 });
  assert.deepEqual((await control()).html_requests[0].copy.map(block => block.text), approvedCopy.split('\n'));
  assert.equal((await control()).html_requests[0].image_tools, 0);
  await screenshot('desktop-html-review');
  checks.push('Explicit direction/medium/final review preserves parent and literal copy; HTML conversion reads approved 1536x864 pixels with no image tool');

  await click('Extraer del diseño', "document.querySelector('[data-slot-id=hero_piece]')");
  for (const [label, value] of [['Recorte izquierda', 800], ['Recorte arriba', 100], ['Recorte ancho', 500], ['Recorte alto', 600]]) await setValue(`[aria-label="${label}"]`, value);
  await click('Revisar extracción'); await wait("!!document.querySelector('[data-testid=manual-extraction-review] img')"); await click('Guardar pieza revisada');
  await wait("!document.querySelector('[data-testid=manual-extraction]') && document.querySelector('[data-slot-id=hero_piece]').innerText.includes('Elección guardada')");
  const versions = await library(), piece = versions.find(v => v.provenance.kind === 'pixel_extraction');
  assert(piece); const source = versions.find(v => v.identity.asset_id === piece.provenance.source.asset_id);
  assert(source); assert.equal(piece.storage.width, 500); assert.equal(piece.storage.height, 600);
  const localIndex = versions.findIndex(v => v.identity.asset_id === piece.identity.asset_id);
  await setValue('[aria-label="Pieza para Detalle decorativo"]', `local:${localIndex}`);
  await wait("document.querySelector('[data-slot-id=small_piece]').innerText.includes('Elección guardada') && document.querySelector('.hcp-dialog').getAttribute('aria-busy')==='false'");
  const reused = await composition(lowContext.target);
  assert.equal(JSON.stringify(reused.value.bindings.small_piece).includes(piece.identity.version_id), true);
  await click('Omitir esta pieza', "document.querySelector('[data-slot-id=small_piece]')");
  await wait("document.querySelector('.hcp-dialog').getAttribute('aria-busy')==='false'");
  await resize(820, 1180); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await screenshot('tablet-html-reviewed');
  await click('Aplicar HTML revisado'); await wait("!document.querySelector('.hcp-dialog') && document.querySelector('.fd-page').getAttribute('aria-busy')==='false'");
  const applied = await selected();
  assert.equal(applied.id, cover.id); assert.equal(applied.canvas.revision, 2);
  assert.deepEqual(applied.canvas.mounted_assets.map(asset => asset.asset), [piece.identity]);
  assert.equal(await evaluate(`new DOMParser().parseFromString(${JSON.stringify(applied.canvas.html)},'text/html').querySelector('h1').textContent`), approvedCopy.split('\n')[0]);
  assert.equal((await control()).adapter_requests.length, 2); assert.equal((await control()).html_requests.length, 1);
  assert.equal(await evaluate('localStorage.getItem(window.__presentationHarness.draftKey)'), originalPresentationDraft);
  checks.push('Actual crop pixels retain source lineage; library reuse and explicit omission resolve slots before applying editable HTML only to the free document');

  await send('Page.reload', {}, sessionId); await ready(); assert.deepEqual(await selected(), applied);
  await evaluate("window.__workspaceDownloads=[];window.__downloadClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__workspaceDownloads.push({name:this.download,href:this.href});return}return window.__downloadClick.call(this)}");
  await click('Descargar HTML'); await wait('window.__workspaceDownloads.length===1');
  const exportedHtml = await evaluate('fetch(window.__workspaceDownloads[0].href).then(r=>r.text())');
  await click('Exportar respaldo'); await wait('window.__workspaceDownloads.length===2');
  const exported = await evaluate('fetch(window.__workspaceDownloads[1].href).then(r=>r.json())');
  const expectedExport = await evaluate(`(async()=>{const {sanitizePresentationHtml}=await import('/src/lib/presentations/presentationHtml.ts');return sanitizePresentationHtml(${JSON.stringify(applied.canvas.html)})})()`);
  assert.equal(exportedHtml === expectedExport, true, 'Download preserves the sanitized canvas, embedded pixels and copy'); assert.deepEqual(exported, applied);
  assert.equal((await control()).adapter_requests.length, 2); assert.equal((await control()).html_requests.length, 1);
  await screenshot('tablet-free-canvas'); await resize(1440, 1100);
  checks.push('Saved HTML, exact mounted asset identity and standalone backup survive reload/export without any additional AI request');

  // Delay the actual File.text read: an already completed IndexedDB save must not unlock the importing workspace.
  await evaluate(`(()=>{const original=File.prototype.text;window.__workspaceFileText=original;File.prototype.text=function(){const file=this;if(file.name==='slow-workspace.json')return new Promise(resolve=>{window.__workspaceImportRelease=()=>resolve(original.call(file))});return original.call(file)};
    const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(exported))}],'slow-workspace.json',{type:'application/json'}));
    const input=document.querySelector('[aria-label="Importar diseño libre"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("typeof window.__workspaceImportRelease==='function'");
  assert.equal(await evaluate("document.querySelector('.fd-page').getAttribute('aria-busy')"), 'true');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.fd-toolbar button')).every(button=>button.disabled)"), true);
  assert.equal((await workspace()).documents.length, 1);
  await evaluate('window.__workspaceImportRelease();File.prototype.text=window.__workspaceFileText');
  await ready(); const imported = await selected();
  assert.notEqual(imported.id, applied.id); assert.notEqual(imported.canvas.id, applied.canvas.id);
  assert.equal(imported.canvas.html === expectedExport, true); assert.deepEqual(imported.canvas.mounted_assets, applied.canvas.mounted_assets);
  assert.deepEqual((await workspace()).documents.find(doc => doc.id === applied.id), applied);
  checks.push('A delayed backup read keeps the workspace locked; importing creates new document/canvas IDs and reuses exact existing pixels without overwriting the source');

  for (const [kind, name, format, executor, dimensions] of [
    ['page', 'Página independiente', 'vertical', 'image_api', { width: 1088, height: 1408 }],
    ['special', 'Diseño especial independiente', 'square', 'responses_image', { width: 1024, height: 1024 }],
  ]) {
    const doc = await create(name, kind, format); await text('Idea del diseño', `Diseña un ${kind} con identidad de marca compartida.`); await text('Texto del diseño libre', name);
    await control(`executor=${executor}`); await openDesign(); await click('Generar borrador');
    await wait("document.querySelector('.sdp-status')?.textContent==='Borrador listo para elegir dirección'");
    const job = (await read()).state.jobs.jobs.at(-1);
    assert.deepEqual(job.plan.operation.context.target, { document_type: kind, document_id: doc.id, page_id: doc.canvas.id, revision: '1' });
    assert.equal(job.plan.operation.context.workspace, 'free_design'); assert.equal(job.plan.operation.context.brand_id, 'free-design');
    assert.equal(job.plan.operation.context.session_id, `free_design:${kind}:${doc.id}:${doc.canvas.id}:full_design`);
    assert.deepEqual(job.plan.operation.image.size, dimensions); assert.equal((await control()).adapter_requests.at(-1).input_images, 0);
    if (executor === 'responses_image') assert.equal((await control()).adapter_requests.at(-1).max_tool_calls, 1);
    await closeImage();
  }
  assert.equal(requests.filter(r => r.path.endsWith('/assets/upload')).length, 0);
  assert.deepEqual((await workspace()).documents.find(doc => doc.id === cover.id), applied);
  checks.push('Page and special canvases keep independent page IDs/namespaces/aspects and shared brand; both real adapters accept text-only full-design requests');

  await evaluate(`Array.from(document.querySelectorAll('.fd-document')).find(b=>b.querySelector('strong')?.textContent===${JSON.stringify(cover.name)}).click()`); await ready();
  await wait(`document.querySelector('.fd-title h2')?.textContent===${JSON.stringify(cover.name)}`);
  const protectedProject = { id: 'adb0f1ca-cc2d-4338-bded-1241f91e8701', business_id: cover.business_id, name: 'Proyecto anterior protegido',
    slides: [0, 1].map(index => ({ ...structuredClone(applied.canvas), id: `old-protected-${index + 1}`, revision: 1 })) };
  await evaluate(`localStorage.setItem('workspace-test-cloud-v1',${JSON.stringify(JSON.stringify([protectedProject]))})`);
  await click('Crear presentación con este diseño'); await wait("!!document.querySelector('.dcp-fields textarea') && !document.querySelector('[aria-label=\"Cerrar creador de presentación\"]').disabled");
  await setValue('[aria-label="Nombre de la presentación nueva"]', 'Marca compartida · presentación revisada');
  await evaluate("document.querySelector('.dcp-check input').click()");
  await setValue('.dcp-fields textarea', 'Primera idea para la marca');
  await click('Aprobar esta diapositiva'); await wait("document.querySelector('.dcp-rows button[aria-current=page] small').textContent==='Revisada'");
  await setValue('.dcp-fields textarea', 'Primera idea ajustada literalmente');
  assert.equal(await evaluate("document.querySelector('.dcp-rows button[aria-current=page] small').textContent"), 'Por revisar');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Crear presentación revisada').disabled"), true);
  await click('Aprobar esta diapositiva');
  await wait("document.querySelectorAll('.dcp-rows button')[1]?.disabled===false");
  await evaluate("document.querySelectorAll('.dcp-rows button')[1].click()");
  await wait("document.querySelectorAll('.dcp-rows button')[1]?.getAttribute('aria-current')==='page'");
  await setValue('.dcp-fields textarea', 'Segunda idea con la misma pieza'); await click('Aprobar esta diapositiva');
  await wait("Array.from(document.querySelectorAll('.dcp-rows small')).every(e=>e.textContent==='Revisada')");
  await resize(820, 1180); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); await screenshot('tablet-deck-reviewed');
  const reviewedDraft = (await deckDraft(applied)).value;
  assert.equal(reviewedDraft.rows.length, 2); assert.deepEqual(reviewedDraft.template.mounted_assets, applied.canvas.mounted_assets);
  assert.equal((await control()).adapter_requests.length, 4); assert.equal((await control()).html_requests.length, 1);
  checks.push('Whole presentation reuses exact HTML/assets in two individually reviewed slides; editing approved copy invalidates that review with zero generation');

  await evaluate('window.__workspaceCloud.controls.failNextInsert=true'); await click('Crear presentación revisada');
  await wait("!!document.querySelector('.dcp-error') && Array.from(document.querySelectorAll('.dcp-dialog button')).some(b=>b.textContent.trim()==='Reintentar guardar presentación'&&!b.disabled)");
  const pendingDraft = (await deckDraft(applied)).value;
  assert.equal(pendingDraft.id, reviewedDraft.id); assert.equal(pendingDraft.publication.status, 'pending');
  assert.deepEqual(await evaluate('window.__workspaceCloud.read()'), [protectedProject]);
  assert.equal(await evaluate("document.querySelector('.dcp-fields textarea').disabled"), true);
  await evaluate("document.querySelector('[aria-label=\"Cerrar creador de presentación\"]').click()"); await wait("!document.querySelector('.dcp-dialog')");
  await send('Page.reload', {}, sessionId); await ready(); await click('Crear presentación con este diseño');
  await wait("Array.from(document.querySelectorAll('.dcp-dialog button')).some(b=>b.textContent.trim()==='Reintentar guardar presentación'&&!b.disabled)");
  assert.deepEqual((await deckDraft(applied)).value, pendingDraft);
  await evaluate('window.__workspaceCloud.controls.loseNextInsert=true'); await click('Reintentar guardar presentación');
  await wait("location.pathname==='/presentations' && !document.querySelector('.dcp-dialog')");
  const savedDeck = `JSON.parse(localStorage.getItem(${JSON.stringify(`xending-presentation-${pendingDraft.id}`)}))`;
  await wait(`${savedDeck}?.[0]?.id===${JSON.stringify(pendingDraft.rows[0].id)}`);
  const cloud = await evaluate('window.__workspaceCloud.read()'), savedProject = cloud.find(item => item.id === pendingDraft.id);
  assert.equal(cloud.length, 2); assert.deepEqual(cloud.find(item => item.id === protectedProject.id), protectedProject);
  assert(savedProject); assert.equal(savedProject.slides.length, 2);
  assert(savedProject.slides[0].html.includes('Primera idea ajustada literalmente')); assert(savedProject.slides[1].html.includes('Segunda idea con la misma pieza'));
  for (const slide of savedProject.slides) assert.deepEqual(slide.mounted_assets.map(asset => asset.asset), [piece.identity]);
  assert.equal((await deckDraft(applied)).value.publication.status, 'completed');
  assert.deepEqual((await workspace()).documents.find(doc => doc.id === cover.id), applied);
  checks.push('Failed cloud insert freezes and persists one draft UUID; reload plus lost-ack retry recovers exactly one new project without overwriting the old deck or source design');

  await resize(1440, 1100); await screenshot('desktop-created-presentation');
  await send('Page.reload', {}, sessionId);
  await wait(`!!window.__presentationHarness && ${savedDeck}?.[0]?.id===${JSON.stringify(pendingDraft.rows[0].id)}`);
  assert.deepEqual(await evaluate(savedDeck), savedProject.slides);
  await click('Crear presentación completa');
  await wait("!!document.querySelector('.dcp-fields textarea') && !document.querySelector('[aria-label=\"Cerrar creador de presentación\"]').disabled");
  const projectSource = { id: savedProject.id, canvas: savedProject.slides[0] }, beforeActorChange = await deckDraft(projectSource);
  await setValue('.dcp-fields textarea', 'Cambio pendiente que no debe guardarse con otra cuenta');
  await evaluate("window.__workspaceSession=window.__presentationHarness.designClient.session;window.__presentationHarness.designClient.session=async()=>({...await window.__workspaceSession(),actorId:'e1efb132-94ce-483a-a204-dce27c63b61c'});window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('.dcp-error')?.textContent.includes('Cambió tu sesión') && !document.querySelector('.dcp-fields') && !document.querySelector('.dcp-preview iframe')");
  await delay(400); // Let the cancelled autosave deadline pass before inspecting its former actor's store.
  await evaluate('window.__presentationHarness.designClient.session=window.__workspaceSession');
  assert.deepEqual(await deckDraft(projectSource), beforeActorChange);
  assert.deepEqual(await evaluate('window.__workspaceCloud.read()'), cloud);
  await wait("document.querySelector('[aria-label=\"Cerrar creador de presentación\"]')?.disabled===false");
  await evaluate("document.querySelector('[aria-label=\"Cerrar creador de presentación\"]').click()"); await wait("!document.querySelector('.dcp-dialog')");
  checks.push('Changing actor hides the old deck copy/preview and cancels pending autosave without changing its original local record or cloud project');
  const metrics = await control(), state = await read();
  assert.equal(metrics.adapter_requests.length, 4); assert.equal(metrics.html_requests.length, 1); assert.equal(metrics.planner_requests.length, 0);
  assert.equal(metrics.real_provider_calls, 0); assert.deepEqual(metrics.worker_errors, []); assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
  assert.equal(state.generation.remaining_outputs, 0);
  checks.push('Final presentation reload preserves editable copy and reused asset identities; four fake image calls plus one fake vision call, zero real providers or external requests');
  await writeFile(path.join(artifacts, 'workspace-smoke-result.json'), JSON.stringify({ ok: true, checks, metrics, cloud,
    requests, external_requests: blocked, exceptions: errors, documents: (await workspace()).documents.map(doc => ({ id: doc.id, kind: doc.kind, canvas_id: doc.canvas.id, revision: doc.canvas.revision })) }, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, simulated_image_calls: metrics.adapter_requests.length, simulated_vision_calls: metrics.html_requests.length, paid_calls: 0 }, null, 2));
} catch (error) {
  if (screenshot) await screenshot('failure').catch(() => {});
  await writeFile(path.join(artifacts, 'workspace-smoke-result.json'), JSON.stringify({ ok: false, checks, error: error.stack, blocked, errors, requests,
    failedResponses, ui: evaluate ? await evaluate('document.body.innerText').catch(() => null) : null }, null, 2));
  throw error;
} finally { if (socket) socket.close(); if (browser) browser.kill(); if (server) server.kill(); }
