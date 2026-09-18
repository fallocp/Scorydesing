/** Dependency-free Chrome DevTools smoke test against the isolated localhost laboratory. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3011';
const browserPath = process.env.DESAING_TEST_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
let previewProcess;
if (!await fetch(`${base}/experiments/desaing/`).then(response => response.ok).catch(() => false)) {
  previewProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.desaing.config.ts'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let startupError = '';
  previewProcess.stderr.on('data', bytes => { startupError += bytes.toString(); });
  const deadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < deadline) {
    if (await fetch(`${base}/experiments/desaing/`).then(response => response.ok).catch(() => false)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  if (!ready) { previewProcess.kill(); throw new Error(`Local preview did not start: ${startupError}`); }
}
const profile = await mkdtemp(path.join(tmpdir(), 'desaing-browser-'));
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const debuggerUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Chrome did not expose a debugging endpoint.')), 20000);
  browser.once('error', error => { clearTimeout(timer); reject(error); });
  browser.stderr.on('data', bytes => { const match = bytes.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) { clearTimeout(timer); resolve(match[1]); } });
});
const socket = new WebSocket(debuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 0;
const pending = new Map(), events = [];
socket.addEventListener('message', event => {
  const data = JSON.parse(String(event.data));
  if (data.id && pending.has(data.id)) {
    const { resolve, reject, timer } = pending.get(data.id); pending.delete(data.id); clearTimeout(timer);
    if (data.error) reject(new Error(JSON.stringify(data.error))); else resolve(data.result);
  } else events.push(data);
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
});
async function page() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId); await send('Network.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__readLabJournal=async()=>{
    const {openBrowserDesignStore}=await import('/src/lib/desaing/localDesignStore.ts');
    const {LAB_BUSINESS,LAB_POLICY}=await import('/src/lib/desaing/labRuntime.ts');
    return openBrowserDesignStore(LAB_BUSINESS,LAB_POLICY).read();}` }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async expression => {
    if (expression.includes('await window.__readLabJournal()')) expression = `(async()=>(${expression}))()`;
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  };
  const wait = async (expression, label = expression) => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error(`Timed out: ${label}`);
  };
  return { targetId, sessionId, evaluate, wait,
    async navigate() { await send('Page.navigate', { url: `${base}/experiments/desaing/` }, sessionId);
      await wait("!!document.querySelector('#dl-prompt')", 'laboratory mounted'); },
    async click(text) { const encoded = JSON.stringify(text);
      await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${encoded}&&!b.disabled)`, `button ${text}`);
      await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${encoded}&&!b.disabled).click()`); },
    async idle() { await wait("!document.querySelector('#dl-prompt').disabled", 'action completed');
      const error = await evaluate("document.querySelector('[role=alert]')?.textContent ?? null"); if (error) throw new Error(error); },
  };
}
const journal = '(await window.__readLabJournal())';
const checks = [];
let main;
try {
  main = await page(); await main.navigate(); checks.push('isolated entry mounted');
  await main.click('Explorar diseño'); await main.idle();
  await main.click('Simular cinco ideas'); await main.wait("document.querySelectorAll('.dl-candidate').length === 5"); await main.idle();
  assert.equal(await main.evaluate(`${journal}.jobs.jobs[0].calls.length`), 5);
  checks.push('five candidate results and shared formats');
  await main.click('Aprobar dirección'); await main.idle();
  assert.equal(await main.evaluate(`${journal}.jobs.jobs.length`), 1);
  await main.click('Simular versión en media'); await main.wait("document.querySelectorAll('.dl-candidate').length === 6"); await main.idle();
  assert.equal(await main.evaluate(`${journal}.jobs.jobs[1].plan.calls[0].route`), 'images_edits');
  assert.equal(await main.evaluate(`${journal}.assets.reviews.length`), 0);
  await main.click('Aprobar resultado'); await main.idle();
  await main.click('Montar en HTML'); await main.idle();
  assert.equal(await main.evaluate(`${journal}.lab.documents.at(-1).placements.length`), 1);
  const callsBefore = await main.evaluate(`${journal}.jobs.jobs.flatMap(j=>j.calls).filter(c=>c.attempt).length`);
  await main.evaluate("(()=>{const e=document.querySelector('#dl-title');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Título editable de prueba');e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();})()");
  await main.wait(`${journal}.lab.documents.at(-1).title==='Título editable de prueba'`); await main.idle();
  // UI and actual browser storage reopen together; no fixture reconstruction is permitted.
  await send('Page.reload', {}, main.sessionId); await main.wait("document.querySelector('#dl-title')?.value==='Título editable de prueba'");
  await main.idle();
  assert.equal(await main.evaluate("document.querySelectorAll('.dl-candidate').length"), 6);
  assert.equal(await main.evaluate(`${journal}.lab.documents.at(-1).placements.length`), 1);
  checks.push('direction vs medium vs final approval; persisted PNG blobs, editable HTML and reload');
  const exportHtml = await main.evaluate("document.querySelector('iframe').srcdoc");
  assert.match(exportHtml, /Título editable de prueba/); assert.match(exportHtml, /data:image\/png;base64,/);
  assert.doesNotMatch(exportHtml, /<script|https?:\/\//);
  // Capture the download through the UI and compare the actual blob with the visible document.
  await main.evaluate("window.__exported=null;window.__anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download&&this.href.startsWith('blob:')){fetch(this.href).then(r=>r.text()).then(t=>window.__exported=t)}else window.__anchorClick.call(this)}");
  await main.click('Exportar HTML'); await main.wait("typeof window.__exported==='string'");
  assert.equal(await main.evaluate('window.__exported'), exportHtml);
  await main.evaluate('HTMLAnchorElement.prototype.click=window.__anchorClick');
  await writeFile(path.join(artifacts, 'composition.html'), exportHtml);
  assert.equal(await main.evaluate(`${journal}.jobs.jobs.flatMap(j=>j.calls).filter(c=>c.attempt).length`), callsBefore);
  checks.push('export embeds raster assets and matches preview exactly; editing and export create zero attempts');
  await main.evaluate("document.querySelector('iframe').scrollIntoView({block:'center'})");
  await new Promise(resolve => setTimeout(resolve, 500));
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, main.sessionId);
  await writeFile(path.join(artifacts, 'desktop.png'), Buffer.from(screenshot.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false }, main.sessionId);
  await main.evaluate("document.querySelector('iframe').scrollIntoView({block:'center'})");
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await main.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  const tabletShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, main.sessionId);
  await writeFile(path.join(artifacts, 'tablet.png'), Buffer.from(tabletShot.data, 'base64'));
  checks.push('tablet viewport without horizontal overflow');
  // Real IndexedDB transactions: two tabs reserve the same operation, then inspect persisted quota.
  const other = await page(); await other.navigate();
  const queueDuplicate = `(async()=>{const {openBrowserDesignStore}=await import('/src/lib/desaing/localDesignStore.ts');
    const {LAB_BUSINESS,LAB_POLICY}=await import('/src/lib/desaing/labRuntime.ts');
    const {enqueueImageJob}=await import('/supabase/functions/_shared/desaing/jobLedger.ts');
    const store=openBrowserDesignStore(LAB_BUSINESS,LAB_POLICY);
    return store.transact(state=>{const op=structuredClone(state.jobs.jobs[0].plan.operation);op.operation_key='browser-race';
      const env={actor_id:op.context.actor_id,business_id:op.context.business_id,enabled_image_profiles:['baseline'],responses_image_enabled:false,
        authorization:{authorization_id:'browser-race-auth',actor_id:op.context.actor_id,scope:structuredClone(op)}};
      const result=enqueueImageJob(state.jobs,op,env,[0,0,0,0,0],Date.now());return {state:{...state,jobs:result.ledger},result:result.reused}});})()`;
  const raced = await Promise.all([main.evaluate(queueDuplicate), other.evaluate(queueDuplicate)]);
  assert.deepEqual([...raced].sort(), [false, true]);
  assert.equal(await main.evaluate(`${journal}.jobs.jobs.filter(j=>j.operation_key==='browser-race').length`), 1);
  checks.push('two real browser tabs deduplicate one reservation in an IndexedDB transaction');
  await send('Target.closeTarget', { targetId: other.targetId });
  const exceptions = events.filter(e => e.method === 'Runtime.exceptionThrown');
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  const remote = events.filter(e => e.method === 'Network.requestWillBeSent').map(e => e.params.request.url)
    .filter(url => /^https?:/.test(url) && !url.startsWith(base));
  assert.deepEqual(remote, []);
  checks.push('no external HTTP requests or unhandled browser exceptions');
  await writeFile(path.join(artifacts, 'smoke-result.json'), JSON.stringify({ success: true, checks, actual_provider_calls: 0 }, null, 2));
  console.log(JSON.stringify({ success: true, checks, artifacts }, null, 2));
} catch (error) {
  if (main) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, main.sessionId).catch(() => null);
    if (shot) await writeFile(path.join(artifacts, 'failure.png'), Buffer.from(shot.data, 'base64'));
    console.error(await main.evaluate('document.body.innerText').catch(() => 'Could not read failed page'));
  }
  console.error(error); process.exitCode = 1;
} finally {
  await send('Browser.close').catch(() => {}); socket.close(); browser.kill();
  previewProcess?.kill();
}
