/** Capture a local, editable 800 × 450 pilot slide. HTTP requests are blocked. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  assert(['--html', '--output'].includes(args[i]) && args[i + 1], 'Usage: node scripts/desaing/pilot-capture.mjs [--html local.html] [--output local.png]');
  options[args[i]] = args[i + 1];
}
const input = path.resolve(options['--html'] ?? 'experiments/pilot/reference.html');
const output = path.resolve(options['--output'] ?? 'artifacts/desaing-lab/pilot-reference.png');
assert.equal(path.extname(input).toLowerCase(), '.html');
assert.equal(path.extname(output).toLowerCase(), '.png');
await access(input);
await mkdir(path.dirname(output), { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), 'desaing-pilot-browser-'));
const browserPath = process.env.DESAING_TEST_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let browser, socket;
const pending = new Map();
const blocked = [], errors = [];

try {
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
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
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
    } else if (message.method === 'Fetch.requestPaused') {
      blocked.push(message.params.request.url);
      void send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'BlockedByClient' }, message.sessionId)
        .catch(error => errors.push(error.message));
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(message.params.exceptionDetails.text);
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 450, deviceScaleFactor: 1, mobile: false }, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const navigation = await send('Page.navigate', { url: pathToFileURL(input).href }, sessionId);
  assert(!navigation.errorText, navigation.errorText);
  const deadline = Date.now() + 15000;
  while (!await evaluate("document.readyState === 'complete' && !!document.querySelector('.slide')")) {
    assert(Date.now() < deadline, 'Pilot document did not load.');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await evaluate('(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images,img=>img.decode()));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));})()');
  const layout = await evaluate(`(()=>{
    const slide=document.querySelector('.slide').getBoundingClientRect();
    const region=document.querySelector('[data-pilot-asset]').getBoundingClientRect();
    const title=document.querySelector('h1').getBoundingClientRect();
    return {width:slide.width,height:slide.height,region:{x:region.x,y:region.y,width:region.width,height:region.height},
      titleOverlapsAsset:title.right>region.left,editableText:document.querySelectorAll('[contenteditable=true]').length,
      images:document.images.length,overflow:document.documentElement.scrollWidth>800||document.documentElement.scrollHeight>450};
  })()`);
  assert.equal(layout.width, 800);
  assert.equal(layout.height, 450);
  assert.deepEqual(layout.region, { x: 430, y: 100, width: 330, height: 300 });
  assert.equal(layout.titleOverlapsAsset, false);
  assert.equal(layout.overflow, false);
  assert(layout.editableText >= 5, 'The reference must preserve editable HTML text.');
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, [], 'The local pilot must not require remote resources.');
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width: 800, height: 450, scale: 1 },
  }, sessionId);
  const bytes = Buffer.from(shot.data, 'base64');
  assert.equal(bytes.readUInt32BE(16), 800);
  assert.equal(bytes.readUInt32BE(20), 450);
  await writeFile(output, bytes);
  process.stdout.write(`${JSON.stringify({ input, output, bytes: bytes.length, ...layout, remoteRequests: blocked.length }, null, 2)}\n`);
  await send('Browser.close').catch(() => {});
} finally {
  for (const item of pending.values()) clearTimeout(item.timer);
  socket?.close();
  if (browser && browser.exitCode === null) browser.kill();
}
