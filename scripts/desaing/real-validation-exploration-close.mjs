/** Offline closure of the real five-idea request and confirmed replay. Never sends requests. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'artifacts/desaing-lab');
const actor = '0274bd51-1858-4893-8561-a9c99000feb7', business = 'a0000000-0000-0000-0000-000000000001';
const requestKey = '2359b064-8fac-4fe7-97bd-f8946a48f762';
const requestHash = 'ffdb55d88ea0e981115e193b897f5fd88b8fb1310103f7f7937f130f48d8376c';
const file = name => path.join(directory, name);
const bytes = name => readFile(file(name));
const json = async name => JSON.parse((await readFile(file(name), 'utf8')).replace(/^\uFEFF/, ''));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const omit = (object, names) => Object.fromEntries(Object.entries(object).filter(([key]) => !names.includes(key)));
const oneRow = rows => { assert(Array.isArray(rows) && rows.length === 1); assert.equal(rows[0].business_id, business); return rows[0]; };
const checkNames = [];
const evidenceNames = ['real-validation-exploration-request.json', 'real-validation-exploration-preparation.json',
  'real-validation-exploration-dispatch.json', 'real-exploration-smoke-result.json'];
const body = await json(evidenceNames[0]), preparation = await json(evidenceNames[1]);
const dispatch = await json(evidenceNames[2]), browser = await json(evidenceNames[3]);
const request = body.request;

assert.equal(sha256(await bytes(evidenceNames[0])), requestHash);
for (const document of [preparation, dispatch, browser]) {
  assert.equal(document.request_key, requestKey); assert.equal(document.request_sha256, requestHash);
  assert.equal(document.actor_id, actor); assert.equal(document.business_id, business);
}
assert.equal(body.business_id, business); assert.equal(request.request_key, requestKey);
assert.equal(request.context.actor_id, actor); assert.equal(request.context.business_id, business); assert.equal(request.context.brand_id, business);
assert.equal(request.kind, 'directions'); assert.equal(request.scope, 'full_design');
assert.equal(request.context.workspace, 'free_design'); assert.equal(request.context.interaction_mode, 'explore_design');
assert.equal(request.context.project_id, browser.project_id); assert.equal(request.context.session_id, browser.session_id);
assert.equal(request.context.session_id, preparation.session_id); assert.deepEqual(request.context.target, preparation.target);
assert.deepEqual(request.context.references, []); assert.deepEqual(request.history, []);
assert.equal(request.context.copy_version_id, preparation.copy_sha256);
assert.equal(sha256(preparation.literal_copy), preparation.copy_sha256);
assert(request.context.immutable_elements.some(text => text.endsWith(preparation.literal_copy)));
assert.equal(preparation.source_html, 'experiments/pilot/reference.html');
assert.equal(sha256(await readFile(path.join(root, preparation.source_html))), preparation.source_html_sha256);
assert.equal(preparation.status, 'prepared_not_sent'); // This preparation is a historical artifact, not current execution status.
assert.equal(browser.supabase_project, 'gdfhytvjnzdovjfovqfv'); assert.equal(browser.status, 'passed');
assert.equal(browser.auth.verified, true); assert.equal(browser.auth.actor_id, actor);
assert.equal(browser.auth_storage, 'memory_only'); assert.equal(browser.profile_removed, true);
assert.equal(browser.checks.length, 5); assert.equal(new Set(browser.checks).size, 5);
assert.equal(browser.execution, 'one_new_plan_confirmed'); assert.equal(browser.before.request_already_exists, false);
checkNames.push('Frozen request bytes, copy/source hashes, actor, business, target and normal login match the authorized request.');

const domains = {};
for (const name of ['counts', 'remote', 'business']) {
  const names = ['before', 'after-login', 'after-exploration'].map(stage => `real-validation-${name}-${stage}.json`);
  const rows = await Promise.all(names.map(async filename => oneRow(await json(filename))));
  assert.deepEqual(rows[0], rows[1], `${name}: pre-login and authenticated read differ`);
  evidenceNames.push(...names); domains[name] = { before: rows[0], after: rows[2] };
}
const counts = domains.counts.after, remote = domains.remote.after;
assert.equal(counts.text_attempts, 1); assert.equal(counts.text_receipts.length, 1);
const receipt = counts.text_receipts[0], output = browser.output;
assert.equal(receipt.status, 'completed'); assert.equal(receipt.request_key, requestKey);
assert.equal(output.request_key, requestKey); assert.equal(receipt.response_id, output.response_id);
assert(/^resp_[A-Za-z0-9]+$/.test(output.response_id));
assert.equal(output.ideas.length, 5); assert.equal(new Set(output.ideas.map(idea => idea.title)).size, 5);
for (const idea of output.ideas) {
  for (const key of ['title', 'rationale', 'render_instruction']) assert(typeof idea[key] === 'string' && idea[key].trim());
  assert.deepEqual(Object.keys(idea.aspects).sort(), ['composition', 'palette', 'style', 'subject']);
  for (const aspect of Object.values(idea.aspects)) assert(typeof aspect === 'string' && aspect.trim());
  assert.deepEqual(idea.reference_ids, []);
}
assert.deepEqual(output.usage, { input_tokens: 990, output_tokens: 1694, total_tokens: 2684 });
assert.deepEqual(receipt.usage, output.usage); assert.deepEqual(browser.accounting.usage, output.usage);
assert.equal(browser.final.history_count_for_request, 1);
checkNames.push('One SQL journal row completed with the exact request key, response ID, usage and five distinct structured ideas.');

assert.equal(browser.first_plan_http_requests, 1); assert.equal(browser.replay_http_requests, 1);
assert.equal(browser.new_provider_calls_maximum, 1); assert.equal(dispatch.phase, 'confirmed_replay_same_response');
assert.deepEqual(browser.after_replay, browser.after_first);
assert.equal(browser.before.history_count, 0); assert.equal(browser.final.history_count_for_request, 1);
assert.equal(browser.allowed_remote.filter(entry => entry.method === 'POST' && entry.path === '/functions/v1/desaing-server/exploration/plan').length, 2);
assert.deepEqual(browser.failed_responses, []); assert.equal(browser.exception_count, 0);
checkNames.push('One confirmed plan and one identical replay are recorded; replay preserved the result, single journal entry and available budget.');

const estimate = Math.ceil((output.usage.input_tokens * 3 + output.usage.output_tokens * 18) / 4);
assert.equal(estimate, 8366); assert.equal(receipt.settled_micro_usd, estimate); assert.equal(receipt.reserved_micro_usd, 250000);
assert.equal(browser.accounting.not_invoice, true); assert.equal(browser.accounting.observed_available_micro_usd_delta, estimate);
assert.equal(browser.before.capabilities.remaining_micro_usd, 1000000);
assert.equal(browser.after_first.remaining_micro_usd, 1000000 - estimate);
assert.equal(browser.after_first.remaining_attempts, browser.before.capabilities.remaining_attempts - 1);
assert.equal(browser.before.capabilities.reservation_micro_usd, 250000); assert.equal(browser.after_first.reservation_micro_usd, 250000);
assert.equal(browser.before.capabilities.model, 'gpt-5.4-mini'); assert.equal(browser.after_first.model, 'gpt-5.4-mini');
assert.equal(browser.before.policy.limit_micro_usd, 5000000); assert.equal(browser.before.policy.max_image_outputs, 4);
assert.equal(remote.text_attempts, 1); assert.equal(Number(remote.text_committed_micro_usd), estimate);
assert.equal(Number(remote.image_committed_micro_usd), 3000000); assert.equal(remote.limit_micro_usd, 5000000);
assert.equal(remote.max_image_outputs, 4); assert(3000000 + estimate <= remote.limit_micro_usd);
checkNames.push('The text reservation settled to the conservative server estimate of 8366 micro-USD; USD 5 total and USD 1 text limits remain unchanged.');

assert.deepEqual(domains.business.after, domains.business.before);
assert.deepEqual(omit(counts, ['text_attempts', 'text_receipts']), omit(domains.counts.before, ['text_attempts', 'text_receipts']));
assert.deepEqual(omit(remote, ['text_attempts', 'text_committed_micro_usd']), omit(domains.remote.before, ['text_attempts', 'text_committed_micro_usd']));
assert.equal(counts.image_audit_events, 11); assert.equal(counts.revision, 11); assert.equal(remote.image_jobs, 3);
assert.equal(counts.prompt_mutations, 0); assert.equal(counts.production_receipts, 0);
assert.equal(browser.before.revision, 11); assert.equal(browser.final.revision, 11); assert.equal(browser.final.jobs, 3);
assert.equal(browser.final.image_state_unchanged, true);
assert.deepEqual(browser.final.image_usage, browser.before.image_usage);
assert.deepEqual(browser.final.image_usage, { committed_micro_usd: 3000000, image_outputs: 3, unsettled_calls: 3 });
assert.equal(browser.image_requests, 0); assert.equal(browser.local_document_writes, 0); assert.equal(browser.normal_document_creation_flow_tested, false);
assert.deepEqual(browser.blocked_remote, [{ method: 'POST', path: '/rest/v1/rpc/set_active_business' }]);
const postPaths = new Set(['/auth/v1/token', '/functions/v1/desaing-server', ...['plan', 'history', 'capabilities'].map(route => `/functions/v1/desaing-server/exploration/${route}`)]);
for (const entry of browser.allowed_remote) {
  assert(['GET', 'POST', 'OPTIONS'].includes(entry.method));
  assert(typeof entry.path === 'string' && !/[?#]/.test(entry.path));
  if (entry.method === 'POST') assert(postPaths.has(entry.path), 'Unexpected remote mutation');
}
assert.equal(browser.ui.status, 'failed');
checkNames.push('Image jobs, image audit, image reservations and business hashes remain unchanged; no image, publication or document mutation occurred.');

// Separate local preview evidence supplements, and never replaces, the original UI failure.
const previewFile = 'real-exploration-offline-ui-result.json', preview = await json(previewFile);
const originalHash = 'fa6151a380b137a83b5ce1b1bb0aeefbdf1f4578dd4a7631783ba471242e67e0';
const screenshotHash = '169e2367d30ffe88858db0b7888c48e3aa34401b52752e74823cd765567c3bdb';
assert.equal(sha256(await bytes('real-exploration-smoke-result.json')), originalHash);
assert.equal(preview.saved_response_artifact_sha256, originalHash); assert.equal(preview.request_sha256, requestHash);
assert.equal(preview.status, 'passed'); assert.equal(preview.mode, 'offline_saved_result');
assert.equal(preview.checks.length, 3); assert.equal(new Set(preview.checks).size, 3);
for (const key of ['provider_calls', 'remote_calls', 'remote_writes', 'local_document_writes']) assert.equal(preview[key], 0);
assert.deepEqual(preview.blocked_requests, []); assert.deepEqual(preview.exceptions, []);
for (const entry of preview.requests) {
  assert.equal(entry.method, 'GET'); assert.equal(new URL(entry.url).origin, 'http://127.0.0.1:3000');
}
assert.equal(preview.normal_document_flow_tested, false);
const ui = preview.ui, uiState = ui.state;
assert.equal(uiState.component, 'DesignExplorationPanel'); assert.equal(uiState.mode, 'offline_saved_result');
assert.equal(uiState.request_key, requestKey); assert.equal(uiState.response_id, output.response_id);
assert.deepEqual(uiState.context, request.context); assert.equal(uiState.scope, request.scope);
assert.equal(uiState.selected, null); assert.deepEqual(uiState.render_bindings, []);
assert.equal(uiState.normal_document_flow_tested, false);
for (const key of ['provider_calls', 'remote_writes', 'local_document_writes']) assert.equal(uiState[key], 0);
assert.equal(ui.cards.length, 5); assert.equal(uiState.ideas.length, 5);
assert.deepEqual(ui.cards.map(card => card.title), output.ideas.map(idea => idea.title));
for (let index = 0; index < 5; index++) {
  const idea = output.ideas[index];
  for (const key of Object.keys(idea)) assert.deepEqual(uiState.ideas[index][key], idea[key]);
  for (const value of [idea.rationale, ...Object.values(idea.aspects)]) assert(ui.cards[index].text.includes(value));
}
assert.equal(ui.all_controls_disabled, true); assert.equal(ui.horizontal_overflow, false);
assert.equal(ui.auth_inputs, 0); assert.equal(ui.images, 0);
assert.equal(preview.screenshot.file, 'artifacts/desaing-lab/real-exploration-five-ideas.png');
assert.equal(preview.screenshot.sha256, screenshotHash);
const screenshot = await bytes('real-exploration-five-ideas.png');
assert.equal(sha256(screenshot), screenshotHash);
assert(screenshot.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
assert.equal(screenshot.toString('ascii', 12, 16), 'IHDR');
assert.equal(screenshot.readUInt32BE(16), preview.screenshot.width); assert.equal(screenshot.readUInt32BE(20), preview.screenshot.height);
assert.equal(preview.screenshot.width, 1425); assert.equal(preview.screenshot.height, 1559);
evidenceNames.push(previewFile, 'real-exploration-five-ideas.png');

const evidence = await Promise.all(evidenceNames.map(async name => ({ file: name, sha256: sha256(await bytes(name)) })));
const report = {
  schema_version: 1, checked_at: new Date().toISOString(), stage: 'real_validation', stage_complete: false,
  status: 'real_text_replay_and_offline_preview_passed', checks: checkNames, check_count: 5,
  actor_id: actor, business_id: business, request_key: requestKey, request_sha256: requestHash,
  response_id: output.response_id, output_sha256: sha256(JSON.stringify(output)), evidence,
  result: { idea_count: 5, usage: output.usage, completed_sql_rows: 1, first_plan_http_requests: 1, replay_http_requests: 1,
    provider_inferences: 1, inference_evidence: 'One confirmed durable result; identical replay and unchanged journal/budget verified by the real harness.',
    full_payload_equality_evidence: 'The harness asserted canonical request/history/result/replay equality; SQL metadata export contains keys, usage and costs, not full payloads.' },
  accounting: { model: 'gpt-5.4-mini', original_reservation_micro_usd: 250000, server_settled_micro_usd: estimate,
    conservative_estimated_usd: estimate / 1000000, not_invoice: true, provider_billing_queried: false,
    estimate_rule: 'ceil((input_tokens * 3 + output_tokens * 18) / 4), charging input at the full standard rate',
    image_reservations_micro_usd: 3000000, text_committed_micro_usd: estimate, total_committed_micro_usd: 3000000 + estimate,
    total_limit_micro_usd: 5000000, text_limit_micro_usd: 1000000, text_remaining_micro_usd: 1000000 - estimate,
    image_outputs: 3, image_slots_remaining: 1, image_cost_settlements: 0,
    historical_image_partial_estimate_usd: 0.042472, historical_total_image_cost_known: false },
  unchanged: { business_hashes: true, image_state: true, image_revision: 11, image_audit_events: 11,
    image_jobs: 3, prompt_publications: 0, production_receipts: 0, local_document_writes: 0 },
  ui: { original_artifact: 'real-exploration-smoke-result.json', original_status: 'failed', status: 'offline_preview_verified',
    normal_document_creation_flow_tested: false, preserves_original_failure: true },
  offline_preview: { verified: true, artifact: previewFile, check_count: 3, checks: preview.checks,
    request_sha256: requestHash, original_result_sha256: originalHash, screenshot: preview.screenshot,
    idea_count: 5, exact_titles: true, rationales_and_aspects_present: true, all_controls_disabled: true,
    remote_calls: 0, provider_calls: 0, remote_writes: 0, local_document_writes: 0,
    no_auth_inputs: true, normal_document_creation_flow_tested: false },
  session: { auth_storage: 'memory_only', profile_removed: true, login_method: 'normal_user_login' },
  new_image_generations: 0, visual_approval_recorded: false,
  pending: ['medium_b_final_visual_review', 'real_vision_and_html_results',
    'remote_write_concurrency', 'attributable_historical_image_cost_evidence'], remaining_blocks: 1,
};
assert.equal(checkNames.length, 5);
await writeFile(file('real-validation-exploration-release.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, checks: checkNames.length, ideas: 5, first_plan: 1, replay: 1,
  server_settled_micro_usd: estimate, not_invoice: true, image_requests: 0, image_state_unchanged: true,
  offline_preview_verified: true, offline_preview_checks: 3, stage_complete: false }));
