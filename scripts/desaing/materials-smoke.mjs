/** Real materials UI against isolated local SQL/provider/cloud fixtures; all remote browser requests are blocked. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3019', entry = `${base}/materials`;
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], blocked = [], errors = [], requests = [], failedResponses = [];
let server, browser, socket, evaluate, screenshot;
try {
  const available = () => fetch(`${base}/experiments/presentations/`).then(r => r.ok).catch(() => false);
  if (!await available()) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.materials-test.config.ts'], { windowsHide: true, stdio: 'ignore' });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !await available()) await delay(150);
    assert(await available(), 'The local materials fixture starts');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'materials-browser-'));
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
  const click = async (label, root = 'document') => { await wait(`!!(${button(label, root)})`, `button ${label}`); await evaluate(`(()=>{const target=${button(label, root)};target.focus();target.click()})()`); };
  const setValue = async (selector, value) => {
    await wait(`document.querySelector(${JSON.stringify(selector)})?.disabled===false`, `editable input ${selector}`);
    return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing input');const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  };
  const text = (label, value) => setValue(`textarea[aria-label="${label}"]`, value);
  screenshot = async name => { await delay(500); const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(path.join(artifacts, `materials-${name}.png`), Buffer.from(shot.data, 'base64')); };
  const control = async query => { const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
    method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
  }); assert.equal(response.status, 200); return response.json(); };
  const collectionId = '00000000-0000-4000-8000-000000000012';
  const api = 'window.__presentationHarness.designClient.materials(window.__presentationHarness.businessId)';
  const read = () => evaluate(`${api}.read(${JSON.stringify(collectionId)})`);
  const history = () => evaluate(`${api}.history(${JSON.stringify(collectionId)})`);
  const ready = () => wait("!!window.__presentationHarness && !!document.querySelector('.mtl-dialog') && document.querySelector('[aria-label=\"Cerrar biblioteca de materiales\"]')?.disabled===false");
  const noModels = async (counts, analyses) => { const m = await control(); assert.equal(m.material_counts.length, counts); assert.equal(m.material_requests.length, analyses);
    assert.equal(m.adapter_requests.length, 0); assert.equal(m.planner_requests.length, 0); assert.equal(m.html_requests.length, 0); };
  const attach = async (selector, kind, revision = 'A') => {
    await wait(`document.querySelector(${JSON.stringify(selector)})?.disabled===false`);
    await evaluate(`(async()=>{let file;if(${JSON.stringify(kind)}==='pdf'){const blob=await fetch('/__desaing-material-pdf?revision='+${JSON.stringify(revision)}).then(r=>r.blob());file=new File([blob],'manual-marca.pdf',{type:'application/pdf'});}else{
      const c=document.createElement('canvas');c.width=320;c.height=160;const x=c.getContext('2d');x.fillStyle='#145E62';x.fillRect(0,0,320,160);x.fillStyle='#F6F7F2';x.font='bold 36px Arial';x.fillText('Marca Verde',24,90);const blob=await new Promise(r=>c.toBlob(r,'image/png'));file=new File([blob],'logo.png',{type:'image/png'});}
      const dt=new DataTransfer();dt.items.add(file);const input=document.querySelector(${JSON.stringify(selector)});input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await ready();
  };
  await send('Page.navigate', { url: entry }, sessionId); await ready(); assert.equal((await read()).revision, 0); await noModels(0, 0);
  await control('lose_material_upload=true'); await attach('[aria-label="Añadir material"]', 'pdf'); await wait("!!document.querySelector('.mtl-error')");
  assert.equal((await read()).materials.length, 1); assert.equal((await control()).material_uploads, 1);
  await send('Page.reload', {}, sessionId); await ready();
  assert.equal(await evaluate("document.querySelector('.mtl-material-meta').innerText.includes('PDF · 2 páginas')"), true);
  const importedPdf = (await read()).materials[0]; assert.equal(importedPdf.page_count, 2);
  const source = await evaluate(`(async()=>{const api=${api},v=(await api.read(${JSON.stringify(collectionId)})).materials[0];const b=await api.source(${JSON.stringify(collectionId)},v);const {materialHash}=await import('/supabase/functions/_shared/desaing/materials.ts');return{hash:await materialHash(new Uint8Array(await b.arrayBuffer())),type:b.type,size:b.size}})()`);
  assert.deepEqual(source, { hash: importedPdf.version_id, type: 'application/pdf', size: importedPdf.size_bytes });
  await attach('[aria-label="Añadir material"]', 'pdf'); assert.equal((await read()).materials.length, 1); assert.equal((await control()).material_uploads, 1); await noModels(0, 0);
  checks.push('Real two-page PDF survives lost upload acknowledgement and reload; signed source verifies SHA/MIME/bytes and duplicate upload is reused without analysis');

  await attach('[aria-label="Añadir material"]', 'png'); await evaluate("document.querySelector('.mtl-idea').open=true");
  await setValue('[aria-label="Nombre de la idea"]', 'idea-de-paleta.txt');
  const idea = 'Quiero explorar una paleta azul para la audiencia de nuevos clientes. Mantener un tono claro.';
  await text('Texto del material', idea); await click('Guardar texto como material'); await ready(); await wait("document.querySelectorAll('.mtl-material').length===3");
  await text('Indicaciones para analizar materiales', 'Conservar cifras y citas literalmente. Identificar contradicciones y preguntas pendientes.');
  await click('Guardar indicaciones'); await ready(); const initial = await read();
  assert.equal(initial.selected.length, 3); assert.equal(initial.materials.find(v => v.mime_type === 'text/plain').size_bytes, Buffer.byteLength(idea));
  assert.equal((await control()).material_uploads, 3); await noModels(0, 0);
  checks.push('PDF, actual PNG and pasted UTF-8 text persist as three sources with immutable versions; saving and selection make no model calls');

  await control('material_input_limit=true'); await click('Analizar selección'); await ready(); await wait("!!document.querySelector('.mtl-error')");
  await noModels(1, 0); assert.equal((await control()).text_budget.attempts, 0); assert.equal((await history()).length, 0);
  await control('material_input_limit=false&lose_material=true'); await click('Analizar selección'); await ready();
  await wait("document.querySelector('.mtl-empty')?.textContent.includes('pendiente')"); await noModels(2, 1); assert.equal((await history())[0].status, 'completed');
  await send('Page.reload', {}, sessionId); await ready(); await wait("!!document.querySelector('[aria-label=\"Hallazgo promise_rule\"]')");
  await click('Recuperar análisis'); await ready(); await noModels(2, 1);
  const recovered = await control(); assert.equal(recovered.text_budget.attempts, 1); assert(recovered.material_recoveries >= 1);
  assert.deepEqual(recovered.material_requests[0].sources.map(v => ({ mime: v.mime_type, pages: v.page_count })),
    [{ mime: 'application/pdf', pages: 2 }, { mime: 'image/png', pages: null }, { mime: 'text/plain', pages: null }]);
  assert.deepEqual(recovered.material_counts[1].source_hashes, initial.selected.map(v => v.version_id));
  checks.push('Token preflight rejects 80,001 tokens before reserving or analyzing; one admitted inference with lost reply recovers from durable SQL after reload without retry');

  assert.equal(await evaluate("document.querySelector('[aria-label=\"Hallazgo promise_rule\"]').closest('article').innerText.includes('página 2')"), true);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Hallazgo color_conflict\"]').closest('article').querySelectorAll('.mtl-evidence').length"), 2);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Hallazgo audience_pending\"]').closest('article').innerText.includes('Sin confirmar')"), true);
  await click('Ver fuente de este hallazgo', "document.querySelector('[aria-label=\"Hallazgo promise_rule\"]').closest('article')"); await ready();
  assert.equal(await evaluate("document.querySelector('.mtl-source iframe')?.src.endsWith('#page=2')"), true);
  await evaluate("document.querySelector('[aria-label=\"Cerrar vista del material\"]').click()");
  await text('Hallazgo primary_color', '#123456'); await click('Guardar correcciones'); await ready(); assert.equal((await read()).review.approved, false);
  assert.equal((await history())[0].result.findings.find(f => f.id === 'primary_color').value, '#145E62');
  await click('Aprobar ficha'); await ready(); const approved = await read();
  assert.deepEqual(approved.review.corrections, [{ finding_id: 'primary_color', value: '#123456' }]); assert.equal(approved.review.approved, true);
  await screenshot('desktop-evidence-reviewed'); await send('Page.reload', {}, sessionId); await ready();
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Hallazgo primary_color\"]').value"), '#123456');
  assert.equal(await evaluate("document.querySelector('.mtl-sheet-heading .mtl-badge').textContent"), 'Ficha aprobada'); await noModels(2, 1);
  checks.push('Evidence opens the exact PDF version/page; conflict and pending findings stay explicit; corrections and approval survive reload without altering original analysis');

  await attach('[aria-label="Nueva versión de manual-marca.pdf"]', 'pdf', 'B');
  const revised = await read(), pdfVersions = revised.materials.filter(v => v.material_id === importedPdf.material_id);
  assert.equal(pdfVersions.length, 2); assert.notEqual(pdfVersions[1].version_id, importedPdf.version_id); assert.equal(revised.review, null); assert.equal((await history()).length, 1);
  assert.equal(await evaluate("document.querySelector('.mtl-sheet-heading .mtl-badge').textContent"), 'Otra selección o versión');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.mtl-dialog button')).find(b=>b.textContent.trim()==='Aprobar ficha').disabled"), true); await noModels(2, 1);
  await click('Analizar selección'); await ready(); await wait("document.querySelector('.mtl-sheet-heading .mtl-badge')?.textContent==='Por revisar'");
  await text('Hallazgo primary_color', '#123456'); await click('Guardar correcciones'); await ready();
  await click('Aprobar ficha'); await ready(); const secondApproved = await read(); assert.notEqual(secondApproved.review.source_hash, approved.review.source_hash);
  assert.equal((await history()).length, 2); await noModels(3, 2);
  await resize(820, 1180); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); await screenshot('tablet-version-reviewed');
  checks.push('Replacing a PDF retains both exact byte versions and previous analysis, invalidates approval and requires one explicit new analysis before review');

  await send('Page.navigate', { url: `${base}/free-design` }, sessionId);
  await wait("document.querySelector('.fd-page')?.getAttribute('aria-busy')==='false' && !!document.querySelector('[aria-label=\"Nombre del diseño\"]')");
  await setValue('[aria-label="Nombre del diseño"]', 'Diseño con materiales revisados'); await click('Crear lienzo');
  await wait("!document.querySelector('.fd-create') && document.querySelector('.fd-page').getAttribute('aria-busy')==='false'");
  await click('Materiales de referencia'); await ready(); await wait("Array.from(document.querySelectorAll('.mtl-dialog button')).some(b=>b.textContent.trim()==='Usar ficha revisada'&&!b.disabled)");
  await click('Usar ficha revisada'); await wait("!document.querySelector('.mtl-dialog') && document.querySelector('.fd-page').getAttribute('aria-busy')==='false'");
  const usedBrief = await evaluate("document.querySelector('[aria-label=\"Idea del diseño\"]').value");
  assert(usedBrief.includes('Corrección del usuario: #123456'));
  for (const identity of secondApproved.selected) assert(usedBrief.includes(identity.version_id.slice(0, 8)));
  await noModels(3, 2);
  checks.push('Free design consumes explicitly approved corrected findings with source names/version markers, without pretending to attach pixels or executing another analysis');

  await click('Diseñar con IA'); await wait("!!document.querySelector('.sdp-dialog') && document.querySelector('[aria-label=\"Descripción de la pieza\"]')?.disabled===false");
  await text('Descripción de la pieza', 'Encargo independiente: portada basada en la ficha.');
  await click('Materiales de referencia', "document.querySelector('.sdp-dialog')"); await ready();
  assert.equal(await evaluate("document.querySelector('.mtl-dialog').contains(document.activeElement)"), true);
  assert.equal(await evaluate("document.querySelector('.sdp-dialog').inert && document.querySelector('.sdp-dialog').getAttribute('aria-hidden')==='true'"), true);
  await evaluate("Array.from(document.querySelector('.mtl-dialog').querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')).at(-1).focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, sessionId);
  assert.equal(await evaluate("document.querySelector('.mtl-dialog').contains(document.activeElement)"), true);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await wait("!document.querySelector('.mtl-dialog') && !!document.querySelector('.sdp-dialog') && !document.querySelector('.sdp-dialog').inert");
  await wait("document.querySelector('.sdp-dialog').contains(document.activeElement) && document.activeElement.textContent.trim()==='Materiales de referencia'", 'nested dialog restores trigger focus after unmount');
  await click('Materiales de referencia', "document.querySelector('.sdp-dialog')"); await ready(); await click('Usar ficha revisada');
  await wait("!document.querySelector('.mtl-dialog') && !!document.querySelector('.sdp-dialog')");
  const panelBrief = await evaluate("document.querySelector('[aria-label=\"Descripción de la pieza\"]').value");
  assert(panelBrief.startsWith('Encargo independiente: portada basada en la ficha.')); assert(panelBrief.includes('Corrección del usuario: #123456'));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
  await wait("!document.querySelector('.sdp-dialog')"); await noModels(3, 2);
  checks.push('Nested materials dialog owns focus and Tab, Escape closes only the child, and explicit reuse adds literal corrections to the parent brief without AI calls');

  await click('Materiales de referencia'); await ready(); const stale = await read();
  await text('Indicaciones para analizar materiales', 'Nueva regla: priorizar una paleta monocromática sin modificar el contenido literal.');
  await click('Guardar indicaciones'); await ready(); assert.equal((await read()).review, null);
  const cas = await evaluate(`(async()=>{try{await ${api}.save(${JSON.stringify({ business_id: initial.business_id, collection_id: collectionId, expected_revision: stale.revision, selected: stale.selected, brief: 'Stale tab overwrite', review: null })});return 'accepted'}catch(e){return e.code}})()`);
  assert.equal(cas, 'materials_revision_conflict');
  const foreign = await evaluate(`(async()=>{try{await window.__presentationHarness.designClient.materials(window.__presentationHarness.otherBusinessId).read(${JSON.stringify(collectionId)});return 'leaked'}catch(e){return e.code}})()`);
  assert.equal(foreign, 'business_access_denied'); await control('reserve_text_budget=true'); await click('Recuperar biblioteca'); await ready();
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.mtl-dialog button')).find(b=>b.textContent.trim()==='Analizar selección').disabled"), true);
  const rejected = await evaluate(`(async()=>{const {makeMaterialAnalysisRequest}=await import('/supabase/functions/_shared/desaing/materials.ts');try{await ${api}.analyze(await makeMaterialAnalysisRequest(await ${api}.read(${JSON.stringify(collectionId)})));return 'accepted'}catch(e){return e.code}})()`);
  assert.equal(rejected, 'materials_quota_exceeded'); await noModels(3, 2); assert.equal((await control()).text_budget.attempts, 5);
  await click('Recuperar análisis'); await ready(); await noModels(3, 2);
  checks.push('CAS rejects stale edits and foreign business access; shared text reservations block analysis before preflight while prior evidence remains recoverable');

  await send('Page.navigate', { url: entry }, sessionId); await ready();
  await text('Indicaciones para analizar materiales', 'Este borrador privado no debe quedar visible en otra cuenta.');
  const beforeActor = await read();
  await evaluate("window.__materialsOriginalSession=window.__presentationHarness.designClient.session;window.__presentationHarness.designClient.session=async()=>({...await window.__materialsOriginalSession(),actorId:'e1efb132-94ce-483a-a204-dce27c63b61c'});window.dispatchEvent(new Event('focus'))");
  await wait("document.querySelector('.mtl-error')?.textContent.includes('Cambió tu sesión') && !document.querySelector('.mtl-finding') && !document.querySelector('.mtl-material')");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Indicaciones para analizar materiales\"]').value"), '');
  await evaluate('window.__presentationHarness.designClient.session=window.__materialsOriginalSession'); assert.deepEqual(await read(), beforeActor);
  const final = await control(); assert.equal(final.material_requests.length, 2); assert.equal(final.material_counts.length, 3); assert.equal(final.material_uploads, 4);
  assert.equal(final.real_provider_calls, 0); assert.deepEqual(final.worker_errors, []); assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
  checks.push('Changing actor hides the old collection/findings/preview without changing durable data; file/model activity stays in isolated local fixtures');
  await writeFile(path.join(artifacts, 'materials-smoke-result.json'), JSON.stringify({ ok: true, checks, metrics: final,
    collection: beforeActor, attempts: await history(), requests, external_requests: blocked, exceptions: errors }, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, simulated_token_counts: final.material_counts.length, simulated_analyses: final.material_requests.length, material_uploads: final.material_uploads, paid_calls: 0 }, null, 2));
} catch (error) {
  if (screenshot) await screenshot('failure').catch(() => {});
  await writeFile(path.join(artifacts, 'materials-smoke-result.json'), JSON.stringify({ ok: false, checks, error: error.stack,
    blocked, errors, failedResponses, requests, ui: evaluate ? await evaluate('document.body.innerText').catch(() => null) : null }, null, 2));
  throw error;
} finally { if (socket) socket.close(); if (browser) browser.kill(); if (server) server.kill(); }
