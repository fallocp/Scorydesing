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
  const profile = await mkdtemp(path.join(tmpdir(), 'references-browser-'));
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
    await writeFile(path.join(artifacts, `references-${name}.png`), Buffer.from(shot.data, 'base64'));
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
  const attachAndDescribe = async () => {
    await evaluate(`(async()=>{
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f8f3';ctx.fillRect(0,0,1200,675);
      ctx.fillStyle='#177b78';ctx.fillRect(20,20,300,40);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const transfer=new DataTransfer();transfer.items.add(new File([blob],'captura-1200x675.png',{type:'image/png'}));
      const file=document.querySelector('.sdp-capture');file.files=transfer.files;file.dispatchEvent(new Event('change',{bubbles:true}));
      const text=document.querySelector('.sdp-field textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(text,'Un avión en la zona marcada, preservando los textos editables.');
      text.dispatchEvent(new Event('input',{bubbles:true}));
    })()`);
  };
  const noGenerationButton = async () => {
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Generar borrador')?.disabled"), true);
  };
  await send('Page.navigate', { url: entry }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
  const initial = await evaluate(deck);

  const addReference = async (index, name = `ref-${index}.png`) => {
    await wait("!!document.querySelector('[aria-label=\"Añadir referencia visual\"]') && !document.querySelector('[aria-label=\"Añadir referencia visual\"]').disabled");
    await evaluate(`(async()=>{
      const canvas=document.createElement('canvas');canvas.width=${128 + index * 64};canvas.height=${96 + index * 32};
      const ctx=canvas.getContext('2d');ctx.fillStyle=${JSON.stringify(['#da6b49','#177b78','#617cc3'][index])};ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle='#fff';ctx.fillRect(10,10,30,30);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      const transfer=new DataTransfer();transfer.items.add(new File([blob],${JSON.stringify(name)},{type:'image/png'}));
      const input=document.querySelector('[aria-label="Añadir referencia visual"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    await wait("document.querySelector('[data-testid=\"presentation-reference-picker\"]')?.getAttribute('aria-busy')==='false'");
  };
  const changeRole = async (name, role) => {
    await evaluate(`(()=>{const select=document.querySelector('[aria-label=${JSON.stringify(`Uso de ${name}`)}]');select.value=${JSON.stringify(role)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(`document.querySelector('[aria-label=${JSON.stringify(`Uso de ${name}`)}]')?.value===${JSON.stringify(role)} && document.querySelector('[data-testid="presentation-reference-picker"]')?.getAttribute('aria-busy')==='false'`);
  };
  const persistedReferences = () => evaluate(`new Promise((resolve,reject)=>{
    const request=indexedDB.open('scory-design-presentation-references-v1');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction('drafts','readonly');const get=tx.objectStore('drafts').getAll();
      get.onerror=()=>reject(get.error);get.onsuccess=()=>{resolve(get.result.map(record=>({...record,value:{...record.value,items:record.value.items.map(item=>({...item,blob:{type:item.blob.type,size:item.blob.size}}))}})));db.close();};};
  })`);
  await control('capabilities=normal&executor=image_api');
  for (const [index, executor] of ['image_api', 'responses_image'].entries()) {
    if (index) { await control(`executor=${executor}`); await click('Siguiente'); }
    await open(); await attachAndDescribe();
    await addReference(0);
    await wait("document.querySelectorAll('[data-testid=\"presentation-reference-item\"]').length===1");
    const firstId = await evaluate("document.querySelector('[data-testid=\"presentation-reference-item\"]').dataset.referenceId");
    await addReference(0, 'same-pixels-different-name.png');
    assert.equal(await evaluate("document.querySelectorAll('[data-testid=\"presentation-reference-item\"]').length"), 1);
    assert.equal(await evaluate("document.querySelector('[data-testid=\"presentation-reference-item\"]').dataset.referenceId"), firstId);
    await addReference(1); await wait("document.querySelectorAll('[data-testid=\"presentation-reference-item\"]').length===2");
    await addReference(2); await wait("document.querySelectorAll('[data-testid=\"presentation-reference-item\"]').length===3");
    await changeRole('ref-1.png', 'image_style_reference'); await changeRole('ref-2.png', 'brand_reference');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Añadir referencia visual\"]').disabled"), true);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[aria-label=\"Añadir referencia visual\"]')).opacity"), '0');
    const before = (await control()).adapter_requests.length;
    const saved = await persistedReferences();
    assert.equal(saved[index].value.items.length, 3);
    assert.deepEqual(saved[index].value.items.map(item=>item.role), ['object_reference','image_style_reference','brand_reference']);
    assert.equal(Object.keys(saved[index].value.uploads).length, 0);
    await screenshot(`${executor}-reference-picker`);
    await close();
    await send('Page.reload', { ignoreCache: true }, sessionId);
    await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
    if (index) await click('Siguiente');
    await open(); await wait("document.querySelectorAll('[data-testid=\"presentation-reference-item\"]').length===3");
    assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[data-testid=\"presentation-reference-item\"]')).map(item=>item.dataset.referenceId)"), saved[index].value.items.map(item=>item.id));
    assert.equal((await control()).adapter_requests.length, before);
    await attachAndDescribe();
    if (index) {
      await evaluate(`(()=>{const select=document.querySelector('[aria-label="Acción con las referencias"]');select.value=${JSON.stringify(firstId)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await wait(`document.querySelector('[aria-label="Acción con las referencias"]')?.value===${JSON.stringify(firstId)}`);
      assert.equal((await control()).adapter_requests.length, before);
    }
    checks.push(`${executor}: three actual references retain roles and byte identities through close/reload; duplicate pixels add no item or upload, and a fourth extra is blocked`);
    await click('Generar borrador');
    await wait("document.querySelector('.sdp-status')?.textContent==='Borrador listo para elegir dirección'", `${executor} multi-reference draft`);
    const lowState = await read(), lowJob = lowState.state.jobs.jobs.at(-1), low = lowJob.plan.operation;
    assert.equal(low.context.references.length, 4);
    assert.deepEqual(low.context.references.slice(1).map(ref=>ref.roles), [['object_reference'],['image_style_reference'],['brand_reference']]);
    assert.equal(low.action, index ? 'recreate_asset' : 'generate_image');
    assert.equal(low.image.background, index ? 'transparent' : 'opaque');
    assert.equal(low.image.executor, executor); assert.equal(low.image.quality, 'low');
    let metrics = await control(); assert.equal(metrics.adapter_requests.length, before + 1);
    assert.equal(metrics.adapter_requests.at(-1).input_images, index ? 5 : 4);
    const imported = lowState.state.assets.versions.filter(asset=>asset.provenance.kind==='imported');
    assert.equal(imported.length, (index + 1) * 4);
    const identities = low.context.references.map(ref=>`${ref.asset_id}:${ref.version_id}`);
    assert.equal(new Set(identities).size, 4);
    for (const reference of low.context.references) {
      const asset = imported.find(asset=>asset.identity.asset_id===reference.asset_id);
      assert.ok(asset); assert.ok(asset.storage.size_bytes > 0); assert.ok(asset.storage.width <= 1024 && asset.storage.height <= 1024);
    }
    if (index) {
      assert.equal(low.context.base_asset.asset_id, low.context.references[1].asset_id);
      assert.equal(low.context.base_asset.version_id, low.context.references[1].version_id);
      assert.deepEqual(metrics.adapter_requests.at(-1).input_dimensions[0], {width:128,height:96});
    }
    const uploaded = (await persistedReferences()).find(record=>record.scope.slide_id===low.context.target.slide_id);
    assert.equal(Object.keys(uploaded.value.uploads).length, 3);
    assert.ok(uploaded.value.items.every(item=>uploaded.value.uploads[item.sha256].version.identity.version_id===item.sha256));
    assert.deepEqual(await evaluate(deck), initial);
    checks.push(`${executor}: real adapter receives capture plus three actual reference files; ${index ? 'explicit recreation uses exact object base first and requests transparent low' : 'composition keeps role order and four distinct identities'}`);
    await click('Aprobar dirección'); await wait("document.querySelector('.sdp-status')?.textContent==='Dirección aprobada'");
    assert.equal((await control()).adapter_requests.length, before + 1);
    await click('Generar versión en media');
    await wait("document.querySelector('.sdp-status')?.textContent==='Versión en media lista para revisar'");
    const mediumState = await read(), mediumJob = mediumState.state.jobs.jobs.at(-1), medium = mediumJob.plan.operation;
    assert.deepEqual(medium.context.references, low.context.references);
    assert.deepEqual(medium.context.base_asset, lowJob.calls[0].receipt.outputs[0].asset);
    assert.equal(medium.image.background, low.image.background); assert.equal(medium.image.executor, executor);
    metrics = await control(); assert.equal(metrics.adapter_requests.length, before + 2); assert.equal(metrics.adapter_requests.at(-1).input_images, 5);
    assert.equal(mediumState.state.assets.versions.filter(asset=>asset.provenance.kind==='imported').length, imported.length);
    await click('Aprobar versión final'); await wait("document.querySelector('.sdp-status')?.textContent==='Versión final aprobada'");
    await screenshot(`${executor}-medium`); await close();
    assert.deepEqual(await evaluate(deck), initial);
    checks.push(`${executor}: approval does not generate; medium preserves executor/background/all reference identities, reuses uploaded bytes and needs its own final review`);
  }
  const final = await control(), finalState = await read();
  assert.equal(final.adapter_requests.length, 4); assert.equal(finalState.state.jobs.jobs.length, 4);
  assert.equal(finalState.generation.remaining_outputs, 0);
  assert.equal(finalState.state.jobs.jobs.flatMap(job=>job.calls).reduce((sum,call)=>sum+call.reserved_micro_usd,0),4000000);
  assert.equal(final.real_provider_calls,0); assert.deepEqual(final.worker_errors,[]); assert.deepEqual(blocked,[]);
  const exceptions=events.filter(event=>['Runtime.exceptionThrown','Test.interceptionError'].includes(event.method));assert.deepEqual(exceptions,[]);
  checks.push('four mocked image calls keep four reservations; references add no image generation, text planning or external requests');
  const result={success:true,checks,mocked_adapter_calls:final.adapter_requests.length,actual_provider_calls:0,
    external_requests:blocked.length,sql_audits:final.audits.length,uploaded_reference_assets:finalState.state.assets.versions.filter(asset=>asset.provenance.kind==='imported').length,
    requests:final.adapter_requests,artifacts};
  await writeFile(path.join(artifacts,'references-smoke-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
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
