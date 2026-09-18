/** ONE frozen real HTML planning request. Default prepares only. Root reviews before --execute. */
import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadEnv } from 'vite';

const base = 'http://127.0.0.1:3000', cloud = 'https://gdfhytvjnzdovjfovqfv.supabase.co';
const business = 'a0000000-0000-0000-0000-000000000001', actor = '0274bd51-1858-4893-8561-a9c99000feb7';
const artifacts = path.resolve('artifacts/desaing-lab');
const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value && typeof value === 'object'
  ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const preparation = JSON.parse(await readFile(path.join(artifacts, 'real-html-preparation.json'), 'utf8'));
const expectedBytes = await readFile(path.join(artifacts, 'real-html-expected-request.json'));
const body = JSON.parse(expectedBytes.toString('utf8'));
const requestHash = preparation.expected_request_sha256, requestKey = preparation.request_key;
assert.equal(requestKey, '38df4e98-243e-4000-9310-23d5adcfcd49');
assert.equal(requestHash, '50bbd2c2998478908d5e8fcde1dc5a38e1b5dda47a27d9a9b908ce8bf9c4f2e8');
assert.equal(sha(expectedBytes), requestHash, 'Frozen expected request changed');
assert.equal(body.business_id, business); assert.equal(body.request.request_key, requestKey);
assert.equal(body.request.context.actor_id, actor); assert.equal(body.request.context.business_id, business);
assert.equal(body.request.context.brand_id, business);
const projectId = body.request.context.project_id;
assert.equal(projectId, 'real-validation-b-html-20260918');
assert.deepEqual(body.request.context.target, { document_type: 'cover', document_id: projectId, page_id: 'cover-01', revision: '1' });
assert.equal(body.request.context.session_id, 'html:cover:' + projectId + ':cover-01');
assert.deepEqual(body.request.canvas, { width: 800, height: 450 });
assert.equal(new URL(loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_URL).origin, cloud, 'Wrong Supabase project');
const source = preparation.source_reference, upload = preparation.source_upload, piece = preparation.reusable_piece;
const coverBytes = await readFile(path.resolve(source.path)), pieceBytes = await readFile(path.resolve(piece.path));
function png(bytes, expected) {
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(sha(bytes), expected.sha256); assert.equal(bytes.length, expected.bytes);
  assert.equal(bytes.readUInt32BE(16), expected.width); assert.equal(bytes.readUInt32BE(20), expected.height);
}
png(coverBytes, source); png(pieceBytes, piece);
assert.deepEqual(upload, { businessId: business, uploadId: body.request.design_reference.asset_id, brandId: business, projectId });
assert.equal(body.request.design_reference.version_id, source.sha256);
assert.equal(piece.asset.business_id, business); assert.equal(piece.asset.version_id, piece.sha256);
assert.notEqual(piece.asset.asset_id, body.request.design_reference.asset_id);
const requestFile = path.join(artifacts, 'real-validation-html-request.json');
const markerFile = path.join(artifacts, 'real-validation-html-dispatch.json');
if (!process.argv.includes('--execute')) {
  console.log(JSON.stringify({ status:'prepared_not_sent', request_key:requestKey, request_sha256:requestHash,
    actor_id:actor, business_id:business, project_id:projectId, reference_registered:false,
    reference_sha256:source.sha256, piece_sha256:piece.sha256, copy_blocks:body.request.copy.blocks.length,
    max_new_provider_calls:1, reservation_micro_usd:250000, image_calls:0, document_writes:0 }));
  process.exit(0);
}
await mkdir(artifacts, {recursive:true});
const result = { schema_version:1,status:'running',request_key:requestKey,request_sha256:requestHash,
  actor_id:actor,business_id:business,supabase_project:'gdfhytvjnzdovjfovqfv',project_id:projectId,
  session_id:body.request.context.session_id,auth_storage:'memory_only',checks:[],allowed_remote:[],blocked_remote:[],
  failed_responses:[],exception_count:0,first_plan_http_requests:0,replay_http_requests:0,image_requests:0,
  import_http_requests:0,new_provider_calls_maximum:0,local_document_writes:0,cloud_document_writes:0 };
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
let browser,socket,profile,evaluate,send,sessionId,planPermit=null,importPermit=false,firstConfirmed=false,finished=false;
let marker=null;
try { marker=JSON.parse(await readFile(markerFile,'utf8')); assert.equal(marker.request_key,requestKey);assert.equal(marker.request_sha256,requestHash); }
catch(error) { if(error?.code!=='ENOENT') throw Error('Existing dispatch marker invalid; do not resend'); }
async function mark(phase) {
  marker={request_key:requestKey,request_sha256:requestHash,actor_id:actor,business_id:business,phase,updated_at:new Date().toISOString()};
  await writeFile(markerFile,JSON.stringify(marker,null,2));
}
function permit(request) {
  const url=new URL(request.url), method=request.method;
  if(url.origin===base)return ['GET','HEAD','OPTIONS'].includes(method);
  if(url.origin!==cloud)return false;
  if(method==='OPTIONS')return true;
  if(url.pathname==='/auth/v1/token'&&method==='POST')return ['password','refresh_token'].includes(url.searchParams.get('grant_type'));
  if(url.pathname==='/auth/v1/user'&&method==='GET')return true;
  if(method==='GET'&&url.pathname.startsWith('/rest/v1/'))return !url.pathname.includes('/rpc/');
  if(method!=='POST')return false;
  if(url.pathname==='/rest/v1/rpc/desaing_prompt_governed')return true;
  if(url.pathname==='/functions/v1/desaing-server/html/import') {
    const expected={business_id:business,upload_id:upload.uploadId,brand_id:business,project_id:projectId};
    const headers=Object.fromEntries(Object.entries(request.headers).map(([k,v])=>[k.toLowerCase(),v]));
    if(!importPermit||result.import_http_requests!==0||canonical(Object.fromEntries(url.searchParams))!==canonical(expected)||headers['content-type']!=='image/png')return false;
    importPermit=false;result.import_http_requests++;return true;
  }
  let payload;try{payload=JSON.parse(request.postData??'null')}catch{return false}
  if(url.pathname==='/functions/v1/desaing-server')return canonical(payload)===canonical({business_id:business,command:{kind:'read'}});
  if(url.pathname==='/functions/v1/desaing-server/html/plan') {
    if(!planPermit||canonical(payload)!==canonical(body))return false;
    if(planPermit==='first'&&result.first_plan_http_requests===0)result.first_plan_http_requests++;
    else if(planPermit==='replay'&&firstConfirmed&&result.replay_http_requests===0)result.replay_http_requests++;
    else return false;
    planPermit=null;return true;
  }
  if(url.pathname==='/functions/v1/desaing-server/html/history')return canonical(payload)===canonical({business_id:business,session_id:body.request.context.session_id});
  if(url.pathname==='/functions/v1/desaing-server/html/recover')return canonical(payload)===canonical({business_id:business,request_key:requestKey});
  if(url.pathname==='/functions/v1/desaing-server/html/capabilities')return canonical(payload)===canonical({business_id:business});
  return /^\/functions\/v1\/desaing-server\/prompt-admin\/(capabilities|read)$/.test(url.pathname)&&payload?.business_id===business;
}
try {
  assert((await fetch(base)).ok, 'Local app unavailable');
  profile = await mkdtemp(path.join(tmpdir(), 'scory-real-html-'));
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
  const history = () => evaluate(`window.__realHtmlPlanner.history(${JSON.stringify(body.request.context.session_id)})`);
  const recover = () => evaluate('window.__realHtmlPlanner.recover(window.__realHtmlRequest)');
  await send('Page.navigate', { url: `${base}/admin/business` });
  await send('Page.bringToFront');
  console.log(JSON.stringify({ checkpoint: 'interactive_login_required', credentials_stay_in_browser: true }));
  await wait(`(async()=>{try{const{supabase}=await import('/src/integrations/supabase/client.ts');return !!(await supabase.auth.getSession()).data.session}catch{return false}})()`, 'normal user login', 15 * 60 * 1000);
  const auth = await evaluate(`(async()=>{const{supabase}=await import('/src/integrations/supabase/client.ts');const r=await supabase.auth.getUser();return {verified:!r.error&&!!r.data.user,actor_id:r.data.user?.id??null}})()`);
  assert.equal(auth.verified, true); assert.equal(auth.actor_id, actor); result.auth = auth;
  console.log(JSON.stringify({ checkpoint: 'real_auth_verified', actor_id: actor }));
  const ready = await evaluate(`(async()=>{const{supabase}=await import('/src/integrations/supabase/client.ts');const{createDesignServerClient}=await import('/src/lib/desaing/serverClient.ts');const{verifyHtmlCompositionRequest}=await import('/supabase/functions/_shared/desaing/composition.ts');
    const business=await supabase.from('business_tenants').select('id').eq('id',${JSON.stringify(business)}).single();if(business.error||business.data?.id!==${JSON.stringify(business)})return false;
    window.__realHtmlRequest=${JSON.stringify(body.request)};await verifyHtmlCompositionRequest(window.__realHtmlRequest);
    window.__realHtmlClient=createDesignServerClient({endpoint:${JSON.stringify(cloud + '/functions/v1/desaing-server')},publicKey:supabase.supabaseKey,getSession:async()=>{const{data}=await supabase.auth.getSession();return data.session?{actorId:data.session.user.id,accessToken:data.session.access_token}:null}});
    window.__realHtmlPlanner=window.__realHtmlClient.html(${JSON.stringify(business)});
    window.__realHtmlPreparation=${JSON.stringify(preparation)};
    window.__realHtmlCanonical=${canonical.toString()};
    window.__realHtmlSha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    window.__realHtmlRead=async()=>{const s=await window.__realHtmlClient.read(${JSON.stringify(business)});const{getQuotaUsage}=await import('/supabase/functions/_shared/desaing/jobLedger.ts');
      const{getAssetReviewStatus}=await import('/supabase/functions/_shared/desaing/assets.ts');
      const p=${JSON.stringify(piece.asset)},pieceVersion=s.state.assets.versions.find(v=>window.__realHtmlCanonical(v.identity)===window.__realHtmlCanonical(p));
      if(!pieceVersion||getAssetReviewStatus(s.state.assets,p)!=='approved')throw Error('Original medium piece is not approved');
      if(pieceVersion.storage.width!==${piece.width}||pieceVersion.storage.height!==${piece.height}||pieceVersion.storage.size_bytes!==${piece.bytes}||pieceVersion.storage.mime_type!=='image/png')throw Error('Original piece storage changed');
      return {s,summary:{revision:s.revision,jobs:s.state.jobs.jobs.length,policy:s.state.jobs.policy,image_usage:getQuotaUsage(s.state.jobs),piece_approved:true}}};return true})()`);
  assert(ready, 'Real business scope unavailable');
  result.checks.push('Normal login verified the exact actor, business and cloud project; target and approved literal copy match the frozen request');
  result.before = await evaluate(`(async()=>{const r=await window.__realHtmlRead();window.__realHtmlBeforeImport=r.s;return {...r.summary,capabilities:await window.__realHtmlPlanner.capabilities(),existing_reference:r.s.state.assets.versions.find(v=>v.identity.asset_id===${JSON.stringify(upload.uploadId)})??null}})()`);
  assert.equal(result.before.jobs, 3); assert.equal(result.before.image_usage.committed_micro_usd, 3000000);
  assert.equal(result.before.policy.policy_id, 'fai-pilot-5usd-2026-09-17'); assert.equal(result.before.policy.limit_micro_usd, 5000000); assert.equal(result.before.policy.max_image_outputs, 4);
  let registered = result.before.existing_reference;
  if (!registered) {
    assert(result.before.capabilities, 'HTML capability unavailable; no import attempted');
    importPermit = true;
    registered = await evaluate(`(async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(coverBytes.toString('base64'))}),c=>c.charCodeAt(0));if(await window.__realHtmlSha(bytes)!==${JSON.stringify(source.sha256)})throw Error('Frozen PNG changed');
      const blob=new Blob([bytes],{type:'image/png'});if(blob.size!==${coverBytes.length})throw Error('PNG length changed');
      return window.__realHtmlPlanner.upload(${JSON.stringify(upload)},blob)})()`, 90000);
  }
  importPermit = false;
  const actualBody = await evaluate(`(async()=>{const{buildRealHtmlRequest}=await import('/experiments/real-html-request.ts');return buildRealHtmlRequest(window.__realHtmlPreparation,${JSON.stringify(registered)})})()`);
  assert.equal(canonical(actualBody), canonical(body));
  const actualBytes = Buffer.from(JSON.stringify(actualBody, null, 2) + '\n');
  assert.equal(sha(actualBytes), requestHash); await writeFile(requestFile, actualBytes);
  result.reference = { registered, import_reused: !!result.before.existing_reference, source_sha256: source.sha256 };
  result.after_import = await evaluate(`(async()=>{const r=await window.__realHtmlRead();window.__realHtmlImageBefore=r.s;
    const before=structuredClone(window.__realHtmlBeforeImport.state),after=structuredClone(r.s.state);
    before.assets.versions=before.assets.versions.filter(v=>v.identity.asset_id!==${JSON.stringify(upload.uploadId)});after.assets.versions=after.assets.versions.filter(v=>v.identity.asset_id!==${JSON.stringify(upload.uploadId)});
    return {...r.summary,only_reference_added:window.__realHtmlCanonical(before)===window.__realHtmlCanonical(after)}})()`);
  assert.equal(result.after_import.only_reference_added, true);
  assert.equal(result.after_import.revision, result.before.revision + (result.before.existing_reference ? 0 : 1));
  result.checks.push('The exact 800×450 PNG reference is registered without re-encoding; the only image-state mutation is its free immutable import');
  const previous = await history(), matching = previous.filter(item => item.request.request_key === requestKey);
  assert(matching.length <= 1, 'Duplicate durable request');
  if (matching.length) assert.equal(canonical(matching[0].request), canonical(body.request), 'Request key belongs to another payload');
  result.before.history_count = previous.length;
  let output = null, directSuccess = false;
  if (matching.length || marker) {
    output = matching[0]?.status === 'completed' ? matching[0].result : await recover();
    result.execution = output ? 'recovered_without_plan' : 'previous_dispatch_unresolved';
    if (!output) throw Error('Previous request unresolved; no plan sent');
  } else {
    const caps = await evaluate('window.__realHtmlPlanner.capabilities()'); result.preflight_capabilities = caps;
    assert(caps && caps.model === 'gpt-5.4-mini' && caps.reservation_micro_usd === 250000 && caps.remaining_attempts >= 1
      && caps.remaining_micro_usd >= 250000 && caps.remaining_micro_usd <= 991634, 'HTML planning lacks authorized text budget');
    assert(result.after_import.image_usage.committed_micro_usd + 250000 <= result.after_import.policy.limit_micro_usd);
    result.checks.push('Fresh HTML capabilities permit one 250000-micro-USD reservation within existing text and total pilot limits');
    console.log(JSON.stringify({ checkpoint: 'real_html_preflight', request_key: requestKey, reservation_micro_usd: 250000, text_remaining_micro_usd: caps.remaining_micro_usd }));
    await mark('dispatch_authorized'); planPermit = 'first'; result.new_provider_calls_maximum = 1;
    try {
      output = await evaluate('window.__realHtmlPlanner.plan(window.__realHtmlRequest)', 240000);
      firstConfirmed = true; directSuccess = true; await mark('first_response_confirmed'); result.execution = 'one_new_plan_confirmed';
    } catch {
      planPermit = null; await mark('outcome_uncertain'); output = await recover().catch(() => null);
      result.execution = output ? 'recovered_without_replay' : 'new_plan_outcome_uncertain';
      if (!output) throw Error('HTML outcome uncertain; only read recovery attempted, no retry sent');
    }
  }
  assert(output && output.request_key === requestKey && output.composition, 'Expected confirmed HTML composition');
  result.output = output;
  await writeFile(path.join(artifacts, 'real-html-plan-result.json'), JSON.stringify(output, null, 2));
  await evaluate(`(async()=>{const{assertHtmlCompositionResult}=await import('/supabase/functions/_shared/desaing/composition.ts');const r=${JSON.stringify(output)};assertHtmlCompositionResult(r,window.__realHtmlRequest);window.__realHtmlOutput=r;return true})()`);
  const confirmed = (await history()).filter(item => item.request.request_key === requestKey);
  assert.equal(confirmed.length, 1); assert.equal(confirmed[0].status, 'completed');
  assert.equal(canonical(confirmed[0].request), canonical(body.request)); assert.equal(canonical(confirmed[0].result), canonical(output));
  result.after_first = await evaluate('window.__realHtmlPlanner.capabilities()');
  result.checks.push('The server stored one completed request with a validated composition and exact approved copy IDs');
  if (directSuccess) {
    planPermit = 'replay'; const replay = await evaluate('window.__realHtmlPlanner.plan(window.__realHtmlRequest)');
    assert.equal(canonical(replay), canonical(output), 'Idempotent replay changed the result'); await mark('confirmed_replay_same_response');
    result.after_replay = await evaluate('window.__realHtmlPlanner.capabilities()');
    assert.equal(canonical(result.after_replay), canonical(result.after_first), 'Replay changed text budget');
    result.checks.push('A replay only after confirmed success returned the identical stored response without another text charge');
  }
  result.accounting = { reservation_micro_usd_if_new: result.first_plan_http_requests ? 250000 : 0,
    observed_available_micro_usd_delta: result.before.capabilities && result.after_first ? result.before.capabilities.remaining_micro_usd - result.after_first.remaining_micro_usd : null,
    usage: output.usage, not_invoice: true };
  result.final = await evaluate(`(async()=>{const r=await window.__realHtmlRead();return {...r.summary,image_state_unchanged:window.__realHtmlCanonical(r.s.state)===window.__realHtmlCanonical(window.__realHtmlImageBefore.state)}})()`);
  assert.equal(result.final.revision, result.after_import.revision); assert.equal(result.final.image_state_unchanged, true);
  result.final.history_count_for_request = (await history()).filter(item => item.request.request_key === requestKey).length;
  assert.equal(result.final.history_count_for_request, 1);
  result.checks.push('Image jobs, quota, approvals and catalog stayed unchanged after the authorized reference import; the HTML journal has exactly one request');
  // Compilation is local and optional after backend success. A rendering issue must not trigger another model call.
  try {
    const compiled = await evaluate(`(async()=>{await window.__realHtmlRead();const{renderHtmlComposition}=await import('/src/lib/presentations/presentationComposition.ts');
      const bytes=Uint8Array.from(atob(${JSON.stringify(pieceBytes.toString('base64'))}),c=>c.charCodeAt(0));if(await window.__realHtmlSha(bytes)!==${JSON.stringify(piece.sha256)})throw Error('Original PNG changed');
      const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));if(image.width!==${piece.width}||image.height!==${piece.height})throw Error('Original PNG dimensions changed');image.close();
      const slots=window.__realHtmlOutput.composition.slots,bindings={};
      const singleAirplane=slots.length===1&&slots[0].fit==='contain'&&/avi[oó]n|airplane|aircraft|aeroplane|aeronave|plane/i.test(slots[0].label);
      if(singleAirplane)bindings[slots[0].id]={asset:${JSON.stringify(piece.asset)},dataUrl:${JSON.stringify('data:image/png;base64,' + pieceBytes.toString('base64'))},altText:${JSON.stringify(piece.alt_text ?? 'Avión original aprobado, versión media')}};
      const value=renderHtmlComposition(window.__realHtmlRequest,window.__realHtmlOutput,bindings,{allowUnresolved:!singleAirplane});
      const doc=new DOMParser().parseFromString(value.html,'text/html');const texts=Array.from(doc.querySelectorAll('[data-copy-id]')).map(e=>({id:e.getAttribute('data-copy-id'),text:e.textContent,leaf:!e.querySelector('[data-eid]')}));
      return {...value,texts,single_airplane_bound:singleAirplane,copy_version:doc.querySelector('.lab-canvas')?.getAttribute('data-copy-version'),native_shapes:doc.querySelectorAll('[data-composition-kind="shape"]').length}})()`);
    assert.equal(compiled.copy_version, body.request.copy.version_id);
    assert.equal(compiled.texts.length, body.request.copy.blocks.length);
    for (const block of body.request.copy.blocks) {
      const found = compiled.texts.filter(item => item.id === block.id); assert.equal(found.length, 1); assert.equal(found[0].text, block.text); assert.equal(found[0].leaf, true);
    }
    await writeFile(path.join(artifacts, 'real-html-compiled.html'), compiled.html);
    const { html, ...metadata } = compiled;
    result.compilation = { status: compiled.single_airplane_bound ? 'passed' : 'needs_slot_review', ...metadata,
      html_sha256: sha(Buffer.from(html)), compiler: 'src/lib/presentations/presentationComposition.ts', html_path: 'artifacts/desaing-lab/real-html-compiled.html',
      full_reference_mounted: false, cloud_document_saved: false, visual_review_pending: true };
    await writeFile(path.join(artifacts, 'real-html-compiled-manifest.json'), JSON.stringify(result.compilation, null, 2));
    result.checks.push('The real local compiler preserved every literal copy block as editable HTML; complex slots retain exact approved asset identities or explicit pending placeholders');
  } catch {
    result.compilation = { status: 'failed', error: 'Local compilation unavailable; confirmed server result preserved without another model call' };
  }
  result.status = 'passed'; finished = true;
  console.log(JSON.stringify({ checkpoint: 'real_html_confirmed', request_key: requestKey, response_id: output.response_id,
    image_state_unchanged: result.final.image_state_unchanged, compilation: result.compilation.status }));
} catch(error) {
  planPermit=null;importPermit=false;
  result.status=result.first_plan_http_requests&&!firstConfirmed?'uncertain_do_not_resend':'blocked';
  result.failure=error instanceof Error&&!/password|bearer|token|email/i.test(error.message)?error.message:'Validation stopped; sensitive details omitted';
} finally {
  socket?.close();
  if (browser && browser.exitCode === null) { browser.kill(); await Promise.race([new Promise(resolve => browser.once('exit', resolve)), delay(3000)]); }
  if (profile) {
    const resolved = path.resolve(profile), temp = path.resolve(tmpdir());
    if (path.dirname(resolved).toLowerCase() !== temp.toLowerCase() || !path.basename(resolved).startsWith('scory-real-html-')) throw Error('Temporary profile containment check failed');
    try { await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); result.profile_removed = true; }
    catch { result.profile_removed = false; }
  }
  await writeFile(path.join(artifacts, 'real-html-smoke-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: result.checks.length, first_plan_http_requests: result.first_plan_http_requests,
    replay_http_requests: result.replay_http_requests, image_requests: result.image_requests, profile_removed: result.profile_removed }));
}
if (!finished) process.exitCode = 1;
