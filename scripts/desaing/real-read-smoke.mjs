/** Real JWT/application reads only. Fresh Chrome, memory-only auth storage, no provider or publication route allowed. */
import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';

const base = 'http://127.0.0.1:3000', business = 'a0000000-0000-0000-0000-000000000001';
const actor = '0274bd51-1858-4893-8561-a9c99000feb7', artifacts = path.resolve('artifacts/desaing-lab');
const env = await readFile('.env', 'utf8');
const runtimeEnv = loadEnv('development', process.cwd(), 'VITE_');
const configured = key => !!runtimeEnv[key];
const interactive = process.argv.includes('--interactive');
const originEntry = env.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
const cloud = new URL(originEntry).origin;
assert.equal(cloud, 'https://gdfhytvjnzdovjfovqfv.supabase.co', 'Unexpected Supabase origin');
const result = { schema_version: 1, app: base, business_id: business, expected_actor_id: actor,
  auto_login_configured: configured('VITE_AUTH_EMAIL') && configured('VITE_AUTH_PASSWORD'),
  checks: [], allowed_remote: [], blocked_remote: [], failed_responses: [], exceptions: 0,
  provider_calls: 0, application_mutations: 0, auth_storage: 'memory_only', session_metadata_write_blocked: true };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, profile, evaluate, screenshot, completed = false;
await mkdir(artifacts, { recursive: true });
function allowed(request) {
  const url = new URL(request.url), method = request.method;
  if (url.origin === base) return ['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (url.origin !== cloud) return false;
  if (method === 'OPTIONS') return true;
  if (url.pathname === '/auth/v1/token' && method === 'POST') return ['password', 'refresh_token'].includes(url.searchParams.get('grant_type'));
  if (url.pathname === '/auth/v1/user' && method === 'GET') return true;
  if (method === 'GET' && (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/storage/v1/object/'))) return !url.pathname.includes('/rpc/');
  if (method !== 'POST') return false;
  if (url.pathname === '/rest/v1/rpc/desaing_prompt_governed') return true;
  if (url.pathname === '/functions/v1/desaing-server') {
    try { const body = JSON.parse(request.postData ?? 'null'); return body?.business_id === business && body.command?.kind === 'read'
      && Object.keys(body.command).length === 1 && Object.keys(body).sort().join(',') === 'business_id,command'; } catch { return false; }
  }
  return /^\/functions\/v1\/desaing-server\/(assets\/url|prompt-admin\/(capabilities|read)|materials\/(read|history|capabilities|source)|onboarding\/read|exploration\/history|html\/history)$/.test(url.pathname);
}
try {
  assert((await fetch(base)).ok, 'Local app unavailable');
  profile = await mkdtemp(path.join(tmpdir(), 'scory-real-validation-'));
  browser = spawn(process.env.DESAING_TEST_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [...(interactive ? [] : ['--headless=new']), '--incognito', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--disable-component-update', '--disable-sync', '--disable-extensions', '--disable-application-cache', '--disk-cache-size=0',
      '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: !interactive, stdio: ['ignore', 'ignore', 'pipe'] });
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Chrome unavailable')), 20000);
    browser.once('error', () => { clearTimeout(timer); reject(Error('Chrome unavailable')); });
    browser.stderr.on('data', bytes => { const match = bytes.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('CDP unavailable')), { once: true }); });
  let nextId = 0; const waiting = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { waiting.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 45000);
    waiting.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id && waiting.has(message.id)) {
      const item = waiting.get(message.id); waiting.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(Error('CDP operation failed')); else item.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params, permitted = allowed(request), url = new URL(request.url);
      if (url.origin !== base) {
        const entry = { method: request.method, path: url.pathname };
        (permitted ? result.allowed_remote : result.blocked_remote).push(entry);
      }
      // Never retain headers, request bodies, query strings or authentication responses.
      void send(permitted ? 'Fetch.continueRequest' : 'Fetch.failRequest', permitted ? { requestId } : { requestId, errorReason: 'BlockedByClient' }, message.sessionId).catch(() => {});
    } else if (message.method === 'Runtime.exceptionThrown') result.exceptions++;
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const url = new URL(message.params.response.url); result.failed_responses.push({ origin: url.origin === cloud ? 'supabase' : url.origin === base ? 'local' : 'external', path: url.pathname, status: message.params.response.status });
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId); await send('Network.enable', {}, sessionId);
  await send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId);
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] }, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const memory = new Map(); const local = window.localStorage;
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    Storage.prototype.getItem = function(key) { return this === local ? memory.get(String(key)) ?? null : get.call(this,key); };
    Storage.prototype.setItem = function(key,value) { if(this===local)memory.set(String(key),String(value));else set.call(this,key,value); };
    Storage.prototype.removeItem = function(key) { if(this===local)memory.delete(String(key));else remove.call(this,key); };
    Storage.prototype.clear = function() { if(this===local)memory.clear(); };
    const NativeSocket=window.WebSocket; window.WebSocket = class extends NativeSocket { constructor(url, protocols) { if(new URL(url,location.href).hostname!=='127.0.0.1')throw Error('read_only_websocket_guard');super(url,protocols); } };
  })();` }, sessionId);
  evaluate = async expression => {
    const value = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (value.exceptionDetails) throw Error('Browser evaluation failed; no sensitive exception was retained'); return value.result.value;
  };
  const wait = async (expression, label, timeout = 60000) => { const deadline = Date.now() + timeout;
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(200); } throw Error(`Timed out: ${label}`); };
  screenshot = async name => { const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
    await writeFile(path.join(artifacts, `real-read-${name}.png`), Buffer.from(image.data, 'base64')); };
  await send('Page.navigate', { url: `${base}/admin/business` }, sessionId);
  if (interactive) await send('Page.bringToFront', {}, sessionId);
  const sessionPresent = `(async()=>{try{const {supabase}=await import('/src/integrations/supabase/client.ts');return !!(await supabase.auth.getSession()).data.session}catch{return false}})()`;
  await wait(`(async()=>await ${sessionPresent} || !!document.querySelector('input[type=password]'))()`, 'real app authentication screen');
  if (!await evaluate(sessionPresent)) {
    if (!interactive) throw Error('Authentication requires user login; autologin is not configured');
    console.log(JSON.stringify({ checkpoint: 'interactive_login_required', credentials_stay_in_browser: true }));
    await wait(sessionPresent, 'user login in temporary browser', 15 * 60 * 1000);
  }
  const auth = await evaluate(`(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {data,error}=await supabase.auth.getUser();return {verified:!error&&!!data.user,actor_id:data.user?.id??null}})()`);
  assert.equal(auth.verified, true); assert.equal(auth.actor_id, actor); result.auth = auth;
  console.log(JSON.stringify({ checkpoint: 'real_auth_verified', actor_id: auth.actor_id, auto_login_configured: result.auto_login_configured }));
  result.checks.push('AuthGate signed in through real Supabase Auth; getUser verified the expected actor; auth stays in browser memory');

  const scope = await evaluate(`(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {useDesignStore}=await import('/src/store/designStore.ts');const {data,error}=await supabase.from('business_tenants').select('*').eq('id',${JSON.stringify(business)}).single();if(error||!data)return {ok:false};useDesignStore.getState().setActiveBusiness(data);return {ok:true,business_id:data.id,active_business_id:useDesignStore.getState().activeBusiness?.id}})()`);
  assert.equal(scope.ok, true); assert.equal(scope.business_id, business); result.scope = scope;
  result.checks.push('Read the permitted business with real RLS and selected it only in local Zustand; startup set_active_business RPC remains blocked');
  await evaluate(`(async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const {createDesignServerClient}=await import('/src/lib/desaing/serverClient.ts');window.__realReadClient=createDesignServerClient({endpoint:${JSON.stringify(cloud + '/functions/v1/desaing-server')},publicKey:supabase.supabaseKey,getSession:async()=>{const {data}=await supabase.auth.getSession();return data.session?{actorId:data.session.user.id,accessToken:data.session.access_token}:null}});return true})()`);
  const engine = await evaluate(`(async()=>{const value=await window.__realReadClient.read(${JSON.stringify(business)});window.__realReadBefore=value;const s=value.state;const{getQuotaUsage}=await import('/supabase/functions/_shared/desaing/jobLedger.ts');return {revision:value.revision,enabled:value.enabled,generation:value.generation??null,jobs:s.jobs.jobs.length,asset_versions:s.assets.versions.length,policy:s.jobs.policy,usage:getQuotaUsage(s.jobs)}})()`);
  assert.equal(engine.revision, 11); assert.equal(engine.jobs, 3); result.engine = engine;
  result.checks.push('JWT design engine read succeeded against the deployed server; revision 11 and three jobs are unchanged');
  console.log(JSON.stringify({ checkpoint: 'real_engine_verified', revision: engine.revision, jobs: engine.jobs, generation: engine.generation }));
  const capabilities = await evaluate(`window.__realReadClient.promptAdmin(${JSON.stringify(business)}).capabilities()`);
  assert.equal(capabilities.governed, true); assert.equal(capabilities.can_manage, true); result.prompt_capabilities = capabilities;
  result.prompt = await evaluate(`(async()=>{const r=await window.__realReadClient.promptAdmin(${JSON.stringify(business)}).read();return {business_id:r.business_id,actor_id:r.actor_id,family:r.prompt_type,families:r.prompt_types,base_id:r.base.id,base_version:r.base.version,base_hash:r.base.hash,draft:r.draft?{id:r.draft.id,revision:r.draft.revision,status:r.draft.status}:null,tests:r.tests.length,reviews:r.reviews.length,receipts:r.receipts.length,evidence:r.evidence.map(e=>({asset:e.asset,master_origin:e.master_origin}))}})()`);
  result.checks.push('The real administrative grant permits capabilities/read; evidence is approved server imagery with master origin explicitly unknown');
  await wait("!!document.querySelector('.pad-panel')", 'real administrative panel'); await delay(500); await screenshot('admin-desktop');

  const collection = '00000000-0000-4000-8000-000000000012';
  result.materials = await evaluate(`(async()=>{const a=window.__realReadClient.materials(${JSON.stringify(business)}),r=await a.read(${JSON.stringify(collection)}),h=await a.history(${JSON.stringify(collection)});return {business_id:r.business_id,actor_id:r.actor_id,revision:r.revision,materials:r.materials.length,selected:r.selected.length,approved:!!r.review?.approved,history:h.length,capabilities:await a.capabilities()}})()`);
  result.onboarding = await evaluate(`(async()=>{const r=await window.__realReadClient.onboarding(${JSON.stringify(business)}).read();return {draft:r.draft?{id:r.draft.id,revision:r.draft.revision,status:r.draft.status}:null,can_write:r.can_write,profile_id:r.base.profile_id,profile_version:r.base.profile_version,fingerprint:r.base.fingerprint}})()`);
  result.checks.push('Durable materials collection/history/capabilities and brand onboarding base were read using the same real JWT, without saving or analyzing');
  await evaluate("history.pushState({},'','/materials');window.dispatchEvent(new PopStateEvent('popstate'));true");
  await wait("document.body.innerText.includes('Materiales')", 'materials screen'); await delay(900); await screenshot('materials-desktop');
  await evaluate("history.pushState({},'','/onboarding');window.dispatchEvent(new PopStateEvent('popstate'));true");
  await wait("!!document.querySelector('.bsp-panel')", 'onboarding screen'); await delay(900); await screenshot('onboarding-desktop');

  result.image = await evaluate(`(async()=>{const c=window.__realReadClient,s=window.__realReadBefore.state;const a=s.assets.versions.find(a=>a.provenance.kind==='image_operation'&&a.provenance.quality==='medium');if(!a)return {found:false};const blob=await c.asset(a.identity),bytes=new Uint8Array(await blob.arrayBuffer());const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');const bitmap=await createImageBitmap(blob);const box=document.createElement('section');box.setAttribute('aria-label','Verificación de imagen privada guardada');box.style.cssText='position:fixed;inset:0;background:#f8fafc;z-index:99999;overflow:auto;display:grid;place-items:center;padding:24px;';const title=document.createElement('p');title.textContent='Lectura de PNG privado existente · medium · hash verificado · sin generación';const img=document.createElement('img');img.src=URL.createObjectURL(blob);img.alt='Imagen medium privada real recuperada sin modificar';img.style.cssText='max-width:90vw;max-height:80vh;object-fit:contain';box.append(title,img);document.body.append(box);await img.decode();const out={found:true,identity:a.identity,mime:blob.type,bytes:blob.size,width:bitmap.width,height:bitmap.height,sha256:hash,hash_matches:hash===a.identity.version_id,registered_width:a.storage.width,registered_height:a.storage.height,quality:a.provenance.quality,review:s.assets.reviews.find(r=>r.asset.asset_id===a.identity.asset_id&&r.asset.version_id===a.identity.version_id)?.decision??'needs_review'};bitmap.close();return out})()`);
  assert.equal(result.image.found, true); assert.equal(result.image.hash_matches, true); assert.equal(result.image.mime, 'image/png');
  assert.equal(result.image.width, result.image.registered_width); assert.equal(result.image.height, result.image.registered_height);
  await screenshot('private-medium'); result.checks.push('Fetched the existing private medium PNG through its signed URL, verified SHA-256 and decoded dimensions, and inspected a read-only preview');
  result.final = await evaluate(`(async()=>{const value=await window.__realReadClient.read(${JSON.stringify(business)});const canonical=v=>JSON.stringify(v);return {revision:value.revision,jobs:value.state.jobs.jobs.length,state_unchanged:canonical(value.state)===canonical(window.__realReadBefore.state)}})()`);
  assert.equal(result.final.state_unchanged, true); assert.equal(result.final.revision, 11);
  const uniqueAllowed = [...new Map(result.allowed_remote.map(item => [`${item.method} ${item.path}`, item])).values()];
  result.allowed_remote = uniqueAllowed;
  result.checks.push('Final server snapshot equals the initial snapshot; no image/text/provider request or application mutation was allowed');
  result.status = 'passed'; completed = true;
} catch (error) {
  result.status = 'failed'; result.failure = error instanceof Error && !/token|password|email|bearer/i.test(error.message) ? error.message : 'Read-only validation failed';
  if (evaluate) try { result.diagnostic = await evaluate(`(async()=>{const source=await fetch('/src/components/AuthGate.tsx').then(r=>r.text());return {ready:document.readyState,root_children:document.getElementById('root')?.childElementCount??0,body_text:document.body.innerText.slice(0,400),auth_email_runtime_configured:!!source.match(/"VITE_AUTH_EMAIL"\\s*:\\s*"[^"\\s]+"/),auth_password_runtime_configured:!!source.match(/"VITE_AUTH_PASSWORD"\\s*:\\s*"[^"\\s]+"/),local_resources:performance.getEntriesByType('resource').filter(e=>new URL(e.name).origin===location.origin).slice(-15).map(e=>({path:new URL(e.name).pathname,duration:Math.round(e.duration)}))}})()`); } catch { result.diagnostic = { unavailable: true }; }
  if (!result.auth?.verified && result.diagnostic?.root_children > 0 && result.diagnostic?.auth_password_runtime_configured === false) {
    result.status = 'blocked_login'; result.blocking_reason = 'User login is required; the project has no configured autologin password.';
    result.auto_login_configured = false;
    delete result.failure;
  }
  if (screenshot) await screenshot(result.status === 'blocked_login' ? 'login' : 'failure').catch(() => {});
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(3000)]); }
  if (profile) {
    const resolved = path.resolve(profile), temp = path.resolve(tmpdir());
    if (path.dirname(resolved).toLowerCase() !== temp.toLowerCase() || !path.basename(resolved).startsWith('scory-real-validation-')) throw Error('Temporary profile containment check failed');
    try { await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); result.profile_removed = true; }
    catch { result.profile_removed = false; }
  }
  await writeFile(path.join(artifacts, 'real-read-smoke-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: result.checks.length, actor_verified: result.auth?.verified ?? false,
    state_unchanged: result.final?.state_unchanged ?? null, profile_removed: result.profile_removed, failure: result.failure ?? null }));
}
if (!completed) process.exitCode = result.status === 'blocked_login' ? 2 : 1;
