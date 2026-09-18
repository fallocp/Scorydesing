/** Real production UI against isolated local SQL/provider/cloud fixtures; all remote browser requests are blocked. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3021', entry = `${base}/production`;
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], blocked = [], errors = [], requests = [], failedResponses = [];
let server, browser, socket, evaluate, screenshot;
try {
  const available = () => fetch(`${base}/experiments/presentations/`).then(r => r.ok).catch(() => false);
  if (!await available()) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.production-test.config.ts'], { windowsHide: true, stdio: 'ignore' });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !await available()) await delay(150);
    assert(await available(), 'The local production fixture starts');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'production-browser-'));
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
      const logical = /^https?:/.test(request.url) && new URL(request.url).origin === 'https://local-generation.invalid';
      const remote = /^https?:/.test(request.url) && new URL(request.url).origin !== base && !logical;
      if (remote) blocked.push(request.url);
      else if (request.method !== 'GET') requests.push({ method: request.method, path: new URL(request.url).pathname });
      void send(remote ? 'Fetch.failRequest' : 'Fetch.continueRequest', remote ? { requestId, errorReason: 'BlockedByClient' } : { requestId, ...(logical ? {url:base+new URL(request.url).pathname+new URL(request.url).search} : {}) }, message.sessionId).catch(error => errors.push(error.message));
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
    await writeFile(path.join(artifacts, `production-${name}.png`), Buffer.from(shot.data, 'base64')); };
  const control = async query => { const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
    method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
  }); assert.equal(response.status, 200); return response.json(); };
  const client='window.__presentationHarness.designClient', business='window.__presentationHarness.businessId',api=`${client}.production(${business})`;
  const fixture=await fetch(`${base}/__desaing-production-fixture`).then(r=>r.json());
  const read=name=>evaluate(`${api}.read(${JSON.stringify(fixture.sources[name])})`),remote=()=>evaluate(`${client}.read(${business})`);
  const ready=()=>wait("!!document.querySelector('.sip-panel') && Array.from(document.querySelectorAll('.sip-panel button')).some(b=>b.textContent==='Cerrar'&&!b.disabled)");
  const visualReady=()=>wait("document.querySelector('.sdp-dialog')?.getAttribute('aria-busy')==='false' && document.querySelector('[aria-label=\"Cerrar creación de pieza\"]')?.disabled===false");
  const closeVisual=async()=>{await visualReady();await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()");await wait("!document.querySelector('.sdp-dialog')");await ready()};
  const closeStudio=async()=>{await click('Cerrar',"document.querySelector('.sip-panel')");await wait("!document.querySelector('.sip-panel') && !document.querySelector('.sdp-dialog')")};
  const open=async name=>{await click(name);await ready()};
  const models=async(images,plans=0)=>{const m=await control();assert.equal(m.adapter_requests.length,images);assert.equal(m.planner_requests.length,plans);
    assert.equal(m.html_requests.length,0);assert.equal(m.material_requests.length,0);assert.equal(m.real_provider_calls,0);return m};
  const cards='[data-testid="visual-proposal-card"]';
  const approve=async()=>{await click('Aprobar versión final');await visualReady();await wait(`!!(${button('Usar imagen aprobada')})`)};
  const asset=job=>job.calls[0].receipt.outputs[0].asset;
  await send('Page.navigate',{url:entry},sessionId);await wait(`!!(${button('Abrir imagen individual')})`);
  const initial=await models(0);assert.equal(initial.production.mockups.length,5);
  await open('Abrir imagen sin texto');const missing=(await read('empty')).snapshot;
  assert.equal(missing.copy.origin,'unavailable');assert.equal(await evaluate(`!!(${button('Editar con píxeles')})`),false);
  await evaluate("document.querySelector('.sip-copy input[type=checkbox]').click()");await click('Confirmar texto');await ready();
  const empty=(await read('empty')).snapshot;assert.equal(empty.copy.origin,'user_confirmed');assert.equal(empty.copy.text,'');assert.notEqual(empty.id,missing.id);
  await send('Page.reload',{},sessionId);await ready();assert.equal((await read('empty')).snapshot.id,empty.id);await models(0);await closeStudio();
  checks.push('An actual PNG without structured copy requires confirmation; explicit no-text creates an immutable snapshot that survives reload without rendering');

  await open('Abrir prompt largo');const long=(await read('long')).snapshot;assert(long.prompt.length>4000);
  await click('Regenerar desde el prompt');await visualReady();await click('Generar imagen');await visualReady();
  await wait("document.querySelector('.sdp-dialog').innerText.includes('El encargo supera el límite')");assert.equal((await read('long')).snapshot.prompt,long.prompt);
  assert.equal((await remote()).state.jobs.jobs.length,0);await models(0);await closeVisual();await closeStudio();
  checks.push('Over-limit regeneration retains the full saved prompt and blocks before enqueue or provider dispatch');

  await open('Abrir imagen individual');const original=(await read('image')).snapshot;
  await click('Editar con píxeles');await visualReady();await text('Descripción de la pieza','Cambiar el fondo por uno claro.');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Texto aprobado\"]').readOnly"),true);
  await click('Generar imagen');await visualReady();await approve();
  const first=(await remote()).state.jobs.jobs[0];assert.equal(first.plan.operation.action,'edit_image');assert.equal(first.plan.operation.context.interaction_mode,'execute_change');
  assert.equal(first.plan.operation.context.workspace,'production');assert.deepEqual(first.plan.operation.context.base_asset,original.base_asset);
  assert.deepEqual(first.plan.operation.context.target,{document_type:'image',document_id:original.id,revision:'1'});
  assert.equal(first.plan.operation.context.copy_version_id,original.copy.version_id);assert.equal(first.calls[0].state,'approved');
  const one=await models(1);assert.equal(one.adapter_requests[0].input_images,1);assert.deepEqual(one.adapter_requests[0].input_hashes,[original.base_asset.version_id]);
  assert(one.adapter_requests[0].route.endsWith('/images/edits'));assert.equal(first.plan.operation.image.quality,'low');
  await control('lose_production=true');await click('Usar imagen aprobada');await ready();await wait("!!document.querySelector('.sip-pending')");
  const pendingApply=await evaluate(`JSON.parse(Object.entries(localStorage).find(([key])=>key.startsWith('scory-studio-image:'))[1])`);
  assert.equal((await control()).production.mockups.length,6);assert.equal(pendingApply.input.result_asset.version_id,asset(first).version_id);
  await send('Page.reload',{},sessionId);await ready();await wait("!!document.querySelector('.sip-comparison img[alt=\"Variante revisada guardada\"]')");
  const individual=(await read('image')).history[0];assert.equal(individual.apply_id,pendingApply.input.apply_id);
  assert.deepEqual(await evaluate(`${api}.apply(${JSON.stringify(pendingApply.input)})`),individual);
  const individualState=await models(1);assert.equal(individualState.production.mockups.length,6);
  assert.deepEqual(individualState.production.mockups.find(m=>m.id===original.base_mockup_id),initial.production.mockups.find(m=>m.id===original.base_mockup_id));
  const child=individualState.production.mockups.find(m=>m.id===individual.mockup_id);assert.equal(child.parent_mockup_id,original.base_mockup_id);assert.equal(child.uploaded_at,null);
  await resize(820,1180);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('tablet-comparison');
  await resize(1440,1100);await screenshot('desktop-comparison');await closeStudio();
  checks.push('Direct editing sends original bytes once, approves low explicitly and preserves the original; lost-ACK reload and replay recover one saved child and the same receipt without rendering again');

  await open('Abrir carrusel de copys');const carousel=(await read('copy')).snapshot;
  assert.deepEqual(carousel.canvas,{width:1080,height:1350});assert.deepEqual(carousel.output_canvas,{width:1024,height:1280});
  await click('Editar con píxeles');await visualReady();assert(await evaluate("document.querySelector('[data-testid=\"production-output-size\"]').textContent.includes('1024 × 1280')"));
  await text('Descripción de la pieza','Explorar una composición editorial con aire, conservando el texto y las cifras.');await click('Explorar diseño');await visualReady();
  await click('Proponer cinco ideas');await visualReady();await wait(`document.querySelectorAll(${JSON.stringify(cards)}).length===5`);
  assert(await evaluate("document.querySelector('.sdp-dialog').innerText.includes('Las ideas parten del encargo y el texto confirmado')"));
  await click('Seleccionar pendientes');assert.equal(await evaluate("Array.from(document.querySelectorAll('.vpg-panel button')).find(b=>b.textContent.trim()==='Generar borradores seleccionados (5)').disabled"),true);
  await models(1,1);assert.equal((await remote()).state.jobs.jobs.length,1);
  await evaluate("document.querySelectorAll('.vpg-panel input[type=checkbox]:checked').forEach(e=>e.click())");
  await evaluate(`document.querySelectorAll(${JSON.stringify(cards)})[0].querySelector('input[type=checkbox]').click()`);
  await click('Generar borradores seleccionados (1)');await visualReady();await wait(`document.querySelectorAll(${JSON.stringify(cards)})[0].getAttribute('data-status')==='needs_review'`);
  await click('Revisar borrador',`document.querySelectorAll(${JSON.stringify(cards)})[0]`);await visualReady();await click('Aprobar dirección');await visualReady();await models(2,1);
  await click('Generar versión en media');await visualReady();await approve();const staged=(await remote()).state.jobs.jobs;
  const low=staged[1],medium=staged[2];assert.equal(low.plan.operation.action,'edit_image');assert.equal(low.plan.operation.context.interaction_mode,'explore_design');
  assert.deepEqual(low.plan.operation.context.base_asset,carousel.base_asset);assert.deepEqual(medium.plan.operation.context.base_asset,asset(low));
  assert.deepEqual(low.plan.operation.context.target,{document_type:'carousel',document_id:carousel.id,slide_id:fixture.sources.copy.slide_id,revision:'1'});
  assert.deepEqual(medium.plan.operation.context.target,low.plan.operation.context.target);assert.equal(medium.calls[0].state,'approved');
  const three=await models(3,1);assert.deepEqual(three.adapter_requests[1].input_dimensions,[carousel.canvas]);
  assert.deepEqual(three.adapter_requests[1].input_hashes,[carousel.base_asset.version_id]);assert.deepEqual(three.adapter_requests[2].input_dimensions,[carousel.output_canvas]);
  assert.deepEqual(three.adapter_requests[2].input_hashes,[asset(low).version_id]);
  checks.push('Five textual ideas reuse the existing gallery; quota blocks five renders, and explicit low-to-medium preserves the real slot/copy version and 4:5 bitmap ratio without duplicated base inputs');
  await click('Usar imagen aprobada');await ready();await wait("!!document.querySelector('.sip-comparison img[alt=\"Variante revisada guardada\"]')");
  const copyReceipt=(await read('copy')).history[0],afterCopy=await control(),expectedRow=structuredClone(initial.production.copy_rows[0]);
  Object.assign(expectedRow.image_meta.carousel.slots[0],{mockupId:copyReceipt.mockup_id,imageUrl:copyReceipt.image_url,status:'done'});
  assert.deepEqual(afterCopy.production.copy_rows[0],expectedRow);assert.equal(afterCopy.production.mockups.length,7);await screenshot('carousel-comparison');await closeStudio();
  checks.push('Applying the reviewed medium changes only the selected carousel image pointer/status, retaining literal copy, prompt, plan, editorial fields and the sibling slot');

  await control('executor=responses_image');await open('Abrir carrusel de ideas');const generated=(await read('generated')).snapshot;
  await click('Regenerar desde el prompt');await visualReady();await click('Generar imagen');await visualReady();await approve();
  const regenerated=(await remote()).state.jobs.jobs[3];assert.equal(regenerated.plan.operation.action,'regenerate_image');assert.equal(regenerated.plan.operation.context.base_asset,undefined);
  assert.deepEqual(regenerated.plan.operation.context.references,[]);assert(regenerated.plan.operation.context.instruction.includes(generated.prompt));
  const four=await models(4,1);assert(four.adapter_requests[3].route.endsWith('/responses'));assert.equal(four.adapter_requests[3].input_images,0);
  await click('Usar imagen aprobada');await ready();await wait("!!document.querySelector('.sip-comparison img[alt=\"Variante revisada guardada\"]')");
  const generatedReceipt=(await read('generated')).history[0],last=await control(),expectedGenerated=structuredClone(initial.production.generated_rows[0]);
  Object.assign(expectedGenerated.piece_v2.carousel.slots[0],{mockupId:generatedReceipt.mockup_id,imageUrl:generatedReceipt.image_url,status:'done'});
  assert.deepEqual(last.production.generated_rows[0],expectedGenerated);assert.equal(last.production.mockups.length,8);
  checks.push('Regeneration uses the saved full prompt through Responses with zero implicit image inputs and applies only the real generated-ideas carousel slot');

  await closeStudio();await open('Abrir carrusel de ideas');await wait("!!document.querySelector('.sip-history img')");
  assert.equal((await read('generated')).history[0].apply_id,generatedReceipt.apply_id);await models(4,1);
  const foreign=await evaluate(`(async()=>{try{await ${client}.production(window.__presentationHarness.otherBusinessId).read(${JSON.stringify(fixture.sources.image)});return 'leaked'}catch(e){return e.code}})()`);
  assert.equal(foreign,'business_access_denied');
  await evaluate(`window.__productionSession=${client}.session;${client}.session=async()=>({actorId:'e1efb132-94ce-483a-a204-dce27c63b61c'});window.dispatchEvent(new Event('focus'))`);
  await wait("!!document.querySelector('.sip-error') && !document.querySelector('.sip-comparison img')");await evaluate(`${client}.session=window.__productionSession`);
  const final=await models(4,1);assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);assert.deepEqual(final.worker_errors,[]);
  checks.push('Saved histories reopen without new calls; foreign business is denied and actor changes remove the previous private source and preview');
  await writeFile(path.join(artifacts,'production-smoke-result.json'),JSON.stringify({ok:true,checks,metrics:final,requests,external_requests:blocked,exceptions:errors},null,2));
  console.log(JSON.stringify({ok:true,checks:checks.length,simulated_images:final.adapter_requests.length,simulated_text_plans:final.planner_requests.length,legacy_mockups:final.production.mockups.length,real_provider_calls:0},null,2));
}catch(error){if(screenshot)await screenshot('failure').catch(()=>{});await writeFile(path.join(artifacts,'production-smoke-result.json'),JSON.stringify({ok:false,checks,error:error.stack,blocked,errors,failedResponses,requests,metrics:await fetch(`${base}/__desaing-test`,{headers:{authorization:'Bearer local-design-session'}}).then(r=>r.json()).catch(()=>null),state:evaluate?await evaluate('window.__presentationHarness.designClient.read(window.__presentationHarness.businessId)').catch(()=>null):null,ui:evaluate?await evaluate('document.body.innerText').catch(()=>null):null},null,2));throw error;
}finally{if(socket)socket.close();if(browser)browser.kill();if(server)server.kill();}
