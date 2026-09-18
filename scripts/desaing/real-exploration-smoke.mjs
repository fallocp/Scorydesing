/** One frozen textual exploration. Default only prepares; --execute opens normal interactive login. */
import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';

const base = 'http://127.0.0.1:3000', cloud = 'https://gdfhytvjnzdovjfovqfv.supabase.co';
const business = 'a0000000-0000-0000-0000-000000000001', actor = '0274bd51-1858-4893-8561-a9c99000feb7';
const requestKey = '2359b064-8fac-4fe7-97bd-f8946a48f762', requestHash = 'ffdb55d88ea0e981115e193b897f5fd88b8fb1310103f7f7937f130f48d8376c';
const projectId = 'real-validation-xending-cover-20260918', artifacts = path.resolve('artifacts/desaing-lab');
const requestFile = path.join(artifacts, 'real-validation-exploration-request.json');
const markerFile = path.join(artifacts, 'real-validation-exploration-dispatch.json');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object'
  ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const bytes = await readFile(requestFile), body = JSON.parse(bytes.toString('utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'), requestHash, 'Frozen request bytes changed');
assert.equal(body.business_id, business); assert.equal(body.request.request_key, requestKey);
assert.equal(body.request.context.actor_id, actor); assert.equal(body.request.context.business_id, business);
assert.equal(body.request.context.brand_id, business); assert.equal(body.request.context.project_id, projectId);
assert.equal(body.request.context.session_id, `free_design:cover:${projectId}:cover-01:full_design`);
assert.deepEqual(body.request.context.target, { document_type: 'cover', document_id: projectId, page_id: 'cover-01', revision: '1' });
assert.equal(body.request.scope, 'full_design'); assert.equal(body.request.kind, 'directions'); assert.deepEqual(body.request.context.references, []);
assert.equal(new URL(loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_URL).origin, cloud, 'Wrong Supabase project');
const execute = process.argv.includes('--execute');
if (!execute) {
  console.log(JSON.stringify({ status: 'prepared_not_sent', request_key: requestKey, request_sha256: requestHash,
    actor_id: actor, business_id: business, project_id: projectId, expected_ideas: 5,
    reservation_micro_usd: 250000, max_new_provider_calls: 1, image_calls: 0, requires: '--execute and normal interactive login' }));
  process.exit(0);
}

await mkdir(artifacts, { recursive: true });
const result = { schema_version: 1, status: 'running', request_key: requestKey, request_sha256: requestHash,
  actor_id: actor, business_id: business, supabase_project: 'gdfhytvjnzdovjfovqfv', project_id: projectId,
  session_id: body.request.context.session_id, auth_storage: 'memory_only', checks: [], allowed_remote: [], blocked_remote: [],
  failed_responses: [], exception_count: 0, first_plan_http_requests: 0, replay_http_requests: 0, image_requests: 0,
  new_provider_calls_maximum: 0, local_document_writes: 0, normal_document_creation_flow_tested: false };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, profile, evaluate, send, sessionId, planPermit = null, firstConfirmed = false, finished = false;
let marker = null;
try { marker = JSON.parse(await readFile(markerFile, 'utf8')); assert.equal(marker.request_key, requestKey); assert.equal(marker.request_sha256, requestHash); }
catch (error) { if (error?.code !== 'ENOENT') throw Error('Existing dispatch marker could not be validated; do not resend'); }
async function mark(phase) {
  marker = { request_key: requestKey, request_sha256: requestHash, actor_id: actor, business_id: business, phase, updated_at: new Date().toISOString() };
  await writeFile(markerFile, JSON.stringify(marker, null, 2));
}
function permit(request) {
  const url = new URL(request.url), method = request.method;
  if (url.origin === base) return ['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (url.origin !== cloud) return false;
  if (method === 'OPTIONS') return true;
  if (url.pathname === '/auth/v1/token' && method === 'POST') return ['password', 'refresh_token'].includes(url.searchParams.get('grant_type'));
  if (url.pathname === '/auth/v1/user' && method === 'GET') return true;
  if (method === 'GET' && url.pathname.startsWith('/rest/v1/')) return !url.pathname.includes('/rpc/');
  if (method !== 'POST') return false;
  if (url.pathname === '/rest/v1/rpc/desaing_prompt_governed') return true;
  let payload; try { payload = JSON.parse(request.postData ?? 'null'); } catch { return false; }
  if (url.pathname === '/functions/v1/desaing-server') return canonical(payload) === canonical({ business_id: business, command: { kind: 'read' } });
  if (url.pathname === '/functions/v1/desaing-server/exploration/plan') {
    if (!planPermit || canonical(payload) !== canonical(body)) return false;
    if (planPermit === 'first' && result.first_plan_http_requests === 0) result.first_plan_http_requests++;
    else if (planPermit === 'replay' && firstConfirmed && result.replay_http_requests === 0) result.replay_http_requests++;
    else return false;
    planPermit = null; return true;
  }
  if (url.pathname === '/functions/v1/desaing-server/exploration/history') return canonical(payload) === canonical({ business_id: business, session_id: body.request.context.session_id });
  if (url.pathname === '/functions/v1/desaing-server/exploration/recover') return canonical(payload) === canonical({ business_id: business, request_key: requestKey });
  if (url.pathname === '/functions/v1/desaing-server/exploration/capabilities') return canonical(payload) === canonical({ business_id: business });
  // The initial real admin screen may make these reads; all its mutations stay blocked.
  return /^\/functions\/v1\/desaing-server\/prompt-admin\/(capabilities|read)$/.test(url.pathname) && payload?.business_id === business;
}
try {
  assert((await fetch(base)).ok, 'Local app unavailable');
  profile = await mkdtemp(path.join(tmpdir(), 'scory-real-exploration-'));
  browser = spawn(process.env.DESAING_TEST_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ['--incognito', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update',
      '--disable-sync', '--disable-extensions', '--disable-application-cache', '--disk-cache-size=0', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: false, stdio: ['ignore', 'ignore', 'pipe'] });
  const debuggerUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Chrome unavailable')), 20000);
    browser.once('error', () => { clearTimeout(timer); reject(Error('Chrome unavailable')); });
    browser.stderr.on('data', buffer => { const match = buffer.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(debuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(Error('CDP unavailable')), { once: true }); });
  let nextId = 0; const waiting = new Map();
  send = (method, params = {}, targetSession = sessionId, timeout = 45000) => new Promise((resolve, reject) => {
    const id = ++nextId, timer = setTimeout(() => { waiting.delete(id); reject(Error(`CDP timeout: ${method}`)); }, timeout);
    waiting.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(targetSession ? { sessionId: targetSession } : {}) }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.id && waiting.has(message.id)) {
      const item = waiting.get(message.id); waiting.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(Error('CDP operation failed')); else item.resolve(message.result);
    } else if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params, allowed = permit(request), url = new URL(request.url);
      if (url.origin !== base) (allowed ? result.allowed_remote : result.blocked_remote).push({ method: request.method, path: url.pathname });
      // Never save headers, auth bodies, signed queries or console messages.
      void send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' }, message.sessionId).catch(() => {});
    } else if (message.method === 'Runtime.exceptionThrown') result.exception_count++;
    else if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const url = new URL(message.params.response.url); result.failed_responses.push({ path: url.pathname, status: message.params.response.status });
    }
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http*', requestStage: 'Request' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const memory=new Map(),local=localStorage;const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
    Storage.prototype.getItem=function(k){return this===local?memory.get(String(k))??null:get.call(this,k)};
    Storage.prototype.setItem=function(k,v){if(this===local)memory.set(String(k),String(v));else set.call(this,k,v)};
    Storage.prototype.removeItem=function(k){if(this===local)memory.delete(String(k));else remove.call(this,k)};
    Storage.prototype.clear=function(){if(this===local)memory.clear()};
    const WS=window.WebSocket;window.WebSocket=class extends WS{constructor(url,protocols){if(!['127.0.0.1','localhost'].includes(new URL(url,location.href).hostname))throw Error('validation_websocket_guard');super(url,protocols)}};
  })();` });
  evaluate = async (expression, timeout = 45000) => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId, timeout);
    if (reply.exceptionDetails) throw Error('Browser evaluation failed; sensitive exception omitted'); return reply.result.value;
  };
  const wait = async (expression, label, timeout = 60000) => { const until = Date.now() + timeout;
    while (Date.now() < until) { if (await evaluate(expression)) return; await delay(200); } throw Error(`Timed out: ${label}`); };
  const history = () => evaluate(`window.__realExplorationPlanner.history(${JSON.stringify(body.request.context.session_id)})`);
  const recover = () => evaluate(`window.__realExplorationPlanner.recover(${JSON.stringify(requestKey)},window.__realExplorationRequest)`);
  await send('Page.navigate', { url: `${base}/admin/business` });
  await send('Page.bringToFront');
  console.log(JSON.stringify({ checkpoint: 'interactive_login_required', credentials_stay_in_browser: true }));
  await wait(`(async()=>{try{const{ supabase }=await import('/src/integrations/supabase/client.ts');return !!(await supabase.auth.getSession()).data.session}catch{return false}})()`, 'normal user login', 15 * 60 * 1000);
  const auth = await evaluate(`(async()=>{const{ supabase }=await import('/src/integrations/supabase/client.ts');const r=await supabase.auth.getUser();return {verified:!r.error&&!!r.data.user,actor_id:r.data.user?.id??null}})()`);
  assert.equal(auth.verified, true); assert.equal(auth.actor_id, actor); result.auth = auth;
  console.log(JSON.stringify({ checkpoint: 'real_auth_verified', actor_id: actor }));
  // Use direct scoped reads; do not depend on App's intentionally blocked metadata write or mutate its active-business store.
  const ready = await evaluate(`(async()=>{const{ supabase }=await import('/src/integrations/supabase/client.ts');const{createDesignServerClient}=await import('/src/lib/desaing/serverClient.ts');const{assertExplorationRequest}=await import('/supabase/functions/_shared/desaing/exploration.ts');
    const business=await supabase.from('business_tenants').select('id').eq('id',${JSON.stringify(business)}).single();if(business.error||business.data?.id!==${JSON.stringify(business)})return false;
    const request=${JSON.stringify(body.request)};assertExplorationRequest(request);window.__realExplorationRequest=structuredClone(request);
    window.__realExplorationClient=createDesignServerClient({endpoint:${JSON.stringify(cloud + '/functions/v1/desaing-server')},publicKey:supabase.supabaseKey,getSession:async()=>{const{data}=await supabase.auth.getSession();return data.session?{actorId:data.session.user.id,accessToken:data.session.access_token}:null}});
    window.__realExplorationPlanner=window.__realExplorationClient.exploration(${JSON.stringify(business)});return true})()`);
  assert(ready, 'Real business scope unavailable'); result.checks.push('Normal Supabase login verified the exact actor, business, cloud project and frozen design target');
  result.before = await evaluate(`(async()=>{const c=window.__realExplorationClient,s=await c.read(${JSON.stringify(business)});window.__realExplorationImageBefore=s;const{getQuotaUsage}=await import('/supabase/functions/_shared/desaing/jobLedger.ts');return {revision:s.revision,jobs:s.state.jobs.jobs.length,policy:s.state.jobs.policy,image_usage:getQuotaUsage(s.state.jobs),capabilities:await window.__realExplorationPlanner.capabilities()}})()`);
  assert.equal(result.before.revision, 11); assert.equal(result.before.jobs, 3); assert.equal(result.before.image_usage.committed_micro_usd, 3000000);
  assert.equal(result.before.policy.policy_id, 'fai-pilot-5usd-2026-09-17'); assert.equal(result.before.policy.limit_micro_usd, 5000000); assert.equal(result.before.policy.max_image_outputs, 4);
  const previous = await history(), matching = previous.filter(item => item.request.request_key === requestKey);
  assert(matching.length <= 1, 'Duplicate durable request');
  if (matching.length) assert.equal(canonical(matching[0].request), canonical(body.request), 'Request key belongs to different payload');
  result.before.history_count = previous.length; result.before.request_already_exists = !!matching.length;
  let output = null, directSuccess = false;
  if (matching.length) {
    output = matching[0].status === 'completed' ? matching[0].result : await recover();
    result.execution = output ? 'recovered_existing_request_without_plan' : 'existing_request_unresolved';
    if (!output) throw Error('Existing request remains unresolved; no plan was sent');
  } else if (marker) {
    output = await recover(); result.execution = output ? 'recovered_local_dispatch_without_plan' : 'previous_dispatch_unresolved';
    if (!output) throw Error('Previous local dispatch marker exists; no plan was sent');
  } else {
    const caps = result.before.capabilities;
    assert(caps && caps.model === 'gpt-5.4-mini' && caps.reservation_micro_usd === 250000 && caps.remaining_attempts >= 1
      && caps.remaining_micro_usd >= 250000 && caps.remaining_micro_usd <= 1000000, 'Text generation is unavailable or lacks authorized budget');
    assert(result.before.image_usage.committed_micro_usd + 250000 <= result.before.policy.limit_micro_usd, 'Overall pilot budget unavailable');
    result.preflight = { text_remaining_micro_usd: caps.remaining_micro_usd, reservation_micro_usd: 250000, total_limit_micro_usd: 5000000,
      image_committed_micro_usd: result.before.image_usage.committed_micro_usd, max_new_provider_calls: 1 };
    result.checks.push('Live capabilities and exact policy permit one 250000-micro-USD text reservation within the text/overall pilot limits');
    console.log(JSON.stringify({ checkpoint: 'real_exploration_preflight', request_key: requestKey, ...result.preflight }));
    await mark('dispatch_authorized'); planPermit = 'first'; result.new_provider_calls_maximum = 1;
    try {
      output = await evaluate(`window.__realExplorationPlanner.plan(window.__realExplorationRequest)`, 240000);
      firstConfirmed = true; directSuccess = true; await mark('first_response_confirmed'); result.execution = 'one_new_plan_confirmed';
    } catch {
      planPermit = null; await mark('outcome_uncertain'); output = await recover().catch(() => null);
      result.execution = output ? 'recovered_after_uncertain_response_without_replay' : 'new_plan_outcome_uncertain';
      if (!output) throw Error('Plan outcome uncertain; only recovery was attempted and no retry was sent');
    }
  }
  assert(output && output.request_key === requestKey && output.ideas?.length === 5, 'Expected five confirmed ideas');
  result.output = output;
  await evaluate(`(async()=>{const{assertExplorationResult}=await import('/supabase/functions/_shared/desaing/exploration.ts');const r=${JSON.stringify(output)};assertExplorationResult(r,window.__realExplorationRequest);window.__realExplorationOutput=structuredClone(r);return true})()`);
  const confirmedHistory = await history(), confirmedEntry = confirmedHistory.filter(item => item.request.request_key === requestKey);
  assert.equal(confirmedEntry.length, 1); assert.equal(confirmedEntry[0].status, 'completed');
  assert.equal(canonical(confirmedEntry[0].request), canonical(body.request)); assert.equal(canonical(confirmedEntry[0].result), canonical(output));
  result.checks.push('The real server stored exactly one completed request with five validated ideas, matching the frozen payload and confirmed response');
  result.after_first = await evaluate(`window.__realExplorationPlanner.capabilities()`);
  if (directSuccess) {
    planPermit = 'replay';
    const replay = await evaluate(`window.__realExplorationPlanner.plan(window.__realExplorationRequest)`, 45000);
    assert.equal(canonical(replay), canonical(output), 'Idempotent replay changed the response'); await mark('confirmed_replay_same_response');
    const replayHistory = await history(); assert.equal(replayHistory.filter(item => item.request.request_key === requestKey).length, 1);
    result.after_replay = await evaluate(`window.__realExplorationPlanner.capabilities()`);
    assert.equal(canonical(result.after_replay), canonical(result.after_first), 'Replay changed available text budget');
    result.checks.push('Only after a confirmed success, the identical HTTP replay returned the same result without another journal entry or budget change');
  }
  result.accounting = { reservation_micro_usd_if_new: result.first_plan_http_requests ? 250000 : 0,
    observed_available_micro_usd_delta: result.before.capabilities && result.after_first
      ? result.before.capabilities.remaining_micro_usd - result.after_first.remaining_micro_usd : null,
    usage: output.usage, not_invoice: true, evidence: 'Server capabilities delta and normalized usage; provider billing was not queried.' };
  result.final = await evaluate(`(async()=>{const s=await window.__realExplorationClient.read(${JSON.stringify(business)});const{getQuotaUsage}=await import('/supabase/functions/_shared/desaing/jobLedger.ts');const{canonicalExploration}=await import('/supabase/functions/_shared/desaing/explorationRepository.ts');return {revision:s.revision,jobs:s.state.jobs.jobs.length,image_usage:getQuotaUsage(s.state.jobs),image_state_unchanged:canonicalExploration(s.state)===canonicalExploration(window.__realExplorationImageBefore.state)}})()`);
  assert.equal(result.final.revision, 11); assert.equal(result.final.jobs, 3); assert.equal(result.final.image_usage.committed_micro_usd, 3000000); assert.equal(result.final.image_state_unchanged, true);
  result.final.history_count_for_request = (await history()).filter(item => item.request.request_key === requestKey).length;
  assert.equal(result.final.history_count_for_request, 1);
  result.checks.push('Final image state, revision 11, three jobs and 3000000-micro-USD image commitment are unchanged; the text journal has one request');
  try {
    result.ui = await evaluate(`(async()=>{const{createExplorationSession,beginExploration,finishExploration}=await import('/supabase/functions/_shared/desaing/exploration.ts');
      const request=window.__realExplorationRequest,session=finishExploration(beginExploration(createExplorationSession(request.context,request.scope),request),window.__realExplorationOutput);
      const resources=performance.getEntriesByType('resource').map(e=>e.name);const dependency=name=>resources.find(url=>new URL(url).origin===location.origin&&new URL(url).pathname.endsWith('/'+name));
      const reactUrl=dependency('react.js'),rootUrl=dependency('react-dom_client.js');if(!reactUrl||!rootUrl)throw Error('React dependencies unavailable');
      const React=(await import(reactUrl)).default,{createRoot}=await import(rootUrl);const{DesignExplorationPanel}=await import('/src/components/desaing/DesignExplorationPanel.tsx');
      const host=document.createElement('section');host.id='real-exploration-verification';host.style.cssText='position:fixed;inset:0;z-index:99999;overflow:auto;background:#f8fafc;padding:24px;color:#14252d;';
      const heading=document.createElement('h1');heading.textContent='Cinco ideas recuperadas del servidor · vista de verificación';heading.style.cssText='font-size:22px;font-weight:700;margin-bottom:12px';
      const note=document.createElement('p');note.textContent='Componente real con respuesta real. Acciones deshabilitadas. No crea un documento, guarda selección ni genera imágenes.';
      const fieldset=document.createElement('fieldset');fieldset.disabled=true;const target=document.createElement('div');fieldset.append(target);host.append(heading,note,fieldset);document.body.append(host);
      const noop=()=>{};createRoot(target).render(React.createElement(DesignExplorationPanel,{session,busy:false,error:'',simulation:false,
        onPlanFive:noop,onDiscuss:noop,onSelect:noop,onRefine:noop,onCombine:noop,onUseIdea:noop,onRecover:noop}));window.__realExplorationSession=session;
      return {component:'DesignExplorationPanel',mode:'isolated_readonly_verification',target:session.context.target,session_id:session.context.session_id,
        selected:session.selected,render_bindings:session.render_bindings,document_saved:false,normal_document_flow_tested:false}})()`);
    await wait("document.querySelectorAll('#real-exploration-verification .dep-card').length===5", 'real five-idea component');
    const displayed = await evaluate("Array.from(document.querySelectorAll('#real-exploration-verification .dep-card')).map(e=>({title:e.querySelector('h4').textContent,text:e.textContent}))");
    assert.deepEqual(displayed.map(item => item.title), output.ideas.map(item => item.title));
    for (let index = 0; index < 5; index++) for (const value of Object.values(output.ideas[index].aspects)) assert(displayed[index].text.includes(value));
    assert.equal(result.ui.selected, null); assert.deepEqual(result.ui.render_bindings, []);
    const fullHeight = await evaluate("document.getElementById('real-exploration-verification').scrollHeight");
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: Math.min(10000, Math.max(1100, fullHeight + 48)), deviceScaleFactor: 1, mobile: false });
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path.join(artifacts, 'real-exploration-five-ideas.png'), Buffer.from(shot.data, 'base64'));
    result.checks.push('The real DesignExplorationPanel displayed the five server ideas in an isolated read-only view; no local document, selection or image binding was written');
    result.ui.status = 'passed';
  } catch {
    result.ui = { ...(result.ui ?? {}), status: 'failed', error: 'Read-only UI verification unavailable; server result remains confirmed' };
  }
  result.status = 'passed'; finished = true;
  console.log(JSON.stringify({ checkpoint: 'real_exploration_confirmed', request_key: requestKey, ideas: output.ideas.length,
    response_id: output.response_id, image_state_unchanged: result.final.image_state_unchanged }));
} catch (error) {
  planPermit = null; result.status = result.first_plan_http_requests && !firstConfirmed ? 'uncertain_do_not_resend' : 'blocked';
  result.failure = error instanceof Error && !/password|bearer|token|email/i.test(error.message) ? error.message : 'Validation stopped; sensitive details omitted';
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(3000)]); }
  if (profile) {
    const resolved = path.resolve(profile), temp = path.resolve(tmpdir());
    if (path.dirname(resolved).toLowerCase() !== temp.toLowerCase() || !path.basename(resolved).startsWith('scory-real-exploration-')) throw Error('Temporary profile containment check failed');
    try { await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); result.profile_removed = true; }
    catch { result.profile_removed = false; }
  }
  await writeFile(path.join(artifacts, 'real-exploration-smoke-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: result.checks.length, first_plan_http_requests: result.first_plan_http_requests,
    replay_http_requests: result.replay_http_requests, image_requests: result.image_requests, profile_removed: result.profile_removed }));
}
if (!finished) process.exitCode = 1;
