/** Real prompt-admin UI against isolated local SQL/provider/cloud fixtures; all remote browser requests are blocked. */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3022', entry = `${base}/prompt-admin`;
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], blocked = [], errors = [], requests = [], failedResponses = [];
let server, browser, socket, evaluate, screenshot, serverLog;
try {
  const available = () => fetch(`${base}/experiments/presentations/`).then(r => r.ok).catch(() => false);
  if (!await available()) {
    serverLog = createWriteStream(path.join(artifacts, 'prompt-admin-vite.log'));
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.prompt-admin-test.config.ts'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.pipe(serverLog, { end: false }); server.stderr.pipe(serverLog, { end: false });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !await available()) await delay(150);
    assert(await available(), 'The local prompt-admin fixture starts');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'prompt-admin-browser-'));
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
  await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
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
    await writeFile(path.join(artifacts, `prompt-admin-${name}.png`), Buffer.from(shot.data, 'base64')); };
  const control = async query => { const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
    method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
  }); assert.equal(response.status, 200); return response.json(); };
  const client='window.__presentationHarness.designClient',business='window.__presentationHarness.businessId',api=`${client}.promptAdmin(${business})`;
  const read=()=>evaluate(`${api}.read('general')`),remote=()=>evaluate(`${client}.read(${business})`);
  const ready=()=>wait(`!!document.querySelector('.pad-panel') && !!(${button('Recuperar editor')})`);
  const comparisonReady=()=>wait("document.querySelector('.pac-panel')?.getAttribute('aria-busy')==='false'");
  const models=async n=>{const m=await control();assert.equal(m.adapter_requests.length,n);assert.equal(m.planner_requests.length,0);assert.equal(m.html_requests.length,0);assert.equal(m.material_requests.length,0);assert.equal(m.real_provider_calls,0);return m};
  const fillProposal=async candidate=>{await text('Qué repetir','La claridad y el texto literal.');await text('Qué evitar','Objetos que compitan con el título.');
    await text('Hipótesis del cambio','Separar más el objeto y el texto facilitará la lectura.');await text('Beneficio esperado','Jerarquía más clara.');
    await text('Riesgos y regresiones','Verificar cifras, acentos y márgenes.');await text('Nuevo prompt',candidate)};
  const fillCase=async()=>{await text('Encargo del caso fijo','Portada editorial de un avión con espacio claro para el título.');await text('Texto literal aprobado para comparación','México · Acción\n25 USD · 45 días')};
  await send('Page.navigate',{url:entry},sessionId);await ready();const initial=await read(),metrics0=await models(0),state0=(await remote()).state;
  assert.equal(initial.base.version,1);assert.equal(initial.evidence.length,1);assert.equal(initial.evidence[0].master_origin,'unknown');assert.equal(state0.jobs.jobs.length,1);
  await click('Crear propuesta');await fillProposal(initial.base.text+'\nMantén aire alrededor del objeto.');
  await wait("!!document.querySelector('.pad-diff')");await click('Guardar borrador');await ready();const saved=(await read()).draft;
  assert.equal(saved.revision,1);assert.equal((await read()).base.version,1);assert.equal((await remote()).state.jobs.jobs.length,1);await models(0);
  checks.push('A frozen approved image anchors explicit repeat/avoid/diagnosis and a reviewable diff; saving a proposal changes no published prompt or image and does not fabricate a historical master version');

  await fillCase();await click('Preparar prueba sin imágenes');await ready();await comparisonReady();const firstTest=(await read()).tests[0];
  assert.equal(firstTest.corpus.checks.length,8);assert(firstTest.corpus.checks.every(check=>check.passed));assert.equal(firstTest.draft_revision,1);
  assert.deepEqual(firstTest.operations.before.image,firstTest.operations.after.image);assert.deepEqual(firstTest.operations.before.context.references,firstTest.operations.after.context.references);
  assert.equal((await remote()).state.jobs.jobs.length,1);await models(0);
  await text('Nuevo prompt',saved.new_text+'\nConserva los márgenes.');await click('Guardar borrador');await ready();
  assert.equal((await read()).draft.revision,2);await wait("!document.querySelector('.pac-panel')");
  const stale=await evaluate(`(async()=>{try{await ${client}.command(${business},{kind:'enqueue',operation:${JSON.stringify(firstTest.operations.before)}});return 'accepted'}catch(e){return e.code}})()`);
  assert.equal(stale,'prompt_admin_revision_conflict');await models(0);await fillCase();
  await evaluate("Array.from(document.querySelectorAll('.pad-check input')).find(input=>input.closest('label').textContent.includes('referencia de estilo')).click()");
  await click('Preparar prueba sin imágenes');await ready();await comparisonReady();const currentTest=(await read()).tests[0];
  assert.equal(currentTest.draft_revision,2);assert.notEqual(currentTest.test_hash,firstTest.test_hash);assert.equal(currentTest.operations.before.context.references.length,1);
  checks.push('Eight frozen adapter comparisons are structural only; preparing sends no image requests, editing the proposal invalidates the previous test and stale generation rejects before quota or provider work');

  await click('Generar comparación (2)');await comparisonReady();await wait("document.querySelectorAll('.pac-grid img').length===2");const pairState=(await remote()).state;
  assert.equal(pairState.jobs.jobs.length,3);for(const side of ['before','after'])assert.deepEqual(pairState.jobs.jobs.find(j=>j.operation_key===currentTest.operations[side].operation_key).plan.operation,currentTest.operations[side]);
  const rendered=await models(2);assert.deepEqual(rendered.adapter_requests.map(r=>[r.quality,r.input_images]),[['low',1],['low',1]]);
  await click('Aprobar imagen base');await comparisonReady();await click('Aprobar imagen propuesta');await comparisonReady();
  assert.equal((await read()).base.version,1);assert.equal((await read()).reviews.length,0);await models(2);
  await evaluate("document.querySelectorAll('.pac-panel fieldset input[type=checkbox]').forEach(input=>input.click())");await text('Motivo de la comparación','En esta simulación comprobé ambas imágenes, copy y conservación del formato. La calidad real queda pendiente.');
  await click('Aprobar comparación');await ready();await comparisonReady();const reviewed=await read();
  assert.equal(reviewed.reviews[0].test_hash,currentTest.test_hash);assert.equal(reviewed.reviews[0].decision,'approved');assert.equal(reviewed.base.version,1);
  await resize(820,1180);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('tablet-comparison');
  await resize(1440,1100);await screenshot('desktop-reviewed');
  checks.push('One explicit action generates exactly two matched low images with the same real PNG reference; approving images and recording criteria/reason remains separate from publishing');

  await send('Page.reload',{},sessionId);await ready();await comparisonReady();assert.equal((await read()).reviews[0].id,reviewed.reviews[0].id);await models(2);
  await control('lose_prompt_publish=true');await click('Publicar esta revisión del prompt');await wait(`!!(${button('Consultar resultado')})`);
  const committed=await control();assert.equal(committed.prompt_admin.versions.filter(v=>v.prompt_type==='general').length,2);
  const publicationPending=await evaluate("JSON.parse(Object.entries(localStorage).find(([key])=>key.startsWith('scory-prompt-admin:'))[1])");
  await send('Page.reload',{},sessionId);await wait(`!!(${button('Consultar resultado')})`);await click('Consultar resultado');await ready();
  const published=await read();assert.equal(published.base.version,2);assert.equal(published.receipts[0].request_id,publicationPending.input.request_id);assert.equal(published.draft.status,'published');
  assert.deepEqual(await evaluate(`${api}.publish(${JSON.stringify(publicationPending.input)})`),published.receipts[0]);await models(2);
  const otherFamily=metrics0.prompt_admin.versions.find(v=>v.prompt_type==='image_style:editorial');
  assert.deepEqual((await control()).prompt_admin.versions.find(v=>v.prompt_type==='image_style:editorial'),otherFamily);
  checks.push('Reload recovers the reviewed pair without generating; explicit publication creates one version, and a lost acknowledgement recovers/replays the same receipt without modifying another prompt family');

  await setValue('[aria-label="Versión para revertir"]',initial.base.id);await text('Motivo de la reversión','Volver a la base para cerrar la prueba local.');
  await click('Revertir como nueva versión');await ready();const reverted=await read();assert.equal(reverted.base.version,3);assert.equal(reverted.base.text,initial.base.text);
  assert.equal(reverted.versions.length,3);assert.equal(reverted.receipts[0].kind,'revert');const preserved=(await remote()).state;
  assert.deepEqual(preserved.assets.versions,pairState.assets.versions);assert.equal(preserved.jobs.jobs.length,3);await models(2);
  checks.push('Rollback appends version three and retains publication history, both compared images and their exact original bytes/metadata');

  await click('Crear propuesta');await fillProposal(reverted.base.text+'\nOtra propuesta sólo preparada.');await click('Guardar borrador');await ready();await fillCase();
  await click('Preparar prueba sin imágenes');await ready();await comparisonReady();assert.equal(await evaluate("Array.from(document.querySelectorAll('.pac-panel button')).find(b=>b.textContent==='Generar comparación (2)').disabled"),true);
  assert(await evaluate("document.querySelector('.pac-panel').innerText.includes('quedan 1')"));await models(2);assert.equal((await remote()).state.jobs.jobs.length,3);
  await evaluate("Array.from(document.querySelectorAll('summary')).find(e=>e.textContent==='Descartar esta propuesta guardada').click()");
  await text('Motivo para descartar propuesta','Cerrar la propuesta local sin usar el único cupo restante.');
  await click('Descartar propuesta');await ready();assert.equal((await read()).draft.status,'discarded');await models(2);
  await control('prompt_permission=false');const denied=await evaluate(`(async()=>{try{await ${api}.read('general');return 'leaked'}catch(e){return e.code}})()`);assert.equal(denied,'prompt_admin_forbidden');
  await send('Page.reload',{},sessionId);await wait("document.querySelector('.pad-panel')?.innerText.includes('permiso administrativo')");assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Nuevo prompt\"]')"),false);
  const final=await models(2);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);assert.deepEqual(final.worker_errors,[]);
  checks.push('With one slot remaining a fresh two-image comparison is blocked without spending; removing the explicit grant denies even the business owner and hides the administrative editor on reload');
  await writeFile(path.join(artifacts,'prompt-admin-smoke-result.json'),JSON.stringify({ok:true,checks,metrics:final,requests,external_requests:blocked,exceptions:errors},null,2));
  console.log(JSON.stringify({ok:true,checks:checks.length,simulated_images:2,simulated_text_calls:0,published_versions:final.prompt_admin.versions.filter(v=>v.prompt_type==='general').length,real_provider_calls:0},null,2));
}catch(error){if(screenshot)await screenshot('failure').catch(()=>{});await writeFile(path.join(artifacts,'prompt-admin-smoke-result.json'),JSON.stringify({ok:false,checks,error:error.stack,blocked,errors,failedResponses,requests,
  metrics:await fetch(`${base}/__desaing-test`,{headers:{authorization:'Bearer local-design-session'}}).then(r=>r.json()).catch(()=>null),ui:evaluate?await evaluate('document.body.innerText').catch(()=>null):null},null,2));throw error;
}finally{if(socket)socket.close();if(browser)browser.kill();if(server)server.kill();if(serverLog)serverLog.end();}
