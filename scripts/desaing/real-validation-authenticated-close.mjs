/** Offline closure of seven real JWT reads. No cloud, browser, Auth or provider operations. */
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'artifacts/desaing-lab');
const actor = '0274bd51-1858-4893-8561-a9c99000feb7', business = 'a0000000-0000-0000-0000-000000000001';
const file = name => path.join(directory, name);
const json = async name => JSON.parse((await readFile(file(name), 'utf8')).replace(/^\uFEFF/, ''));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const evidenceFile = 'real-read-smoke-result.json';
const browser = await json(evidenceFile);
assert.equal(browser.schema_version, 1); assert.equal(browser.status, 'passed');
assert.equal(browser.app, 'http://127.0.0.1:3000'); assert.equal(browser.business_id, business); assert.equal(browser.expected_actor_id, actor);
assert.equal(browser.checks.length, 7); assert.equal(new Set(browser.checks).size, 7);
assert.equal(browser.auth.verified, true); assert.equal(browser.auth.actor_id, actor);
assert.equal(browser.auto_login_configured, false); assert.equal(browser.auth_storage, 'memory_only');
assert.equal(browser.profile_removed, true); assert.equal(browser.session_metadata_write_blocked, true);
assert.deepEqual(browser.scope, { ok: true, business_id: business, active_business_id: business });
assert.equal(browser.engine.enabled, true); assert.equal(browser.engine.revision, 11); assert.equal(browser.engine.jobs, 3);
assert.equal(browser.engine.generation.remaining_outputs, 1); assert.equal(browser.engine.generation.supports_full_design, true);
assert.deepEqual(browser.prompt_capabilities, { governed: true, can_manage: true });
assert.equal(browser.prompt.actor_id, actor); assert.equal(browser.prompt.business_id, business);
assert.equal(browser.prompt.draft, null); assert.equal(browser.prompt.tests, 0); assert.equal(browser.prompt.reviews, 0);
assert.equal(browser.prompt.receipts, 0); assert.deepEqual(browser.prompt.evidence, []);
assert.equal(browser.materials.actor_id, actor); assert.equal(browser.materials.business_id, business);
assert.equal(browser.materials.revision, 0); assert.equal(browser.materials.history, 0); assert.equal(browser.materials.materials, 0);
assert.equal(browser.materials.capabilities.reservation_micro_usd, 250000);
assert.equal(browser.materials.capabilities.remaining_micro_usd, 1000000);
assert.equal(browser.onboarding.can_write, true); assert.equal(browser.onboarding.draft, null); assert.equal(browser.onboarding.profile_version, 0);
assert.equal(browser.image.found, true); assert.equal(browser.image.hash_matches, true); assert.equal(browser.image.mime, 'image/png');
assert.equal(browser.image.quality, 'medium'); assert.equal(browser.image.review, 'needs_review');
assert.equal(browser.image.identity.business_id, business); assert.equal(browser.image.identity.version_id, browser.image.sha256);
assert.equal(browser.image.width, browser.image.registered_width); assert.equal(browser.image.height, browser.image.registered_height);
const medium = await readFile(file('real-validation-medium-remote.png'));
assert.equal(sha256(medium), browser.image.sha256); assert.equal(medium.length, browser.image.bytes);
assert.equal(browser.provider_calls, 0); assert.equal(browser.application_mutations, 0); assert.equal(browser.exceptions, 0);
assert.deepEqual(browser.failed_responses, []);
assert.deepEqual(browser.final, { revision: 11, jobs: 3, state_unchanged: true });
assert.deepEqual(browser.blocked_remote, [{ method: 'POST', path: '/rest/v1/rpc/set_active_business' }]);
const allowedPosts = new Set(['/auth/v1/token', '/functions/v1/desaing-server',
  ...['prompt-admin/capabilities', 'prompt-admin/read', 'materials/read', 'materials/history', 'materials/capabilities', 'onboarding/read', 'assets/url']
    .map(route => `/functions/v1/desaing-server/${route}`)]);
for (const entry of browser.allowed_remote) {
  assert(['OPTIONS', 'GET', 'POST'].includes(entry.method));
  assert.equal(typeof entry.path, 'string'); assert(!entry.path.includes('?') && !entry.path.includes('#'));
  if (entry.method === 'POST') assert(allowedPosts.has(entry.path), 'Unexpected remote mutation');
  if (entry.method === 'GET') assert(entry.path === '/auth/v1/user'
    || /^\/rest\/v1\/(?:user_business_memberships|business_tenants|campaign_categories|commercial_branches)$/.test(entry.path)
    || entry.path.startsWith(`/storage/v1/object/sign/desaing-assets/${business}/generated/`));
}
for (const endpoint of allowedPosts) assert(browser.allowed_remote.some(entry => entry.method === 'POST' && entry.path === endpoint));

// Keep both historical documents byte-identical; do not rerun/re-date the older closure.
const historical = [
  ['real-read-prelogin-result.json', '2f1a4d5b425a2f2cca436f523aad4a5a6f7085aaa413fb70d36a1f115e2d4875'],
  ['real-validation-readonly-release.json', 'c889c2dedde6a96f30510ce3e40a7bbf62abb0d543ccb9cc574b03f76e47cf07'],
];
for (const [name, hash] of historical) assert.equal(sha256(await readFile(file(name))), hash);
assert.equal((await json(historical[0][0])).status, 'blocked_login');
const prepared = await json('real-validation-exploration-preparation.json');
assert.equal(prepared.status, 'prepared_not_sent'); assert.equal(prepared.expected_ideas, 5);
assert.equal(prepared.activity.provider_calls, 0);
assert.equal(sha256(await readFile(file('real-validation-exploration-request.json'))), prepared.request_sha256);
const unchangedDomains = [];
for (const domain of ['counts', 'business', 'remote']) {
  const before = `real-validation-${domain}-before.json`, after = `real-validation-${domain}-after-login.json`;
  assert.deepEqual(await json(after), await json(before), `Changed ${domain} after normal login`);
  unchangedDomains.push({ domain, before, after, after_sha256: sha256(await readFile(file(after))) });
}

const artifacts = [];
for (const name of ['real-read-admin-desktop.png', 'real-read-materials-desktop.png', 'real-read-onboarding-desktop.png', 'real-read-private-medium.png']) {
  const bytes = await readFile(file(name));
  assert(bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert(width > 0 && width <= 10000 && height > 0 && height <= 10000);
  artifacts.push({ file: name, bytes: bytes.length, sha256: sha256(bytes), width, height });
}
const checks = [
  'Normal browser login and getUser verified the existing actor; temporary in-memory profile removed.',
  'Business read passed RLS; local selection only, startup metadata write blocked.',
  'Real JWT engine read and generation capability passed; revision 11 and three jobs.',
  'Explicit prompt-administration capability and family read passed; approved evidence list is empty.',
  'Materials read/history/capabilities and onboarding base read passed without saving or analysis.',
  'Existing private medium PNG read passed SHA-256, byte size and decoded dimension checks.',
  'Final engine snapshot unchanged; zero provider calls, application mutations or new image approvals.',
];
const report = {
  schema_version: 1, checked_at: new Date().toISOString(), stage: 'real_validation', stage_complete: false,
  status: 'authenticated_reads_passed_real_validation_open', checks, check_count: checks.length,
  actor_id: actor, business_id: business, user_jwt_verified: true,
  login: { method: 'normal_password_entered_by_user_in_browser', autologin: false, auth_gate_changed: false,
    admin_bootstrap_used: false, auth_storage: 'memory_only', temporary_profile_removed: true },
  evidence: { file: evidenceFile, sha256: sha256(await readFile(file(evidenceFile))), file_modified_at: (await stat(file(evidenceFile))).mtime.toISOString() },
  historical: historical.map(([name, hash]) => ({ file: name, sha256: hash, preserved: true })), artifacts,
  unchanged_domains_after_login: unchangedDomains,
  verified: { engine_revision: 11, engine_jobs: 3, generation_capability_available: true, image_slots_remaining: 1,
    prompt_admin_granted: true, approved_prompt_evidence_count: 0, private_medium_sha256: browser.image.sha256, final_snapshot_unchanged: true },
  ui_limits: { onboarding_screenshot: 'Captured while recovering the draft; does not prove the loaded onboarding flow.',
    business_selection: 'Set locally for the read-only harness; set_active_business RPC deliberately blocked.' },
  evidence_limits: { engine_policy_usage: 'Null fields reflect an incorrect harness projection; they do not establish absence of server policy or quota.',
    jwt_expiration: 'Capability was available during the run; this receipt does not report an exact JWT gate expiration.',
    billing: 'Historical token-rate estimates are not attributable billing settlement.' },
  prepared_text_request: { request_key: prepared.request_key, sha256: prepared.request_sha256, ideas: 5, sent_during_this_run: false },
  new_paid_calls: 0, new_image_generations: 0, application_mutations: 0, prompt_publications: 0, image_cost_settlements: 0,
  visual_approval_recorded: false,
  pending: ['medium_b_final_visual_review', 'real_text_and_vision_results', 'remote_write_concurrency', 'attributable_image_cost_evidence'],
  remaining_blocks: 1,
};
await writeFile(file('real-validation-authenticated-release.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, checks: checks.length, user_jwt_verified: true,
  provider_calls: 0, application_mutations: 0, stage_complete: false, historical_preserved: true }));
