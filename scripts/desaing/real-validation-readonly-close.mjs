/** Close only the read-only portion; this never labels the full real validation complete. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const directory = 'artifacts/desaing-lab/';
const json = async name => JSON.parse((await readFile(directory + name, 'utf8')).replace(/^\uFEFF/, ''));
const hash = value => createHash('sha256').update(value).digest('hex');
const unchanged = [];
for (const domain of ['remote', 'business', 'counts']) {
  assert.deepEqual(await json(`real-validation-${domain}-after.json`), await json(`real-validation-${domain}-before.json`), domain);
  unchanged.push(domain);
}
const state = await json('real-validation-pilot-status.json');
const technical = await json('pilot-current-technical-review.json');
assert.equal(technical.images.length, 2);
assert(technical.images.every(item => item.editable_text_count === 7 && item.html_equals_reference_after_removing_image && item.embedded_png_matches_original_bytes));
assert.equal(state.revision, 11); assert.equal(state.state.jobs.jobs.length, 3);
assert.equal(state.quota.committed_micro_usd, 3000000); assert.equal(state.quota.image_outputs, 3); assert.equal(state.quota.unsettled_calls, 3);
const replay = await json('real-validation-direction-replay.json'); assert.equal(replay.reused, true); assert.equal(replay.revision, 11);
assert.deepEqual(replay.approval, state.state.assets.direction_approvals.find(item => item.approval_id === replay.approval.approval_id));
const imageChecks = [];
for (const [side, oldFile] of [['low', 'pilot-responses_image-low.png'], ['medium', 'pilot-b-medium.png']]) {
  const read = await json(`real-validation-${side}-read.json`), bytes = await readFile(directory + `real-validation-${side}-remote.png`);
  assert.equal(hash(bytes), read.asset.version_id); assert.equal(hash(bytes), read.local_asset.sha256);
  assert(technical.images.some(item => item.sha256 === hash(bytes)));
  assert.deepEqual(bytes, await readFile(directory + oldFile));
  imageChecks.push({ quality: side, sha256: hash(bytes), bytes: bytes.length, matches_historical_asset: true, private_cloud_read: true });
}
// Historical pre-login evidence. Do not replace it with a later authenticated run.
const browser = await json('real-read-prelogin-result.json');
assert.equal(browser.status, 'blocked_login'); assert.equal(browser.provider_calls, 0); assert.equal(browser.application_mutations, 0);
assert.equal(browser.diagnostic.auth_password_runtime_configured, false); assert.equal(browser.diagnostic.ready, 'complete');
assert(browser.diagnostic.root_children > 0); assert.equal(browser.allowed_remote.length, 0); assert.equal(browser.exceptions, 0);
assert.equal(browser.profile_removed, true);
const prepared = await json('real-validation-exploration-preparation.json');
assert.equal(prepared.status, 'prepared_not_sent'); assert.equal(prepared.expected_ideas, 5); assert.equal(prepared.activity.provider_calls, 0);
assert.equal(hash(await readFile(directory + 'real-validation-exploration-request.json')), prepared.request_sha256);
const report = { checked_at: new Date().toISOString(), stage: 'real_validation', stage_complete: false,
  status: 'awaiting_user_login_and_visual_review', verified: {
    administrative_status: true, image_files: imageChecks, existing_direction_replay: { reused: true, unchanged_revision: 11 },
    html_editable_texts_preserved: 7, app_login_form_renders: true, unchanged_domains: unchanged },
  user_jwt_verified: false, jwt_window_verified_this_stage: false,
  administrative_generation_window: { expired: state.expired, expires_at: new Date(state.expires_at).toISOString() },
  login: { runtime_password_configured: false, temporary_profile_removed: browser.profile_removed,
    resume_command: 'node scripts/desaing/real-read-smoke.mjs --interactive', interactive_mode_started: false },
  prepared_text_request: { key: prepared.request_key, sha256: prepared.request_sha256, ideas: 5, sent: false },
  new_paid_calls: 0, new_image_generations: 0, image_reservations_micro_usd: state.quota.committed_micro_usd,
  image_slots_remaining: 1, prompt_publications: 0, visual_approval_recorded: false, image_cost_settlements: 0,
  pending: ['normal_user_login', 'medium_b_final_visual_review', 'real_text_and_vision_results', 'remote_write_concurrency', 'attributable_image_cost_evidence'],
  remaining_blocks: 1 };
await writeFile(directory + 'real-validation-readonly-release.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
