/** Browser/IndexedDB pixel extraction check. Isolated profile; network limited to local fixture app. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:3012', entry = `${base}/experiments/presentations/`;
const artifacts = path.resolve('artifacts/desaing-lab');
await mkdir(artifacts, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], blocked = [], errors = [];
let server, browser, socket, evaluate;
try {
  if (!await fetch(entry).then(r => r.ok).catch(() => false)) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.presentations-test.config.ts'], { windowsHide: true, stdio: 'ignore' });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !await fetch(entry).then(r => r.ok).catch(() => false)) await delay(150);
    assert(await fetch(entry).then(r => r.ok), 'Local fixture server starts');
  }
  const profile = await mkdtemp(path.join(tmpdir(), 'extraction-browser-'));
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
      void send(remote ? 'Fetch.failRequest' : 'Fetch.continueRequest', remote ? { requestId, errorReason: 'BlockedByClient' } : { requestId }, message.sessionId).catch(error => errors.push(error.message));
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timeout: ${expression}`);
  };
  const click = async label => {
    const selector = `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;
    await wait(`!!(${selector})`); await evaluate(`${selector}.click()`);
  };
  const setInput = async (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(value))});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(path.join(artifacts, `extraction-${name}.png`), Buffer.from(shot.data, 'base64'));
  };
  await send('Page.navigate', { url: entry }, sessionId);
  await wait("!!window.__presentationHarness && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Añadir imágenes montadas')");
  const decoded = await evaluate(`(async()=>{
    const {extractPresentationPixels,extractPixelBuffer}=await import('/src/lib/presentations/presentationExtraction.ts');
    const {pointInExtractionPolygon}=await import('/supabase/functions/_shared/desaing/pixelExtraction.ts');
    const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;const ctx=canvas.getContext('2d');
    const rgba=new Uint8ClampedArray(64);for(let i=0;i<16;i++)rgba.set([i*8,40,180,i===0?0:i===1?128:255],i*4);
    ctx.putImageData(new ImageData(rgba,4,4),0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
    const decode=async blob=>{const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const cx=c.getContext('2d');cx.drawImage(bitmap,0,0);bitmap.close();return{width:c.width,height:c.height,data:cx.getImageData(0,0,c.width,c.height).data}};
    const source=await decode(blob);
    const recipes=[{crop:{x:1,y:0,width:3,height:4},mask:{kind:'rectangle'}},{crop:{x:0,y:0,width:4,height:4},mask:{kind:'polygon',points:[{x:0,y:0},{x:4,y:0},{x:0,y:4}]}}];
    return await Promise.all(recipes.map(async recipe=>{const expected=extractPixelBuffer(source,recipe);const actual=await decode(await extractPresentationPixels(blob,recipe));return{same:JSON.stringify([...actual.data])===JSON.stringify([...expected.data]),width:actual.width,height:actual.height,transparent:[...actual.data].filter((_,i)=>i%4===3&&actual.data[i]===0).length}}));
  })()`);
  assert.equal(decoded.every(item => item.same), true); assert.equal(decoded[0].width, 3); assert(decoded[1].transparent > 1);
  checks.push('Browser PNG encoding preserves decoded crop RGBA and creates real transparent polygon pixels');

  const deck = 'JSON.parse(localStorage.getItem(window.__presentationHarness.draftKey))';
  const initial = await evaluate(deck);
  await click('Añadir imágenes montadas');
  await wait("!!document.querySelector('.mip-file-input')");
  await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;const ctx=canvas.getContext('2d');ctx.fillStyle='#f4c56a';ctx.fillRect(0,0,64,48);ctx.fillStyle='#176b5f';ctx.fillRect(16,8,32,32);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const files=new DataTransfer();files.items.add(new File([blob],'pieza-original.png',{type:'image/png'}));const input=document.querySelector('.mip-file-input');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait("document.querySelector('.mip-file-choice')?.textContent.includes('pieza-original.png')");
  await click('Extraer pieza manualmente');
  for (const [label, value] of [['Recorte izquierda', 8], ['Recorte arriba', 4], ['Recorte ancho', 48], ['Recorte alto', 40]]) await setInput(`input[aria-label="${label}"]`, value);
  await click('Revisar extracción');
  await wait("!!document.querySelector('[data-testid=manual-extraction-review] img')");
  assert.equal(await evaluate("document.querySelectorAll('.mip-library-item').length"), 0);
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Montar imagen').disabled"), true);
  await setInput('input[aria-label="Recorte ancho"]', 40);
  assert.equal(await evaluate("!!document.querySelector('[data-testid=manual-extraction-review]')"), false);
  await click('Revisar extracción'); await wait("!!document.querySelector('[data-testid=manual-extraction-review] img')");
  await screenshot('rectangle-review');
  checks.push('Rectangle UI requires review; changing geometry invalidates review and no asset is saved early');
  await click('Guardar pieza revisada');
  await wait("document.querySelectorAll('.mip-library-item').length===2 && !document.querySelector('[data-testid=manual-extraction]')");
  const readLibrary = "(async()=>{const m=await import('/src/lib/presentations/presentationAssets.ts');return(await m.listPresentationAssets(window.__presentationHarness.businessId)).map(x=>x.version)})()";
  let versions = await evaluate(readLibrary);
  assert.equal(versions[1].provenance.kind, 'pixel_extraction');
  assert.deepEqual(versions[1].provenance.source, versions[0].identity);
  assert.deepEqual(versions[1].provenance.recipe.crop, { x: 8, y: 4, width: 40, height: 40 });
  assert.deepEqual(await evaluate(deck), initial);
  checks.push('Saving a reviewed crop stores immutable source and derived provenance without changing slide HTML');

  await click('Extraer pieza manualmente'); await click('Contorno con transparencia');
  for (const [index, point] of [[0, { x: 0, y: 0 }], [1, { x: 40, y: 0 }], [2, { x: 0, y: 40 }]]) {
    await click('Añadir punto por coordenadas');
    await setInput(`input[aria-label="Punto ${index + 1} x"]`, point.x);
    await setInput(`input[aria-label="Punto ${index + 1} y"]`, point.y);
  }
  await click('Revisar extracción'); await wait("!!document.querySelector('[data-testid=manual-extraction-review] img')");
  const alpha = await evaluate(`(async()=>{const image=document.querySelector('[data-testid=manual-extraction-review] img');await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return[ctx.getImageData(0,0,1,1).data[3],ctx.getImageData(39,39,1,1).data[3]]})()`);
  assert.deepEqual(alpha, [255, 0]);
  assert.equal(await evaluate("document.querySelector('[data-testid=manual-extraction-review] a').download"), 'pieza-extraida.png');
  await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 1, mobile: false }, sessionId);
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await evaluate("document.querySelector('[data-testid=manual-extraction-review]').scrollIntoView({block:'center'})");
  await screenshot('polygon-tablet-review');
  await click('Guardar pieza revisada');
  await wait("document.querySelectorAll('.mip-library-item').length===3 && !document.querySelector('[data-testid=manual-extraction]')");
  versions = await evaluate(readLibrary);
  assert.deepEqual(versions[2].provenance.source, versions[1].identity);
  assert.equal(versions[2].provenance.recipe.mask.kind, 'polygon');
  checks.push('Manual polygon UI creates transparent PNG, supports download/tablet and preserves exact derived source lineage');

  await click('Montar imagen'); await wait(`${deck}[0].mounted_assets?.length===1`);
  const mounted = await evaluate(deck);
  assert.match(mounted[0].html, /Un mundo de ideas/); assert.match(mounted[0].html, /data:image\/png;base64,/);
  assert.deepEqual(mounted[0].mounted_assets[0].asset, versions[2].identity); assert.equal(mounted[0].revision, 2);
  assert.equal(mounted[1].html, initial[1].html);
  await send('Page.reload', {}, sessionId); await wait(`!!window.__presentationHarness && ${deck}[0].mounted_assets?.length===1`);
  assert.deepEqual(await evaluate(readLibrary), versions);
  assert.deepEqual(await evaluate(deck), mounted);
  checks.push('Extracted piece mounts with editable original text and exact source lineage survives actual browser reload');
  const isolated = await evaluate(`(async()=>{const m=await import('/src/lib/presentations/presentationAssets.ts');const h=window.__presentationHarness,own=await m.listPresentationAssets(h.businessId);let rejected=false;try{await m.readPresentationAsset(h.otherBusinessId,own[2].version)}catch{rejected=true}return{rejected,other:(await m.listPresentationAssets(h.otherBusinessId)).length,cloud:h.cloudCalls.filter(call=>call.kind!=='read'||call.target!=='presentations').length}})()`);
  assert.deepEqual(isolated, { rejected: true, other: 0, cloud: 0 }); assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
  checks.push('Cross-business source reads rejected; no cloud/provider calls or external requests');
  await writeFile(path.join(artifacts, 'extraction-smoke-result.json'), JSON.stringify({ ok: true, checks, provider_calls: 0, external_requests: blocked, exceptions: errors }, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, provider_calls: 0 }, null, 2));
} catch (error) {
  await writeFile(path.join(artifacts, 'extraction-smoke-result.json'), JSON.stringify({ ok: false, checks, error: error.stack, blocked, errors,
    ui: evaluate ? await evaluate('document.body.innerText').catch(() => null) : null }, null, 2));
  throw error;
} finally { if (socket) socket.close(); if (browser) browser.kill(); if (server) server.kill(); }
