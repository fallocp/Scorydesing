/** Real UI -> JWT handler -> live worker/adapter, with local SQL and a fake provider fetch; no paid calls. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3013';
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
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.generation-test.config.ts'],
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
  const profile = await mkdtemp(path.join(tmpdir(), 'full-design-browser-'));
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
    await writeFile(path.join(artifacts, `full-design-${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  main = { sessionId, evaluate, screenshot };
  const control = async query => {
    const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
      method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
    });
    assert.equal(response.status, 200); return response.json();
  };
  const deck = 'JSON.parse(localStorage.getItem(window.__presentationHarness.draftKey))';
  const open = async () => {
    await click('Crear pieza para el slide');
    await wait("!!document.querySelector('.sdp-dialog') && !document.body.innerText.includes('Conectando con tus trabajos')");
  };
  const close = async () => {
    await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()");
    await wait("!document.querySelector('.sdp-dialog')");
  };
  const read = () => evaluate('window.__presentationHarness.designClient.read(window.__presentationHarness.businessId)');
  const setText = async (label, value) => {
    const selector = JSON.stringify(`textarea[aria-label="${label}"]`);
    await evaluate(`(()=>{const input=document.querySelector(${selector});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  };
  const attach = async (name, color) => {
    await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
      const ctx=canvas.getContext('2d');ctx.fillStyle=${JSON.stringify(color)};ctx.fillRect(0,0,1200,675);
      ctx.fillStyle='#167c61';ctx.fillRect(740,70,330,500);ctx.fillStyle='#19342d';ctx.font='bold 72px Arial';ctx.fillText('Una idea completa',40,120);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const files=new DataTransfer();files.items.add(new File([blob],${JSON.stringify(name)},{type:'image/png'}));
      const input=document.querySelector('.sdp-capture');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  const textValue = label => evaluate(`document.querySelector(${JSON.stringify(`textarea[aria-label="${label}"]`)})?.value`);
  const readyToGenerate = () => wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Generar borrador'&&!b.disabled)", 'capture and brief restored and actionable');
  const canvasFits = async htmlExpression => evaluate(`(async()=>{const f=document.createElement('iframe');f.setAttribute('sandbox','allow-same-origin');f.width='800';f.height='450';f.style.cssText='position:fixed;left:-10000px;top:0;border:0';f.srcdoc=${htmlExpression};try{await new Promise(resolve=>{f.onload=resolve;document.body.append(f)});const d=f.contentDocument,r=d.body.getBoundingClientRect();return{width:d.documentElement.scrollWidth,height:d.documentElement.scrollHeight,x:r.left,y:r.top}}finally{f.remove()}})()`);
  const pressed = label => `Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()===${JSON.stringify(label)})?.getAttribute('aria-pressed')==='true'`;
  const fullBrief = 'Una portada completa con jerarquía editorial, un mundo a la derecha y amplio espacio entre títulos.';
  const approvedCopy = 'Un mundo de ideas\n45 días · US$5\nContenido aprobado, sin cambios.';
  const pieceBrief = 'Un avión pequeño para la región existente, sin rehacer la lámina.';
  await send('Page.navigate', { url: entry }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
  const initial = await evaluate(deck), baseline = await control();
  assert.equal(baseline.adapter_requests.length, 0, 'Use a fresh 3013 fixture; other suites must not share its budget');
  await control('executor=image_api');
  await open(); await attach('referencia-pieza.png', '#f6e8d0'); await setText('Descripción de la pieza', pieceBrief);
  await readyToGenerate(); await click('Diseño completo');
  await wait(pressed('Diseño completo')); await wait("!!document.querySelector('textarea[aria-label=\"Texto aprobado\"]')");
  await attach('referencia-portada.png', '#f4f8f1'); await setText('Descripción de la pieza', fullBrief); await setText('Texto aprobado', approvedCopy);
  await readyToGenerate(); await click('Pieza en región'); await wait(pressed('Pieza en región')); await readyToGenerate();
  assert.equal(await textValue('Descripción de la pieza'), pieceBrief);
  assert.equal(await textValue('Texto aprobado'), undefined);
  await click('Diseño completo'); await wait(pressed('Diseño completo')); await readyToGenerate();
  assert.equal(await textValue('Descripción de la pieza'), fullBrief); assert.equal(await textValue('Texto aprobado'), approvedCopy);
  assert.equal((await control()).adapter_requests.length, 0);
  checks.push('Switching piece/full-design scope preserves separate briefs, capture readiness and literal approved copy without provider calls');

  await close(); await open(); await wait(pressed('Diseño completo')); await readyToGenerate();
  assert.equal(await textValue('Descripción de la pieza'), fullBrief); assert.equal(await textValue('Texto aprobado'), approvedCopy);
  await close(); await send('Page.reload', { ignoreCache: true }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
  await open(); await wait(pressed('Diseño completo')); await readyToGenerate();
  assert.equal(await textValue('Descripción de la pieza'), fullBrief); assert.equal(await textValue('Texto aprobado'), approvedCopy);
  const savedScopes = await evaluate(`(async()=>{const {openExplorationStore}=await import('/src/lib/desaing/explorationStore.ts');const h=window.__presentationHarness;
    const actor=(await h.designClient.session()).actorId,slide=${deck}[0];const output=[];
    for(const suffix of ['',':full_design']){const store=await openExplorationStore({actor_id:actor,business_id:h.businessId,session_id:'presentation:draft:'+h.businessId+':'+slide.id+suffix});
      try{const saved=await store.read();if(!saved){output.push(null);continue}const bitmap=await createImageBitmap(saved.value.capture);const c=document.createElement('canvas');c.width=1;c.height=1;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);const color=[...ctx.getImageData(0,0,1,1).data];
        output.push({brief:saved.value.brief,copy:saved.value.approved_copy??'',name:saved.value.capture_name,width:bitmap.width,height:bitmap.height,color});bitmap.close()}finally{store.close()}}
    return output})()`);
  assert.deepEqual(savedScopes, [
    { brief: pieceBrief, copy: '', name: 'referencia-pieza.png', width: 1024, height: 576, color: [246, 232, 208, 255] },
    { brief: fullBrief, copy: approvedCopy, name: 'referencia-portada.png', width: 1024, height: 576, color: [244, 248, 241, 255] },
  ]);
  assert.equal((await control()).adapter_requests.length, 0); assert.deepEqual(await evaluate(deck), initial);
  await screenshot('draft-ready');
  checks.push('Close/reopen and actual browser reload retain full-design scope, approved copy and reference; active HTML stays unchanged');

  await click('Generar borrador');
  await wait("document.querySelector('.sdp-status')?.textContent==='Borrador listo para elegir dirección'", 'full low completes');
  const lowState = await read(), lowJob = lowState.state.jobs.jobs.at(-1), lowOutput = lowJob.calls[0].receipt.outputs[0].asset;
  assert.deepEqual(lowJob.plan.operation.image.size, { width: 1536, height: 864 });
  assert.match(lowJob.plan.operation.context.session_id, /:full_design$/);
  assert.equal(lowJob.plan.operation.context.references[0].roles.includes('layout_reference'), true);
  assert(lowJob.plan.operation.context.immutable_elements.includes(`Texto aprobado, conservar literalmente:\n${approvedCopy}`));
  const lowAsset = lowState.state.assets.versions.find(v => v.identity.asset_id === lowOutput.asset_id && v.identity.version_id === lowOutput.version_id);
  assert.deepEqual({ width: lowAsset.storage.width, height: lowAsset.storage.height }, { width: 1536, height: 864 });
  assert.equal((await control()).adapter_requests.length, 1); assert.deepEqual(await evaluate(deck), initial);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Dejar como imagen')?.disabled"), true);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Usar diseño para HTML')?.disabled"), true);
  checks.push('Explicit low render uses whole-design namespace, layout reference, literal approved copy and 1536x864 output; no premature apply or HTML conversion');

  await click('Aprobar dirección'); await wait("document.querySelector('.sdp-status')?.textContent==='Dirección aprobada'");
  assert.equal((await control()).adapter_requests.length, 1);
  await close(); await send('Page.reload', { ignoreCache: true }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
  await open(); await wait("document.querySelector('.sdp-status')?.textContent==='Dirección aprobada'");
  await evaluate("window.__presentationHarness.designClient.command(window.__presentationHarness.businessId,{kind:'recover'})");
  assert.equal((await control()).adapter_requests.length, 1); assert.equal(await textValue('Texto aprobado'), approvedCopy);
  await click('Generar versión en media');
  await wait("document.querySelector('.sdp-status')?.textContent==='Versión en media lista para revisar'");
  const mediumState = await read(), mediumJob = mediumState.state.jobs.jobs.at(-1), mediumOutput = mediumJob.calls[0].receipt.outputs[0].asset;
  assert.deepEqual(mediumJob.plan.operation.context.base_asset, lowOutput);
  assert.deepEqual(mediumJob.plan.operation.image.size, { width: 1536, height: 864 });
  assert.deepEqual(mediumJob.plan.operation.context.immutable_elements, lowJob.plan.operation.context.immutable_elements);
  assert.deepEqual(mediumJob.plan.operation.context.references, lowJob.plan.operation.context.references);
  assert.equal((await control()).adapter_requests.length, 2);
  assert.equal((await control()).adapter_requests.at(-1).input_images, 2);
  await click('Ver borrador aprobado');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Aprobar versión final').disabled"), true);
  await click('Ver versión en media'); await click('Aprobar versión final');
  await wait("document.querySelector('.sdp-status')?.textContent==='Versión final aprobada'");
  assert.deepEqual(await evaluate(deck), initial);
  assert.deepEqual(await canvasFits("document.querySelector('.sdp-preview iframe').srcdoc"), { width: 800, height: 450, x: 0, y: 0 });
  await screenshot('medium-approved');
  checks.push('Direction/recovery do not render; explicit medium preserves exact low parent, references, copy and canvas ratio; final review still leaves HTML untouched');

  await click('Usar diseño para HTML');
  await wait("!!document.querySelector('.hcp-dialog textarea[aria-label=\"Contenido aprobado para HTML\"]')");
  await wait("document.querySelector('[aria-label=\"Cerrar diseño para HTML\"]')?.disabled===false");
  assert.equal(await textValue('Contenido aprobado para HTML'), approvedCopy);
  const conversionSource = await evaluate(`(async()=>{const {openCompositionStore}=await import('/src/lib/presentations/compositionStore.ts');const h=window.__presentationHarness;
    const actor=(await h.designClient.session()).actorId;const store=await openCompositionStore({actor,business:h.businessId,session:'html:presentation:draft:'+h.businessId+':'+${deck}[0].id});
    try{const saved=await store.read();return{asset:saved?.value.source?.version?.identity,copy:saved?.value.copy_text}}finally{store.close()}})()`);
  assert.deepEqual(conversionSource, { asset: mediumOutput, copy: approvedCopy });
  assert.equal((await control()).adapter_requests.length, 2); assert.deepEqual(await evaluate(deck), initial);
  await evaluate("document.querySelector('[aria-label=\"Cerrar diseño para HTML\"]').click()");
  await wait("!document.querySelector('.hcp-dialog')");
  checks.push('Use-design-for-HTML callback transfers the exact approved copy and reviewed result without automatically converting or charging');

  await open(); await wait("document.querySelector('.sdp-status')?.textContent==='Versión final aprobada'");
  await click('Dejar como imagen'); await wait(`!document.querySelector('.sdp-dialog') && ${deck}[0].revision===2`);
  const bitmap = await evaluate(deck);
  assert.equal(bitmap[0].mounted_assets.length, 1); assert.deepEqual(bitmap[0].mounted_assets[0].asset, mediumOutput);
  assert.equal(bitmap[0].html.includes(initial[0].html), false);
  const outputDom = await evaluate(`(()=>{const html=${deck}[0].html;const d=new DOMParser().parseFromString(html,'text/html');return{images:d.querySelectorAll('img').length,text:d.body.textContent.trim(),headers:d.querySelectorAll('h1,h2,h3,p').length}})()`);
  assert.equal(outputDom.images, 1); assert.equal(outputDom.headers, 0); assert.equal(outputDom.text, '');
  assert.deepEqual(await canvasFits(`${deck}[0].html`), { width: 800, height: 450, x: 0, y: 0 });
  assert.equal(bitmap[1].html, initial[1].html);
  assert.equal(await evaluate("document.body.innerText.includes('El texto sigue editable y puedes reutilizar la pieza.')"), false);
  assert.equal((await control()).adapter_requests.length, 2);
  checks.push('Leave-as-image explicitly replaces only the selected slide with one reviewed bitmap and does not claim the bitmap text is editable');

  const final = await control(), finalState = await read();
  assert.equal(final.real_provider_calls, 0); assert.deepEqual(final.worker_errors, []);
  assert.equal(finalState.state.jobs.jobs.length, 2); assert.equal(finalState.generation.remaining_outputs, 2);
  assert.equal(finalState.state.jobs.jobs.flatMap(job => job.calls).reduce((sum, call) => sum + call.reserved_micro_usd, 0), 2000000);
  const exceptions = events.filter(event => ['Runtime.exceptionThrown', 'Test.interceptionError'].includes(event.method));
  assert.deepEqual(exceptions, []); assert.deepEqual(blocked, []);
  checks.push('Only two simulated image requests and two retained reservations; no actual provider calls, external browser requests or uncaught exceptions');
  const result = { success: true, checks, mocked_adapter_calls: final.adapter_requests.length, actual_provider_calls: 0, sql_audits: final.audits.length,
    remaining_outputs: finalState.generation.remaining_outputs, requests: final.adapter_requests, artifacts };
  await writeFile(path.join(artifacts, 'full-design-smoke-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (main) { await main.screenshot('failure').catch(() => {}); console.error(await main.evaluate('document.body.innerText').catch(() => 'Failed to read UI')); }
  const result = { success: false, checks, error: error.stack, blocked, exceptions: events.filter(event => event.method === 'Runtime.exceptionThrown') };
  await writeFile(path.join(artifacts, 'full-design-smoke-result.json'), JSON.stringify(result, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  if (send) await send('Browser.close').catch(() => {});
  socket?.close(); browser?.kill(); server?.kill();
}
