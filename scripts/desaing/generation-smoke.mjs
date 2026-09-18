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
  const profile = await mkdtemp(path.join(tmpdir(), 'generation-browser-'));
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
    await writeFile(path.join(artifacts, `generation-${name}.png`), Buffer.from(shot.data, 'base64'));
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

  // Invalid discovery responses must not let UI silently choose its own provider defaults.
  for (const mode of ['missing', 'malformed']) {
    await control(`capabilities=${mode}`); await open(); await attachAndDescribe();
    await noGenerationButton(); assert.equal((await control()).adapter_requests.length, 0); await close();
  }
  checks.push('missing or malformed server capabilities block live UI generation without baseline fallback');
  await control('capabilities=normal');

  for (const [index, executor] of ['image_api', 'responses_image'].entries()) {
    await control(`executor=${executor}`);
    if (index) await click('Siguiente');
    await open(); await attachAndDescribe();
    assert.equal(await evaluate("document.querySelectorAll('.sdp-dialog select').length"), 0);
    const before = (await control()).adapter_requests.length;
    await click('Generar borrador');
    await wait("document.querySelector('.sdp-status')?.textContent==='Borrador listo para elegir dirección'", `${executor} draft completes through live worker`);
    let metrics = await control(); assert.equal(metrics.adapter_requests.length, before + 1);
    const lowState = await read(), lowJob = lowState.state.jobs.jobs.at(-1);
    assert.equal(lowJob.plan.operation.image.profile, 'flare_candidate');
    assert.equal(lowJob.plan.operation.image.executor, executor);
    assert.equal(lowJob.plan.operation.image.quality, 'low');
    const ref = lowState.state.assets.versions.find(v => v.identity.asset_id === lowJob.plan.operation.context.references[0].asset_id);
    assert.deepEqual({ width: ref.storage.width, height: ref.storage.height }, { width: 1024, height: 576 });
    assert.equal(lowJob.calls[0].state, 'needs_review'); assert.equal(lowJob.calls[0].settlement, null);
    assert.equal(lowJob.calls[0].reserved_micro_usd, 1000000);
    assert.equal(metrics.adapter_requests.at(-1).model, 'gpt-image-2.5-flare');
    assert.equal(metrics.adapter_requests.at(-1).quality, 'low');
    assert.equal(metrics.adapter_requests.at(-1).input_images, 1);
    assert.deepEqual(await evaluate(deck), initial);
    checks.push(`${executor}: explicit draft click uses trusted Flare settings and capture resized from 1200x675 to 1024x576 through the real adapter`);

    await click('Aprobar dirección');
    await wait("document.querySelector('.sdp-status')?.textContent==='Dirección aprobada'");
    assert.equal((await control()).adapter_requests.length, before + 1);
    await screenshot(`${executor}-direction`);
    await close();
    await send('Page.reload', { ignoreCache: true }, sessionId);
    await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Crear pieza para el slide')");
    if (index) await click('Siguiente');
    await open(); await wait("document.querySelector('.sdp-status')?.textContent==='Dirección aprobada'");
    await read();
    await evaluate("window.__presentationHarness.designClient.command(window.__presentationHarness.businessId,{kind:'recover'})");
    assert.equal((await control()).adapter_requests.length, before + 1);
    checks.push(`${executor}: direction approval, actual reload, read and recovery do not dispatch a provider request`);

    // A changed server executor cannot silently reroute promotion of an approved direction.
    await close(); await control(`executor=${executor === 'image_api' ? 'responses_image' : 'image_api'}`); await open();
    const promotion = await evaluate("Array.from(document.querySelectorAll('.sdp-dialog button')).find(b=>b.textContent.trim()==='Generar versión en media')?.disabled");
    if (!promotion) {
      await click('Generar versión en media');
      await wait("!!document.querySelector('.sdp-dialog [role=alert]')", 'changed server settings surface an explicit error');
    }
    assert.equal((await control()).adapter_requests.length, before + 1);
    await close(); await control(`executor=${executor}`); await open();
    await click('Generar versión en media');
    await wait("document.querySelector('.sdp-status')?.textContent==='Versión en media lista para revisar'", `${executor} medium completes`);
    metrics = await control(); assert.equal(metrics.adapter_requests.length, before + 2);
    const mediumState = await read(), mediumJob = mediumState.state.jobs.jobs.at(-1);
    assert.equal(mediumJob.plan.operation.image.executor, executor);
    assert.equal(mediumJob.plan.operation.image.quality, 'medium');
    assert.equal(mediumJob.plan.lineage, 'child_version');
    assert.deepEqual(mediumJob.plan.operation.context.base_asset, lowJob.calls[0].receipt.outputs[0].asset);
    assert.equal(mediumJob.calls[0].state, 'needs_review'); assert.equal(mediumJob.calls[0].settlement, null);
    assert.equal(metrics.adapter_requests.at(-1).input_images, 2);
    assert.equal(metrics.adapter_requests.at(-1).quality, 'medium');
    await click('Ver borrador aprobado'); await click('Ver versión en media');
    await click('Aprobar versión final');
    await wait("document.querySelector('.sdp-status')?.textContent==='Versión final aprobada'");
    assert.equal((await control()).adapter_requests.length, before + 2);
    assert.deepEqual(await evaluate(deck), initial);
    await screenshot(`${executor}-medium`); await close();
    checks.push(`${executor}: executor changes cannot reroute medium; promotion uses exact low parent plus capture, and comparison/final review do not generate or mount`);
  }
  const final = await control(), finalState = await read();
  assert.equal(final.adapter_requests.length, 4);
  assert.equal(finalState.state.jobs.jobs.length, 4);
  assert.equal(finalState.generation.remaining_outputs, 0);
  assert.equal(finalState.state.jobs.jobs.flatMap(j=>j.calls).reduce((sum,c)=>sum+c.reserved_micro_usd,0), 4000000);
  assert.equal(final.real_provider_calls, 0); assert.deepEqual(final.worker_errors, []);
  const exceptions = events.filter(event => ['Runtime.exceptionThrown', 'Test.interceptionError'].includes(event.method));
  assert.deepEqual(exceptions, []); assert.deepEqual(blocked, []);
  checks.push('four outputs retain four reservations; provider transport is injected locally, with no real provider calls or browser external requests');
  const result = { success: true, checks, mocked_adapter_calls: final.adapter_requests.length, actual_provider_calls: 0,
    sql_audits: final.audits.length, server_capabilities: finalState.generation, requests: final.adapter_requests, artifacts };
  await writeFile(path.join(artifacts, 'generation-smoke-result.json'), JSON.stringify(result, null, 2));
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
