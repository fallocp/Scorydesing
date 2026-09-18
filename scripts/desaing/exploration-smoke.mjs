/** Shared textual exploration in the real UI; all planner/image transports are local fixtures. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const durable = process.argv.includes('--durable');
const base = `http://127.0.0.1:${durable ? 3015 : 3014}`;
const artifactPrefix = durable ? 'exploration-server' : 'exploration';
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
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', durable ? 'vite.exploration-server-test.config.ts' : 'vite.exploration-test.config.ts'],
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
  const profile = await mkdtemp(path.join(tmpdir(), 'exploration-browser-'));
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
    await writeFile(path.join(artifacts, `${artifactPrefix}-${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  main = { sessionId, evaluate, screenshot };
  const control = async query => {
    const response = await fetch(`${base}/__desaing-test${query ? `?${query}` : ''}`, { method: query ? 'POST' : 'GET',
      headers: { authorization: 'Bearer local-design-session' } });
    assert.equal(response.status, 200); return response.json();
  };
  const deck = 'JSON.parse(localStorage.getItem(window.__presentationHarness.draftKey))';
  const recordExpression = `window.__presentationHarness.readExploration('draft:'+window.__presentationHarness.businessId,${deck}[0].id)`;
  const saved = () => evaluate(recordExpression);
  const setText = async (selector, value) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const setRegion = async (values) => {
    for (const [index, value] of values.entries()) await evaluate(`(()=>{const node=document.querySelectorAll('.mip-numeric-grid input')[${index}];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(String(value))});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  };
  const open = async () => {
    await click('Crear pieza para el slide');
    await wait("!!document.querySelector('.sdp-dialog') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Explorar diseño'&&!b.disabled)");
  };
  const close = async () => {
    await evaluate("document.querySelector('[aria-label=\"Cerrar creación de pieza\"]').click()");
    await wait("!document.querySelector('.sdp-dialog')");
  };
  const selectIdea = async index => {
    await evaluate(`document.querySelectorAll('.dep-card')[${index}].querySelector('button').click()`);
    await wait(`document.querySelectorAll('.dep-card')[${index}].querySelector('button')?.getAttribute('aria-pressed')==='true'`);
  };
  await send('Page.navigate', { url: entry }, sessionId);
  await wait("!!window.__presentationHarness?.readExploration && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
  const initialDeck = await evaluate(deck);
  await open();
  const brief = 'Explora cinco ideas de avión para la portada, con estilo editorial, manteniendo el texto y la región.';
  await setText('textarea[aria-label="Descripción de la pieza"]', brief);
  await setRegion([430, 100, 330, 300]);
  await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f8f3';ctx.fillRect(0,0,1200,675);ctx.fillStyle='#177b78';ctx.fillRect(20,20,300,40);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'portada-exploracion.png',{type:'image/png'}));
    const input=document.querySelector('.sdp-capture');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`(async()=>{const r=await ${recordExpression};return r?.value.brief===${JSON.stringify(brief)}&&r.capture_bytes>0&&r.value.region.x===430})()`);
  const originalDraft = await saved();
  await click('Explorar diseño'); await click('Ejecutar cambio'); await click('Explorar diseño');
  await wait("!!document.querySelector('[data-testid=exploration-panel]')");
  const afterModes = await saved();
  assert.equal(afterModes.capture_sha256, originalDraft.capture_sha256); assert.equal(afterModes.value.capture_name, 'portada-exploracion.png');
  assert.equal(afterModes.value.brief, brief); assert.deepEqual(afterModes.value.region, originalDraft.value.region);
  assert.equal(afterModes.value.session.context.interaction_mode, 'explore_design');
  assert.equal((await control()).planner_requests.length, 0); assert.equal((await control()).adapter_requests.length, 0);
  checks.push('mode changes preserve brief, region, exact capture bytes and versions without planner or image requests');

  await control('lose_exploration=true');
  await wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Proponer cinco ideas'&&!b.disabled)");
  await evaluate("(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Proponer cinco ideas');b.click();b.click()})()");
  await wait(`(async()=>{const r=await ${recordExpression};return r?.value.session.attempts.some(a=>a.status==='uncertain')})()`, 'lost planning acknowledgement persisted as uncertain');
  assert.equal((await control()).planner_requests.length, 1); assert.equal((await control()).adapter_requests.length, 0);
  if (durable) await control('restart_exploration=true');
  await send('Page.reload', { ignoreCache: true }, sessionId);
  await wait("!!window.__presentationHarness?.readExploration && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
  await open(); await wait("!!document.querySelector('[data-testid=exploration-panel]')");
  await click('Recuperar exploración');
  await wait("document.querySelectorAll('.dep-card').length===5", 'five textual directions recovered without dispatch');
  const recovered = await saved();
  assert.equal(recovered.capture_sha256, originalDraft.capture_sha256); assert.equal(recovered.value.brief, brief);
  assert.deepEqual(recovered.value.region, originalDraft.value.region);
  assert.equal(recovered.value.session.attempts[0].status, 'completed');
  assert.equal(recovered.value.session.sets[0].ideas.length, 5);
  assert.equal(new Set(recovered.value.session.sets[0].ideas.map(idea=>idea.idea_id)).size, 5);
  let metrics = await control(); assert.equal(metrics.planner_requests.length, 1);
  if (!durable) assert.equal(metrics.planner_recoveries, 1);
  else {
    assert.equal(metrics.text_budget.attempts, 1); assert.equal(metrics.text_budget.committed_micro_usd, 4013);
    const remoteHistory = await evaluate(`window.__presentationHarness.designClient.exploration(window.__presentationHarness.businessId).history(${JSON.stringify(recovered.value.session.context.session_id)})`);
    assert.equal(remoteHistory.length, 1); assert.deepEqual(remoteHistory[0], recovered.value.session.attempts[0]);
  }
  assert.equal(metrics.adapter_requests.length, 0); assert.equal(metrics.audits.filter(a=>a.event==='job_enqueued').length, 0);
  await click('Proponer cinco ideas'); await delay(350);
  assert.equal((await control()).planner_requests.length, 1);
  await close(); await open(); await wait("document.querySelectorAll('.dep-card').length===5");
  await setText('textarea[aria-label="Descripción de la pieza"]', `${brief} Ajuste temporal para verificar guardado.`);
  await wait(`(async()=>{const r=await ${recordExpression};return r?.value.brief.endsWith('Ajuste temporal para verificar guardado.')})()`);
  await setText('textarea[aria-label="Descripción de la pieza"]', brief);
  await wait(`(async()=>{const r=await ${recordExpression};return r?.value.brief===${JSON.stringify(brief)}})()`);
  const reopened = await saved();
  assert.equal(reopened.capture_sha256, originalDraft.capture_sha256);
  assert.deepEqual(reopened.value.session.sets[0].ideas, recovered.value.session.sets[0].ideas);
  assert.equal((await control()).planner_requests.length, 1);
  await screenshot('five-ideas');
  checks.push('StrictMode: one planning call returns five text ideas; double click, lost acknowledgement, reload, recovery and unchanged request do not duplicate it, and reopening retains editable CAS storage');

  await selectIdea(1);
  await setText('textarea[aria-label="Comentarios para ajustar la idea"]', 'Conservar el objeto y añadir más aire alrededor del ala.');
  await click('Guardar ajuste');
  await wait("document.querySelectorAll('.dep-card')[1]?.getAttribute('data-idea-version')==='2'");
  const adjusted = await saved(), set = adjusted.value.session.sets[0];
  assert.equal(set.ideas.filter(idea=>idea.idea_id===set.ideas[1].idea_id).length, 2);
  assert.deepEqual(set.ideas.slice(0, 5), recovered.value.session.sets[0].ideas);
  for (const [card, aspect] of [[0, 0], [0, 1], [1, 2], [1, 3]]) {
    await evaluate(`document.querySelectorAll('.dep-card')[${card}].querySelectorAll('input[type=checkbox]')[${aspect}].click()`);
  }
  await click('Combinar aspectos elegidos');
  await wait("document.querySelectorAll('.dep-card').length===6");
  const combined = await saved(), idea = combined.value.session.sets[0].ideas.at(-1);
  assert.equal(idea.sources.length, 2); assert.equal(idea.sources.flatMap(source=>source.aspects).length, 4);
  assert.deepEqual(combined.value.session.sets[0].ideas.slice(0,5), recovered.value.session.sets[0].ideas);
  assert.equal((await control()).planner_requests.length, 1); assert.equal((await control()).adapter_requests.length, 0);
  await screenshot('combined-idea');
  checks.push('selection, local feedback and four-aspect combination preserve the original five ideas and append versioned provenance without any provider call');

  await setText('textarea[aria-label="Mensaje sobre el diseño"]', '¿Qué cambiarías para darle más aire a la composición?');
  await click('Enviar comentario');
  await wait("document.querySelectorAll('.dep-message-assistant').length===2");
  const discussed = await saved();
  assert.equal(discussed.value.session.sets.length, 1); assert.equal(discussed.value.session.sets[0].ideas.length, 7);
  const discussion = discussed.value.session.attempts.find(attempt=>attempt.request.kind==='discussion');
  assert(discussion, 'the saved discussion retains its exact provider request');
  const historyIdeas = discussion.request.history.flatMap(message=>{
    try { const value=JSON.parse(message.text); return value.kind==='saved_text_idea'?[value]:[]; } catch { return []; }
  });
  const combinedHistory = historyIdeas.find(value=>value.selection.idea_id===idea.idea_id);
  assert(combinedHistory, 'discussion sees the locally combined idea, not only conversation messages');
  assert.equal(combinedHistory.title, idea.title); assert.deepEqual(combinedHistory.sources, idea.sources);
  const adjustedSource = combinedHistory.source_notes.find(source=>source.selection.idea_id===set.ideas[1].idea_id);
  assert.equal(adjustedSource.selection.version, 2);
  assert(adjustedSource.feedback.includes('Conservar el objeto y añadir más aire alrededor del ala.'));
  metrics = await control(); assert.equal(metrics.planner_requests.length, 2); assert.equal(metrics.planner_requests[1].kind, 'discussion');
  assert.equal(metrics.adapter_requests.length, 0); assert(metrics.planner_requests.every(call=>call.image_tools===0));
  checks.push('discussion uses one explicit text-only call with the combined idea and source feedback in its saved request, preserves six displayed directions and never invokes image tools');

  await selectIdea(5); await click('Usar esta idea');
  await wait(`(async()=>!!(await ${recordExpression})?.value.prepared_idea)()`);
  const firstPrepared = await saved(), finalFeedback = 'Mantener el ala completa.';
  assert.equal(firstPrepared.value.prepared_idea.selection.version, 1);
  await setText('textarea[aria-label="Comentarios para ajustar la idea"]', finalFeedback);
  await click('Guardar ajuste');
  await wait(`(async()=>{const r=await ${recordExpression};return !r?.value.prepared_idea&&r?.value.session.selected?.version===2&&r?.value.brief===${JSON.stringify(brief)}})()`,
    'refining a prepared idea restores the original brief and appends its next version');
  const refinedPrepared = await saved(), refinedIdeas = refinedPrepared.value.session.sets[0].ideas;
  assert.equal(refinedIdeas.length, 8); assert.deepEqual(refinedIdeas.slice(0,7), discussed.value.session.sets[0].ideas);
  assert.deepEqual(refinedIdeas.find(value=>value.idea_id===idea.idea_id&&value.version===1), idea);
  assert.deepEqual(refinedIdeas.at(-1).sources, [{...firstPrepared.value.prepared_idea.selection,aspects:['subject','composition','style','palette']}]);
  assert.deepEqual(refinedIdeas.at(-1).feedback, [finalFeedback]);
  assert.equal(refinedPrepared.value.session.selected.idea_id, idea.idea_id);
  assert.deepEqual(refinedPrepared.value.session.context, discussed.value.session.context);
  assert.deepEqual(refinedPrepared.value.session.sets[0].context, discussed.value.session.sets[0].context);
  assert.deepEqual(refinedPrepared.value.region, originalDraft.value.region);
  assert.equal(refinedPrepared.capture_sha256, originalDraft.capture_sha256);
  assert.equal(await evaluate("document.querySelector('textarea[aria-label=\"Descripción de la pieza\"]').value"), brief);
  assert.equal((await control()).planner_requests.length, 2); assert.equal((await control()).adapter_requests.length, 0);
  await click('Usar esta idea');
  await wait(`(async()=>{const r=await ${recordExpression};return r?.value.prepared_idea?.selection.version===2})()`);
  const prepared = await saved();
  assert.equal(prepared.value.prepared_idea.selection.idea_id, idea.idea_id);
  assert.equal(prepared.value.prepared_idea.original_brief, brief);
  assert.deepEqual(prepared.value.prepared_idea.context, firstPrepared.value.prepared_idea.context);
  assert(prepared.value.prepared_idea.instruction.includes(finalFeedback));
  assert(!prepared.value.brief.includes('Identidad de la captura local'));
  assert(!prepared.value.brief.includes(originalDraft.capture_sha256));
  assert.equal(prepared.value.brief, prepared.value.prepared_idea.instruction);
  assert.equal(prepared.capture_sha256, originalDraft.capture_sha256);
  assert.equal((await control()).adapter_requests.length, 0);
  await close(); await send('Page.reload', { ignoreCache: true }, sessionId);
  await wait("!!window.__presentationHarness?.readExploration && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
  await open(); await wait("document.querySelectorAll('.dep-card').length===6");
  const restored = await saved();
  assert.equal(restored.capture_sha256, prepared.capture_sha256);
  assert.deepEqual(restored.value.prepared_idea, prepared.value.prepared_idea);
  assert.deepEqual(restored.value.session.sets, prepared.value.session.sets);
  assert.deepEqual(restored.value.session.selected, prepared.value.prepared_idea.selection);
  assert.equal(restored.value.session.context.interaction_mode, 'explore_design');
  assert.equal(await evaluate("document.querySelector('textarea[aria-label=\"Descripción de la pieza\"]').value"), prepared.value.brief);
  checks.push('use idea, refine locally, use again and reload preserve the original context, append versions and retain the latest selected brief, sources and capture without provider calls');

  await setRegion([431, 100, 330, 300]); await click('Generar borrador');
  await wait("!!document.querySelector('.sdp-dialog [role=alert]')", 'changed placement is rejected before image dispatch');
  assert.equal((await control()).adapter_requests.length, 0);
  await setRegion([430, 100, 330, 300]); await click('Generar borrador');
  await wait("document.querySelector('.sdp-status')?.textContent==='Borrador listo para elegir dirección'", 'explicit idea render completed');
  const remoteState = await evaluate('window.__presentationHarness.designClient.read(window.__presentationHarness.businessId)');
  const job = remoteState.state.jobs.jobs[0];
  assert.equal(remoteState.state.jobs.jobs.length, 1); assert.equal(job.plan.operation.action, 'generate_image');
  assert.equal(job.plan.operation.context.interaction_mode, 'explore_design');
  assert.equal(job.plan.operation.context.instruction, prepared.value.brief);
  assert.deepEqual(job.plan.operation.context.placement.region, { ...originalDraft.value.region, units: 'px' });
  assert.equal(job.plan.operation.context.references[0].version_id, originalDraft.capture_sha256);
  assert.deepEqual(job.plan.operation.context.immutable_elements, ['Conservar el texto y la estructura HTML de la diapositiva.']);
  assert.equal(job.calls[0].state, 'needs_review'); assert.equal(job.calls[0].reserved_micro_usd, 1000000);
  assert.deepEqual(await evaluate(deck), initialDeck);
  const rendered = await saved();
  assert.equal(rendered.value.session.render_bindings.length, 1);
  assert.equal(rendered.value.session.render_bindings[0].operation_key, job.operation_key);
  metrics = await control(); assert.equal(metrics.planner_requests.length, 2); assert.equal(metrics.adapter_requests.length, 1);
  await screenshot('explicit-draft');
  checks.push('changed placement blocks image dispatch; one explicit draft uses the selected textual direction, exact captured bytes, original region and immutable text while staying in exploration');

  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await evaluate("document.querySelector('[data-testid=exploration-panel]').scrollIntoView({block:'start'})");
  await screenshot('tablet');
  if (durable) {
    assert.deepEqual(metrics.text_budget, { attempts: 2, committed_micro_usd: 8026, image_committed_micro_usd: 1000000 });
    const request = rendered.value.session.attempts[0].request;
    await control('text_enabled=false&restart_exploration=true');
    const replay = await evaluate(`window.__presentationHarness.designClient.exploration(window.__presentationHarness.businessId).plan(${JSON.stringify(request)})`);
    assert.equal(replay.request_key, request.request_key);
    const availability = await evaluate('window.__presentationHarness.designClient.exploration(window.__presentationHarness.businessId).capabilities()');
    assert.equal(availability, null);
    assert.equal((await control()).planner_requests.length, 2);
    checks.push('the SQL journal survives recreating the executor; completed replay and recovery work while planning is paused and keep token accounting unchanged');

    await control('text_enabled=true&fail_text=true');
    const uncertainRequest = { ...request, kind: 'discussion', request_key: crypto.randomUUID(), message: 'Comentar esta dirección, sin generar imágenes.' };
    const attempt = async input => evaluate(`(async()=>{try{await window.__presentationHarness.designClient.exploration(window.__presentationHarness.businessId).plan(${JSON.stringify(input)});return {ok:true}}catch(e){return {ok:false,code:e.code,status:e.httpStatus}}})()`);
    assert.equal((await attempt(uncertainRequest)).ok, false);
    assert.equal((await attempt(uncertainRequest)).ok, false);
    assert.equal((await attempt({ ...uncertainRequest, request_key: crypto.randomUUID() })).ok, false);
    const unresolved = await evaluate(`window.__presentationHarness.designClient.exploration(window.__presentationHarness.businessId).recover(${JSON.stringify(uncertainRequest.request_key)},${JSON.stringify(uncertainRequest)})`);
    assert.equal(unresolved, null);
    metrics = await control(); assert.equal(metrics.planner_requests.length, 3); assert.equal(metrics.adapter_requests.length, 1);
    assert.deepEqual(metrics.text_budget, { attempts: 3, committed_micro_usd: 258026, image_committed_micro_usd: 1000000 });
    checks.push('unknown provider outcome holds the full text reservation; repeated keys and a new key in the unresolved session do not call the provider again or consume another image');
  }
  assert.equal(metrics.real_provider_calls, 0); assert.deepEqual(metrics.worker_errors, []);
  const exceptions = events.filter(event => ['Runtime.exceptionThrown', 'Test.interceptionError'].includes(event.method));
  assert.deepEqual(exceptions, []); assert.deepEqual(blocked, []);
  const result = { success: true, checks, mocked_planner_calls: metrics.planner_requests.length,
    mocked_image_adapter_calls: metrics.adapter_requests.length, actual_provider_calls: 0, sql_audits: metrics.audits.length,
    capture_sha256: originalDraft.capture_sha256, planner_requests: metrics.planner_requests, text_budget: metrics.text_budget, artifacts };
  await writeFile(path.join(artifacts, `${artifactPrefix}-smoke-result.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (main) { await main.screenshot('failure').catch(() => {}); console.error(await main.evaluate('document.body.innerText').catch(() => 'Could not read failed page')); }
  console.error(error); console.error(JSON.stringify({ blocked, exceptions: events.filter(event=>event.method==='Runtime.exceptionThrown') },null,2)); process.exitCode=1;
} finally { if(send)await send('Browser.close').catch(()=>{}); socket?.close();browser?.kill();server?.kill(); }
