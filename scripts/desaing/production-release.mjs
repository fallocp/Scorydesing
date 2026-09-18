/** Read-only evidence closure for image/carousel integration. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'artifacts/desaing-lab/';
const json = async name => JSON.parse((await readFile(directory + name, 'utf8')).replace(/^\uFEFF/, ''));
const browser = [];
for (const [name, file] of [['images_and_carousel_slides', 'production-smoke-result.json'],
  ['initial_brand_setup', 'production-onboarding-smoke-result.json'], ['free_design_and_decks', 'production-workspace-smoke-result.json']]) {
  const result = await json(file); assert(result.ok === true || result.success === true, file); assert(result.checks.length > 0, file);
  assert.equal(result.actual_provider_calls ?? result.provider_calls ?? result.metrics?.real_provider_calls, 0, file);
  browser.push({ name, checks: result.checks.length, real_provider_calls: 0 });
}
const unit = await readFile(directory + 'production-unit-tests.log', 'utf8');
const suites = Number(unit.match(/Test Files\s+(\d+) passed/)?.[1]), tests = Number(unit.match(/Tests\s+(\d+) passed/)?.[1]);
assert(suites >= 59 && tests > 1249); assert.doesNotMatch(unit, /\d+ failed/);
assert.match(await readFile(directory + 'production-build.log', 'utf8'), /built in [0-9.]+s/);
for (const file of ['production-typescript.log', 'production-harness-typescript.log', 'production-deno-check.log'])
  assert.doesNotMatch(await readFile(directory + file, 'utf8'), /error TS\d+|error:|Check failed/);
const before = await json('production-remote-before.json'), after = await json('production-remote-after.json');
assert.deepEqual(after, before); assert.equal(after[0].revision, 11); assert.equal(after[0].image_jobs, 3);
assert.equal(after[0].image_committed_micro_usd, '3000000'); assert.equal(after[0].text_attempts, 0);
assert.equal(after[0].limit_micro_usd, 5000000); assert.equal(after[0].max_image_outputs, 4);
assert.deepEqual(await json('production-business-after.json'), await json('production-business-before.json'));
const installed = (await json('production-install-verification.json'))[0];
for (const name of ['client_snapshot_read', 'client_snapshot_insert', 'direct_service_update', 'direct_receipt_delete', 'client_apply'])
  assert.equal(installed[name], false, name);
for (const name of ['service_apply', 'service_prepare', 'snapshots_rls', 'receipts_rls', 'migration_recorded']) assert.equal(installed[name], true, name);
for (const name of ['snapshots', 'receipts']) assert.equal(installed[name], 0, name);
const migration = 'supabase/migrations/202609180005_desaing_production.sql';
assert.equal(createHash('sha256').update(await readFile(migration)).digest('hex'), (await json('production-install-prepared.json')).sha256);
const deployed = (await json('production-deployment-after.json')).find(item => item.slug === 'desaing-server');
assert.equal(deployed.status, 'ACTIVE'); assert.equal(deployed.version, 13); assert.equal(deployed.verify_jwt, true);
const endpoint = await json('production-endpoint-checks.json');
assert.equal(endpoint.checks.length, 16); assert(endpoint.checks.every(item => item.passed));
const protectedFiles = {
  'docs/ScoryDesign_Plan_Integracion_Experimental_v2.md': '2428D916DC19AD8D056AC71B2763E5D91EBC62DFF86FE639C9F852FF15A4382E',
  'deno.lock': 'A5649A22D6F860A5DF78B03C600819C61D4DCA6D8DC4DC51116CAB20DD58433E',
  'supabase/migrations/202609170001_desaing_server_foundation.sql': '61B36E173B5303000EB9BB70CBA91509199528FE6E488751306D08C656B9DB8D',
  'supabase/migrations/202609180003_desaing_materials.sql': '1FCA976E0C7F28A2243F116DC7BD4BE3159C25F6963F3351DDF52AD6507A84BD',
  'supabase/migrations/202609180004_desaing_onboarding.sql': '09F63813AB673B6C957DA472CEA736E5BA9AEBB687B513810EBE6432FBD13A8C',
};
for (const [file, hash] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase(), hash, file);
const local = [];
for (const [route, evidence] of [['/design-studio', ''], ['/src/pages/DesignStudioPage.tsx', 'StudioImagePanel'],
  ['/src/components/design-studio/CarouselPanel.tsx', 'StudioImagePanel']]) {
  const response = await fetch('http://127.0.0.1:3000' + route, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); assert((await response.text()).includes(evidence)); local.push({ route, status: 200, current_module: true });
}
const report = { checked_at: new Date().toISOString(), stage: 'individual_images_and_carousels',
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).trim(), uncommitted_workspace: true,
  tests: { suites, tests, cumulative: true, added_this_stage: tests - 1249 }, browser, browser_checks: browser.reduce((sum, item) => sum + item.checks, 0),
  deployment: { slug: deployed.slug, status: deployed.status, version: deployed.version, verify_jwt: deployed.verify_jwt },
  migration, installation: installed, pilot: after[0], unchanged_expiry: '2026-09-19T04:48:03.836Z', new_paid_calls: 0,
  cloud_mockups_or_carousels_changed_by_checks: 0, existing_business_and_master_prompts_unchanged: true,
  actual_user_session_tested: false, real_visual_quality_tested: false, production_frontend_deployed: false,
  protected_files_unchanged: Object.keys(protectedFiles), local, next_stage: 'administrative_master_prompt_learning', remaining_blocks: 2 };
await writeFile(directory + 'production-release.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
