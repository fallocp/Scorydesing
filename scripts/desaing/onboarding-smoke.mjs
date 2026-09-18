/** Real onboarding UI against isolated local SQL/provider/cloud fixtures; all remote browser requests are blocked. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3020', entry = `${base}/onboarding`;
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], blocked = [], errors = [], requests = [], failedResponses = [];
let server, browser, socket, evaluate, screenshot;
try {
  const available = () => fetch(`${base}/experiments/presentations/`).then(r => r.ok).catch(() => false);
  if (!await available()) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.onboarding-test.config.ts'], { windowsHide: true, stdio: 'ignore' });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !await available()) await delay(150);
    assert(await available(), 'The local onboarding fixture starts');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'onboarding-browser-'));
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
    await writeFile(path.join(artifacts, `onboarding-${name}.png`), Buffer.from(shot.data, 'base64')); };
  const control = async query => { const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, {
    method: query ? 'POST' : 'GET', headers: { authorization: 'Bearer local-design-session' },
  }); assert.equal(response.status, 200); return response.json(); };
  const collectionId = '00000000-0000-4000-8000-000000000012';
  const client = 'window.__presentationHarness.designClient', business = 'window.__presentationHarness.businessId';
  const api = `${client}.onboarding(${business})`, materials = `${client}.materials(${business})`;
  const read = () => evaluate(`${api}.read()`);
  const remote = () => evaluate(`${client}.read(${business})`);
  const ready = () => wait("document.querySelector('.bsp-panel')?.getAttribute('aria-busy')==='false' && !!document.querySelector('[aria-label=\"Nombre de la marca\"]')");
  const materialReady = () => wait("!!document.querySelector('.mtl-dialog') && document.querySelector('[aria-label=\"Cerrar biblioteca de materiales\"]')?.disabled===false");
  const visualReady = () => wait("document.querySelector('.sdp-dialog')?.getAttribute('aria-busy')==='false' && document.querySelector('[aria-label=\"Cerrar creación de pieza\"]')?.disabled===false");
  const cards = '[data-testid="visual-proposal-card"]';
  const closeVisual = async () => { await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()"); await wait("!document.querySelector('.sdp-dialog')"); await ready(); };
  const models = async (images, plans = 1, analyses = 1) => {
    const m = await control(); assert.equal(m.adapter_requests.length, images); assert.equal(m.planner_requests.length, plans);
    assert.equal(m.material_requests.length, analyses); assert.equal(m.html_requests.length, 0); assert.equal(m.real_provider_calls, 0); return m;
  };
  const cardButton = async (index, label) => click(label, `document.querySelectorAll(${JSON.stringify(cards)})[${index}]`);
  const selectCard = async index => {
    await wait(`!document.querySelectorAll(${JSON.stringify(cards)})[${index}]?.querySelector('input[type=checkbox]')?.disabled`);
    await evaluate(`document.querySelectorAll(${JSON.stringify(cards)})[${index}].querySelector('input[type=checkbox]').click()`);
  };
  const exportExploration = async () => evaluate(`(async()=>{const d=(await ${api}.read()).draft;const {openExplorationStore}=await import('/src/lib/desaing/explorationStore.ts');const s=await openExplorationStore({actor_id:d.actor_id,business_id:d.business_id,session_id:'onboarding:'+d.id+':'+d.page_id+':full_design'});try{return await s.read()}finally{s.close()}})()`);
  await send('Page.navigate', { url: entry }, sessionId); await ready();
  const initial = await control(), baseTenant = initial.onboarding.tenant;
  assert.equal(await evaluate('location.pathname'), '/onboarding'); assert.equal((await read()).draft, null);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Nombre de la marca\"]').value"), baseTenant.name);
  assert.equal(await evaluate("document.querySelector('.bsp-panel').innerText.toLowerCase().includes('xending')"), false);
  assert.equal(initial.onboarding.profiles.length, 0); await models(0, 0, 0);
  checks.push('An existing business enters brand onboarding instead of redirecting; its own name/colors/fonts load without inherited brand presets or model calls');

  await click('Añadir materiales'); await materialReady();
  await evaluate(`(async()=>{const b=await fetch('/__desaing-material-pdf').then(r=>r.blob());const f=new File([b],'manual-marca.pdf',{type:'application/pdf'});const dt=new DataTransfer();dt.items.add(f);const input=document.querySelector('[aria-label="Añadir material"]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await materialReady(); await wait("document.querySelector('.mtl-material-meta')?.textContent.includes('2 páginas')");
  await click('Analizar selección'); await materialReady(); await wait("!!document.querySelector('[aria-label=\"Hallazgo primary_color\"]')");
  await text('Hallazgo primary_color', 'Principal: #123456'); await click('Guardar correcciones'); await materialReady();
  await click('Aprobar ficha'); await materialReady();
  await evaluate("document.querySelector('[aria-label=\"Hallazgo audience_pending\"]').closest('article').querySelector('input[type=checkbox]').click()");
  const approvedMaterials = await evaluate(`${materials}.read(${JSON.stringify(collectionId)})`);
  await click('Usar ficha revisada'); await wait("!document.querySelector('.mtl-dialog')"); await ready();
  const linked = (await read()).draft;
  assert.equal(linked.reviewed_materials.source_hash, approvedMaterials.review.source_hash);
  assert.equal(linked.reviewed_materials.review_revision, approvedMaterials.revision);
  assert.deepEqual(linked.reviewed_materials.finding_ids.sort(), ['primary_color', 'promise_rule']);
  assert.equal(linked.profile.colors.primary, baseTenant.primary_color); assert.equal(linked.confirmed_profile, false); assert.equal(linked.direction, null);
  assert.deepEqual((await control()).onboarding.tenant, baseTenant); await models(0, 0, 1);
  checks.push('The integrated materials dialog analyzes an actual two-page PDF, keeps corrected evidence and links the approved sheet without silently changing the brand profile');

  await evaluate(`(async()=>{const a=${materials},c=await a.read(${JSON.stringify(collectionId)}),v=c.materials[0],blob=await fetch('/__desaing-material-pdf?revision=B').then(r=>r.blob());const {materialHash}=await import('/supabase/functions/_shared/desaing/materials.ts');await a.upload({business_id:c.business_id,collection_id:c.collection_id,material_id:v.material_id,version_id:await materialHash(new Uint8Array(await blob.arrayBuffer())),expected_revision:c.revision,filename:v.filename,mime_type:'application/pdf'},blob)})()`);
  const staleMaterial = await evaluate(`(async()=>{const a=${api},d=(await a.read()).draft;d.profile.style='Cambio contra una ficha obsoleta';try{await a.save({business_id:d.business_id,expected_revision:d.revision,draft:d});return 'accepted'}catch(e){return e.code}})()`);
  assert.equal(staleMaterial, 'server_onboarding_materials_changed'); assert.equal((await read()).draft.revision, linked.revision);
  await evaluate(`(async()=>{const a=${materials},c=await a.read(${JSON.stringify(collectionId)});await a.save({business_id:c.business_id,collection_id:c.collection_id,expected_revision:c.revision,selected:${JSON.stringify(approvedMaterials.selected)},brief:${JSON.stringify(approvedMaterials.brief)},review:${JSON.stringify(approvedMaterials.review)}})})()`);
  await click('Revisar materiales'); await materialReady();
  await evaluate("document.querySelector('[aria-label=\"Hallazgo audience_pending\"]').closest('article').querySelector('input[type=checkbox]').click()");
  await click('Usar ficha revisada'); await wait("!document.querySelector('.mtl-dialog')"); await ready();
  assert((await read()).draft.reviewed_materials.review_revision > linked.reviewed_materials.review_revision);
  await click('Aplicar sugerencias de la ficha al borrador'); await ready();
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Color principal\"]').value"), '#123456');
  await text('Audiencia', 'Personas que buscan información clara.'); await text('Estilo visual', 'Editorial limpio, con aire y jerarquía legible.');
  await setValue('[aria-label="Tipografía de títulos"]', 'Georgia');
  await click('Confirmar perfil revisado'); await ready(); let confirmed = (await read()).draft;
  assert.equal(confirmed.confirmed_profile, true); assert.equal(confirmed.profile.colors.primary, '#123456'); assert.equal(confirmed.profile.fonts.display, 'Georgia');
  assert.deepEqual((await control()).onboarding.tenant, baseTenant); await models(0, 0, 1);
  checks.push('Changing PDF bytes blocks stale brand saves; relinking the authoritative review and explicitly applying/confirming suggestions creates a new design revision without publishing or reanalyzing');

  await text('Tono de comunicación', 'Claro y cercano.');
  await control('change_brand_base=true'); await click('Revisar datos actuales'); await ready();
  await wait("!!document.querySelector('[aria-label=\"Comparar datos actuales\"]')");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Tono de comunicación\"]').value"), 'Claro y cercano.');
  assert(await evaluate("document.querySelector('[aria-label=\"Comparar datos actuales\"]').innerText.includes('Nombre cambiado en otra sesión')"));
  const beforeRebase = (await read()).draft; assert.equal(beforeRebase.revision, confirmed.revision);
  await screenshot('desktop-base-review'); await click('Conservar mis datos editados'); await ready();
  const rebased = (await read()).draft;
  assert.equal(rebased.id, confirmed.id); assert.equal(rebased.page_id, confirmed.page_id);
  assert.equal(rebased.profile.name, confirmed.profile.name); assert.equal(rebased.profile.tone, 'Claro y cercano.');
  assert.equal(rebased.confirmed_profile, false); assert.equal(rebased.direction, null);
  assert.equal(rebased.design_revision, confirmed.design_revision + 1); assert.notEqual(rebased.base_fingerprint, confirmed.base_fingerprint);
  assert.deepEqual(rebased.reviewed_materials, confirmed.reviewed_materials);
  await control('change_brand_base=false'); await click('Revisar datos actuales'); await ready();
  await click('Conservar mis datos editados'); await ready(); await click('Confirmar perfil revisado'); await ready();
  confirmed = (await read()).draft; assert.equal(confirmed.confirmed_profile, true); assert.equal(confirmed.profile.tone, 'Claro y cercano.');
  assert.deepEqual((await control()).onboarding.tenant, baseTenant); await models(0, 0, 1);
  checks.push('A concurrent brand change opens an explicit comparison without losing unsaved edits; keeping them preserves the draft/page and current materials, advances the design revision and requires profile confirmation again, without rendering or publishing');

  await click('Explorar dirección visual'); await visualReady();
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Texto aprobado\"]').readOnly"), true);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Texto aprobado\"]').value"), confirmed.profile.name);
  assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Alcance del diseño\"]')"), false);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>['Dejar como imagen','Montar pieza aprobada','Usar diseño para HTML'].includes(b.textContent.trim()))"), false);
  await click('Proponer cinco ideas'); await visualReady(); await wait(`document.querySelectorAll(${JSON.stringify(cards)}).length===5`);
  const ideas = await exportExploration(), hash = await evaluate(`(async()=>{const {brandSetupDesignHash}=await import('/supabase/functions/_shared/desaing/onboarding.ts');return brandSetupDesignHash((await ${api}.read()).draft)})()`);
  assert.equal(ideas.value.session.context.workspace, 'onboarding'); assert.equal(ideas.value.session.context.brand_id, confirmed.business_id);
  assert.deepEqual(ideas.value.session.context.target, { document_type: 'special', document_id: confirmed.id, page_id: confirmed.page_id, revision: String(confirmed.design_revision) });
  assert(ideas.value.session.context.immutable_elements.includes(`ScoryDesign: dirección de marca confirmada ${hash}.`));
  assert.equal(ideas.value.capture, null); await models(0);
  await evaluate("document.querySelectorAll('.dep-card')[0].querySelectorAll('.dep-aspects input')[0].click();document.querySelectorAll('.dep-card')[0].querySelectorAll('.dep-aspects input')[1].click();document.querySelectorAll('.dep-card')[1].querySelectorAll('.dep-aspects input')[2].click();document.querySelectorAll('.dep-card')[1].querySelectorAll('.dep-aspects input')[3].click()");
  await click('Combinar aspectos elegidos'); await visualReady(); await wait(`document.querySelectorAll(${JSON.stringify(cards)}).length===6`);
  const beforeBatch = await control(); await click('Seleccionar pendientes');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.vpg-panel button')).find(b=>b.textContent.trim()==='Generar borradores seleccionados (5)').disabled"), true);
  assert.equal((await control()).objects, beforeBatch.objects); assert.equal((await remote()).state.jobs.jobs.length, 0); await models(0);
  await resize(820, 1180); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true); await screenshot('tablet-five-ideas');
  checks.push('The shared engine prepares five brand directions and a sixth textual combination, freezes name/profile hash and true draft/page identity, and blocks five renders against the unchanged four-image quota before uploading');

  await evaluate("document.querySelectorAll('.vpg-panel input[type=checkbox]:checked').forEach(input=>input.click())"); await selectCard(0);
  await click('Generar borradores seleccionados (1)'); await visualReady(); await wait(`document.querySelectorAll(${JSON.stringify(cards)})[0].getAttribute('data-status')==='needs_review'`);
  await models(1);
  await control('executor=responses_image'); await click('Recuperar propuestas'); await visualReady();
  await selectCard(5); await click('Generar borradores seleccionados (1)'); await visualReady();
  await wait(`document.querySelectorAll(${JSON.stringify(cards)})[5].getAttribute('data-status')==='needs_review'`);
  const lowState = (await remote()).state; assert.equal(lowState.jobs.jobs.length, 2);
  assert.equal(lowState.jobs.jobs[0].plan.operation.image.executor, 'image_api'); assert.equal(lowState.jobs.jobs[1].plan.operation.image.executor, 'responses_image');
  assert.notEqual(lowState.jobs.jobs[0].calls[0].receipt.outputs[0].asset.version_id, lowState.jobs.jobs[1].calls[0].receipt.outputs[0].asset.version_id);
  for (const job of lowState.jobs.jobs) { assert.deepEqual(job.plan.operation.context.target, ideas.value.session.context.target); assert.equal(job.plan.operation.context.references.length, 0); assert.equal(job.plan.operation.context.placement, undefined); }
  await cardButton(5, 'Revisar borrador'); await visualReady(); await click('Aprobar dirección'); await visualReady(); await models(2);
  assert.equal((await control()).onboarding.profiles.length, 0);
  await click('Generar versión en media'); await visualReady(); await wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Aprobar versión final'&&!b.disabled)");
  await click('Aprobar versión final'); await visualReady(); await wait("Array.from(document.querySelectorAll('.sdp-dialog button')).some(b=>b.textContent.trim()==='Usar dirección revisada'&&!b.disabled)");
  const approvedState = (await remote()).state, medium = approvedState.jobs.jobs[2], finalAsset = medium.calls[0].receipt.outputs[0].asset;
  assert.equal(medium.calls[0].state, 'approved'); assert.deepEqual(medium.plan.operation.context.target, lowState.jobs.jobs[1].plan.operation.context.target);
  assert.deepEqual(medium.plan.operation.context.immutable_elements, lowState.jobs.jobs[1].plan.operation.context.immutable_elements);
  assert.deepEqual(medium.plan.operation.context.base_asset, lowState.jobs.jobs[1].calls[0].receipt.outputs[0].asset);
  const rendered = await models(3); assert.deepEqual(rendered.adapter_requests.map(r=>[r.route.split('/v1/')[1],r.quality,r.input_images]),
    [['images/generations','low',0],['responses','low',0],['responses','medium',1]]);
  await closeVisual(); assert.equal((await read()).draft.direction, null); assert.equal((await control()).onboarding.profiles.length, 0);
  await click('Explorar dirección visual'); await visualReady(); await click('Usar dirección revisada'); await wait("!document.querySelector('.sdp-dialog')"); await ready();
  const chosen = (await read()).draft; assert.deepEqual(chosen.direction, finalAsset); assert.equal(chosen.design_revision, confirmed.design_revision);
  await wait("!!document.querySelector('.bsp-preview img')"); await models(3); assert.deepEqual((await control()).onboarding.tenant, baseTenant);
  checks.push('Both real adapters run against fake transports: two distinct low images and one medium; direction approval does not render, closing final review does not choose or publish, and explicit reuse retains the exact approved parent and profile version');

  await send('Page.reload', {}, sessionId); await ready(); await wait("!!document.querySelector('.bsp-preview img')");
  assert.deepEqual((await read()).draft.direction, finalAsset); await models(3);
  const cas = await evaluate(`(async()=>{const a=${api},d=(await a.read()).draft;d.revision--;d.profile.style+=' Edición obsoleta';try{await a.save({business_id:d.business_id,expected_revision:d.revision,draft:d});return 'accepted'}catch(e){return e.code}})()`);
  assert.equal(cas, 'server_onboarding_revision_conflict');
  const foreign = await evaluate(`(async()=>{try{await ${client}.onboarding(window.__presentationHarness.otherBusinessId).read();return 'leaked'}catch(e){return e.code}})()`);
  assert.equal(foreign, 'business_access_denied');
  const publishRequest = { business_id: chosen.business_id, publish_id: chosen.id, draft_id: chosen.id, expected_revision: chosen.revision };
  await control('change_brand_base=true');
  const changedBase = await evaluate(`(async()=>{try{await ${api}.publish(${JSON.stringify(publishRequest)});return 'accepted'}catch(e){return e.code}})()`);
  assert.equal(changedBase, 'server_onboarding_base_changed'); assert.equal((await control()).onboarding.profiles.length, 0); await control('change_brand_base=false');
  await resize(1440, 1100); await screenshot('desktop-reviewed-before-publish');
  checks.push('Reload restores the reviewed direction without new model work; stale draft CAS, foreign business access and a concurrent published-base change reject before profile publication');

  await control('lose_onboarding=true'); await click('Guardar dirección de marca'); await ready();
  await wait("Array.from(document.querySelectorAll('.bsp-panel button')).some(b=>b.textContent.trim()==='Recuperar guardado'&&!b.disabled)");
  const committed = await control(); assert.equal(committed.onboarding.profiles.length, 1); assert.equal(committed.onboarding.draft.status, 'published');
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('scory-brand-setup-publication:'+${JSON.stringify(chosen.business_id)}+':'+${JSON.stringify(chosen.actor_id)})).input.publish_id`), chosen.id);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Color principal\"]').disabled"), true);
  await click('Recuperar guardado'); await ready(); await wait("document.querySelector('.bsp-panel').innerText.includes('Dirección de marca guardada')");
  const receipt = (await read()).draft.receipt, replay = await evaluate(`${api}.publish(${JSON.stringify(publishRequest)})`);
  assert.deepEqual(replay, receipt); assert.deepEqual(receipt.direction, finalAsset); assert.equal(receipt.profile_version, 1);
  await send('Page.reload', {}, sessionId); await ready(); assert.equal((await read()).draft.receipt.publish_id, chosen.id);
  const final = await models(3); assert.equal(final.onboarding.profiles.length, 1); assert.equal(final.onboarding_recoveries, 1);
  assert.equal(final.onboarding.tenant.primary_color, '#123456'); assert.equal(final.onboarding.tenant.fonts.display, 'Georgia');
  for (const key of ['master_prompt','legal_text','logo_url','compliance']) assert.deepEqual(final.onboarding.tenant[key], baseTenant[key]);
  assert.equal(final.onboarding.profiles[0].base_brand.name, chosen.profile.name);
  checks.push('Explicit publication atomically synchronizes reviewed business fields and one creative-profile version; a lost acknowledgement freezes the same publish ID and recovers/replays without duplicates, preserving master prompt, legal text, logo and compliance');

  await evaluate(`window.__onboardingSession=${client}.session;${client}.session=async()=>({actorId:'e1efb132-94ce-483a-a204-dce27c63b61c'});window.dispatchEvent(new Event('focus'))`);
  await wait("document.querySelector('.bsp-error')?.textContent.includes('Cambió tu sesión') && !document.querySelector('[aria-label=\"Nombre de la marca\"]') && !document.querySelector('.bsp-preview img')");
  await evaluate(`${client}.session=window.__onboardingSession`); assert.equal((await read()).draft.receipt.publish_id, chosen.id);
  assert.deepEqual(blocked, []); assert.deepEqual(errors, []); assert.deepEqual(final.worker_errors, []);
  checks.push('Changing actor removes the old brand draft and visual preview; all model work and SQL mutations stay inside the isolated local fixture');
  await writeFile(path.join(artifacts, 'onboarding-smoke-result.json'), JSON.stringify({ ok:true, checks, metrics:final, requests, external_requests:blocked, exceptions:errors }, null, 2));
  console.log(JSON.stringify({ok:true,checks:checks.length,simulated_images:final.adapter_requests.length,simulated_text_plans:final.planner_requests.length,
    simulated_material_analyses:final.material_requests.length,simulated_token_counts:final.material_counts.length,profiles:final.onboarding.profiles.length,paid_calls:0},null,2));
} catch (error) {
  if (screenshot) await screenshot('failure').catch(()=>{});
  await writeFile(path.join(artifacts,'onboarding-smoke-result.json'),JSON.stringify({ok:false,checks,error:error.stack,blocked,errors,failedResponses,requests,
    ui:evaluate?await evaluate('document.body.innerText').catch(()=>null):null},null,2)); throw error;
} finally { if(socket)socket.close();if(browser)browser.kill();if(server)server.kill(); }
