/** Reusable visual proposals in the real UI; loopback SQL and fake providers only. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3016';
const withReferences = process.argv.includes('--references');
const artifactPrefix = withReferences ? 'proposals-references' : 'proposals';
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
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.proposals-test.config.ts'],
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
  const setText = async (selector, value) => {
    await wait(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled`);
    return evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  };
  const setRegion = async (values) => {
    for (const [index, value] of values.entries()) await evaluate(`(()=>{const node=document.querySelectorAll('.mip-numeric-grid input')[${index}];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(String(value))});node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  };
  const open = async () => {
    await click(await evaluate("Array.from(document.querySelectorAll('button')).find(b=>/^Crear pieza (para el slide|de prueba)$/.test(b.textContent.trim())).textContent.trim()"));
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
  const gallery = '[data-testid="visual-proposals-gallery"]';
  const cards = '[data-testid="visual-proposal-card"]';
  const proposalRecord = `window.__presentationHarness.readVisualProposals('draft:'+window.__presentationHarness.businessId,${deck}[0].id)`;
  const remoteState = () => evaluate('window.__presentationHarness.designClient.read(window.__presentationHarness.businessId)');
  const waitIdle = () => wait("document.querySelector('.sdp-dialog')?.getAttribute('aria-busy')==='false'");
  const cardClick = async (index, title) => {
    const selector = `document.querySelectorAll(${JSON.stringify(cards)})[${index}]`;
    const titleValue = JSON.stringify(title);
    await wait(`Array.from(${selector}?.querySelectorAll('button')??[]).some(b=>b.textContent.trim()===${titleValue}&&!b.disabled)`);
    await evaluate(`Array.from(${selector}.querySelectorAll('button')).find(b=>b.textContent.trim()===${titleValue}&&!b.disabled).click()`);
  };
  const attachCapture = async () => evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=675;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f7f8f3';ctx.fillRect(0,0,1200,675);ctx.fillStyle='#177b78';ctx.fillRect(20,20,300,40);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],'portada-propuestas.png',{type:'image/png'}));
    const input=document.querySelector('.sdp-capture');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const launch = async () => {
    await send('Page.navigate', { url: entry }, sessionId);
    await wait("!!window.__presentationHarness?.readExploration && Array.from(document.querySelectorAll('button')).some(b=>/^Crear pieza (para el slide|de prueba)$/.test(b.textContent.trim()))");
    await open();
  };
  const plan = async brief => {
    await setText('textarea[aria-label="Descripción de la pieza"]', brief);
    await setRegion([430, 100, 330, 300]); await attachCapture();
    if (withReferences) {
      for (let index = 0; index < 3; index++) {
        await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=80;canvas.height=80;
          const ctx=canvas.getContext('2d');ctx.fillStyle=${JSON.stringify(['#fc8033','#eecc44','#116a8a'][index])};ctx.fillRect(0,0,80,80);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],${JSON.stringify(['mundo.png','moneda.png','estilo.png'][index])},{type:'image/png'}));
          const input=document.querySelector('[aria-label="Añadir referencia visual"]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await wait(`document.querySelectorAll('[data-testid=presentation-reference-item]').length===${index+1}`);
        await waitIdle();
      }
      await evaluate(`(()=>{const input=document.querySelector('[aria-label="Uso de estilo.png"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,'image_style_reference');input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitIdle();
      await wait(`(async()=>{const r=await ${recordExpression};return r?.value.session.context.instruction.includes('image_style_reference')})()`);
    }
    await wait(`(async()=>{const r=await ${recordExpression};return r?.value.brief===${JSON.stringify(brief)}&&r.capture_bytes>0&&r.value.region.x===430})()`);
    await click('Explorar diseño'); await click('Proponer cinco ideas');
    await wait(`document.querySelectorAll(${JSON.stringify(cards)}).length===5`, 'five unrendered visual proposals');
    await waitIdle();
  };
  await launch();
  const initialDeck = await evaluate(deck);
  await plan('Explora cinco ideas de avión para la portada, conservando el texto editable y la región.');
  const originalDraft = await saved();
  assert.equal((await control()).planner_requests.length, 1);
  assert.equal((await control()).simulated_dispatches, 0);
  assert.equal((await remoteState()).state.jobs.jobs.length, 0);
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(cards + ' img')}).length`), 0);
  checks.push('five textual directions prepare five visual proposal cards without image calls or changing the editable slide');

  await control('quota=1'); await click('Recuperar estado'); await waitIdle();
  await wait("document.querySelector('[data-testid=server-generation-quota]')?.textContent.includes('1.')");
  await click('Seleccionar pendientes');
  await wait("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Generar borradores seleccionados (5)'&&b.disabled)");
  assert.equal((await control()).simulated_dispatches, 0);
  assert.equal((await remoteState()).state.jobs.jobs.length, 0);
  checks.push('one remaining image slot disables a five-proposal batch before uploads or image admission');

  await control('quota=20&pause=true'); await click('Recuperar estado'); await waitIdle();
  await click('Generar borradores seleccionados (5)');
  await wait(`(async()=>{const s=await window.__presentationHarness.designClient.read(window.__presentationHarness.businessId);return s.state.jobs.jobs.length===1})()`, 'only first queued proposal admitted while worker paused');
  await waitIdle();
  assert.equal((await control()).simulated_dispatches, 0);
  const pausedProposals = await evaluate(proposalRecord);
  assert.equal(Object.values(pausedProposals.value.submissions).filter(item=>item.state==='saved').length, 4);
  assert.equal(Object.values(pausedProposals.value.submissions).filter(item=>item.state==='confirmed').length, 1);
  await close(); await launch();
  await wait(`document.querySelectorAll(${JSON.stringify(cards)}).length===5`);
  await click('Recuperar propuestas'); await waitIdle();
  assert.equal((await control()).simulated_dispatches, 0);
  assert.equal((await remoteState()).state.jobs.jobs.length, 1);
  assert.equal((await saved()).capture_sha256, originalDraft.capture_sha256);
  const reloadedProposals = await evaluate(proposalRecord);
  assert.deepEqual(reloadedProposals.value.sets, pausedProposals.value.sets);
  assert.deepEqual(reloadedProposals.value.uploads, pausedProposals.value.uploads);
  await control('pause=false');
  await wait(`(async()=>{const s=await window.__presentationHarness.designClient.read(window.__presentationHarness.businessId);return s.state.jobs.jobs[0]?.calls[0]?.state==='needs_review'})()`);
  await click('Recuperar propuestas'); await waitIdle();
  assert.equal((await control()).simulated_dispatches, 1);
  assert.equal((await remoteState()).state.jobs.jobs.length, 1);
  checks.push('pausing after admission preserves the other four drafts; reload and recovery keep the same first operation and do not resume the batch automatically');

  await click('Seleccionar pendientes');
  await click('Generar borradores seleccionados (4)');
  await wait(`(async()=>{const s=await window.__presentationHarness.designClient.read(window.__presentationHarness.businessId);return s.state.jobs.jobs.length===5&&s.state.jobs.jobs.every(j=>j.calls[0].state==='needs_review')})()`, 'five image drafts completed');
  await waitIdle();
  await wait(`document.querySelectorAll(${JSON.stringify(cards + ' img')}).length===5`, 'five image thumbnails available');
  const fiveState = await remoteState();
  if (withReferences) {
    const actual = fiveState.state.jobs.jobs.map(job=>job.plan.operation.context.references);
    assert(actual.every(refs=>refs.length===4));
    assert(actual.every(refs=>JSON.stringify(refs)===JSON.stringify(actual[0])));
    assert.deepEqual(actual[0].slice(1).map(ref=>ref.roles), [['object_reference'],['object_reference'],['image_style_reference']]);
    assert(actual[0].slice(1).every(ref=>ref.version_id===ref.reference_id.slice('reference:'.length)));
    assert.equal(fiveState.state.assets.versions.filter(asset=>asset.provenance.kind==='imported').length,4);
    checks.push('all five candidates reuse the same capture and three exact hashed image files with frozen object/style roles; only four imports for the entire set');
  }
  assert.equal((await control()).simulated_dispatches, 5);
  assert.equal(new Set(fiveState.state.jobs.jobs.map(job=>job.operation_key)).size, 5);
  assert.equal(new Set(fiveState.state.jobs.jobs.map(job=>job.plan.operation.context.instruction)).size, 5);
  const outputIdentities = fiveState.state.jobs.jobs.map(job=>job.calls[0].receipt.outputs[0].asset);
  assert.equal(new Set(outputIdentities.map(identity=>JSON.stringify(identity))).size, 5);
  const imageHashes = await evaluate(`(async()=>Promise.all(${JSON.stringify(outputIdentities)}.map(async identity=>{
    const blob=await window.__presentationHarness.designClient.asset(identity);
    const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');})))()`);
  assert.equal(new Set(imageHashes).size, 5);
  assert.deepEqual(imageHashes, outputIdentities.map(identity=>identity.version_id));
  assert(fiveState.state.jobs.jobs.every(job=>job.plan.operation.image.quality==='low'&&job.plan.operation.image.output_count===1));
  assert.equal(new Set(fiveState.state.jobs.jobs.map(job=>job.plan.operation.context.references[0].asset_id)).size, 1);
  assert.deepEqual(await evaluate(deck), initialDeck);
  await screenshot('five-drafts');
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await evaluate(`document.querySelector(${JSON.stringify(gallery)}).scrollIntoView({block:'start'})`);
  await screenshot('tablet');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  checks.push('explicit continuation creates exactly four additional low drafts with five distinct prompts, identities and verified PNG hashes; one capture upload is reused and HTML remains editable on desktop and tablet');

  await cardClick(1, 'Ajustar idea');
  await setText('textarea[aria-label="Comentarios para ajustar la idea"]', 'Conservar el objeto y dar más aire alrededor de las alas.');
  await click('Guardar ajuste');
  await wait("document.querySelectorAll('.dep-card')[1]?.getAttribute('data-idea-version')==='2'");
  await waitIdle();
  assert.equal((await control()).simulated_dispatches, 5);
  assert.equal((await control()).planner_requests.length, 1);
  for (const [card, aspect] of [[0,0],[0,1],[1,2],[1,3]]) {
    await wait(`document.querySelectorAll('.dep-card')[${card}]?.querySelectorAll('input[type=checkbox]')[${aspect}]?.matches(':enabled')===true`);
    await evaluate(`document.querySelectorAll('.dep-card')[${card}].querySelectorAll('input[type=checkbox]')[${aspect}].click()`);
    await wait(`document.querySelectorAll('.dep-card')[${card}].querySelectorAll('input[type=checkbox]')[${aspect}].checked`);
  }
  await click('Combinar aspectos elegidos');
  await wait("document.querySelectorAll('.dep-card').length===6");
  assert.equal((await control()).simulated_dispatches, 5);
  assert.equal((await remoteState()).state.jobs.jobs.length, 5);
  assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(cards + ' img')}).length`), 5);
  checks.push('adjusting and combining ideas retains all five generated images and their provenance without another image or text call');

  await cardClick(0, 'Revisar borrador');
  await click('Aprobar dirección'); await waitIdle();
  assert.equal((await control()).simulated_dispatches, 5);
  assert.deepEqual(await evaluate(deck), initialDeck);
  await click('Generar versión en media');
  await wait("document.querySelector('.sdp-status')?.textContent==='Versión en media lista para revisar'");
  await waitIdle();
  const mediumState = await remoteState(), mediumJob = mediumState.state.jobs.jobs.at(-1);
  assert.equal(mediumState.state.jobs.jobs.length, 6);
  assert.equal(mediumJob.plan.operation.image.quality, 'medium');
  assert.deepEqual(mediumJob.plan.operation.context.base_asset, fiveState.state.jobs.jobs[0].calls[0].receipt.outputs[0].asset);
  assert.equal((await control()).simulated_dispatches, 6);
  await click('Aprobar versión final'); await waitIdle();
  assert.equal((await control()).simulated_dispatches, 6);
  assert.deepEqual(await evaluate(deck), initialDeck);
  await click('Montar pieza aprobada');
  await wait(`!document.querySelector('.sdp-dialog')&&${deck}[0].mounted_assets.length===1`);
  const mountedDeck = await evaluate(deck);
  assert.match(mountedDeck[0].html, /Un mundo de ideas/);
  assert.match(mountedDeck[0].html, /data-eid="h1"/);
  assert.equal(mountedDeck[0].revision, initialDeck[0].revision+1);
  assert.deepEqual(mountedDeck.slice(1), initialDeck.slice(1));
  assert.equal((await control()).simulated_dispatches, 6);
  checks.push('a chosen proposal passes explicit direction approval, one new medium render, final review and HTML mounting; approvals and mounting never generate another image');

  // A fresh isolated browser draft creates a separate session; the SQL image ledger
  // remains intact so the next scenario checks partial results under the same quota.
  await send('Page.navigate', { url: 'about:blank' }, sessionId);
  await send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'indexeddb,local_storage' }, sessionId);
  await launch();
  await plan('Cinco ideas nuevas de avión sobre fondo limpio para comparar en esta portada.');
  const partialDeck = await evaluate(deck);
  await control('fail_dispatch=11');
  await click('Seleccionar pendientes'); await click('Generar borradores seleccionados (5)');
  await wait(`(async()=>{const s=await window.__presentationHarness.designClient.read(window.__presentationHarness.businessId);return s.state.jobs.jobs.length===11&&s.state.jobs.jobs.at(-1).calls[0].state==='uncertain'})()`, 'fifth proposal has an uncertain provider outcome');
  await waitIdle();
  await wait(`document.querySelectorAll(${JSON.stringify(cards + ' img')}).length===4`);
  await screenshot('partial-result');
  const partialState = await remoteState();
  assert.equal(partialState.state.jobs.jobs.slice(-5).filter(job=>job.calls[0].state==='needs_review').length, 4);
  assert.equal(partialState.state.jobs.jobs.at(-1).calls[0].settlement, null);
  assert.equal((await control()).simulated_dispatches, 11);
  await close(); await launch();
  await click('Recuperar propuestas'); await waitIdle();
  await wait(`document.querySelectorAll(${JSON.stringify(cards + ' img')}).length===4`);
  assert.equal((await control()).simulated_dispatches, 11);
  assert.equal((await remoteState()).state.jobs.jobs.length, 11);
  assert.deepEqual(await evaluate(deck), partialDeck);
  checks.push('an uncertain fifth render preserves four completed images and its held reservation; reload and recovery never repeat any of the five calls');

  const metrics = await control();
  assert.equal(metrics.real_provider_calls, 0); assert.deepEqual(metrics.worker_errors, []);
  assert.deepEqual(metrics.adapter_requests, []);
  const cloudCalls = await evaluate('window.__presentationHarness.cloudCalls');
  assert(cloudCalls.every(call=>call.kind==='read'&&call.target==='presentations'));
  const exceptions = events.filter(event=>['Runtime.exceptionThrown','Test.interceptionError'].includes(event.method));
  assert.deepEqual(exceptions, []); assert.deepEqual(blocked, []);
  checks.push('all image and planning transports are local fixtures; zero remote HTTP attempts, cloud writes, actual provider calls or browser exceptions');
  const result = { success: true, checks, actual_provider_calls: 0, simulated_dispatches: metrics.simulated_dispatches,
    mocked_planner_calls: metrics.planner_requests.length, sql_audits: metrics.audits.length, artifacts };
  await writeFile(path.join(artifacts, `${artifactPrefix}-smoke-result.json`), JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  if (main) { await main.screenshot('failure').catch(()=>{}); console.error(await main.evaluate('document.body.innerText').catch(()=>'Could not read failed page')); }
  console.error(error); console.error(JSON.stringify({ blocked, exceptions: events.filter(event=>event.method==='Runtime.exceptionThrown') },null,2)); process.exitCode=1;
} finally { if(send)await send('Browser.close').catch(()=>{});socket?.close();browser?.kill();server?.kill(); }
