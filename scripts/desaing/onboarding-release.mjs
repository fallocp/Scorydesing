/** Read-only release evidence. No session, provider request or state mutation. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'artifacts/desaing-lab/';
const json = async name => JSON.parse((await readFile(directory + name, 'utf8')).replace(/^\uFEFF/, ''));
const browser = [];
for (const [name, file] of [['initial_brand_setup', 'onboarding-smoke-result.json'],
  ['free_design_and_decks', 'onboarding-workspace-smoke-result.json'],
  ['proposals_with_references', 'onboarding-proposals-regression.log']]) {
  const result = await json(file); assert(result.ok === true || result.success === true, file);
  assert(result.checks.length > 0, file);
  assert.equal(result.actual_provider_calls ?? result.provider_calls ?? result.metrics?.real_provider_calls, 0, file);
  browser.push({ name, checks: result.checks.length, real_provider_calls: 0 });
}
const unit = await readFile(directory + 'onboarding-unit-tests.log', 'utf8');
const suites = Number(unit.match(/Test Files\s+(\d+) passed/)?.[1]), tests = Number(unit.match(/Tests\s+(\d+) passed/)?.[1]);
assert(suites >= 55 && tests >= 1202); assert.doesNotMatch(unit, /\d+ failed/);
assert.match(await readFile(directory + 'onboarding-build.log', 'utf8'), /built in [0-9.]+s/);
for (const file of ['onboarding-typescript.log', 'onboarding-harness-typescript.log', 'onboarding-deno-check.log'])
  assert.doesNotMatch(await readFile(directory + file, 'utf8'), /error TS\d+|error:|Check failed/);
const before = await json('onboarding-remote-before.json'), after = await json('onboarding-remote-after.json');
assert.deepEqual(after, before); assert.equal(after[0].revision, 11); assert.equal(after[0].image_jobs, 3);
assert.equal(after[0].image_committed_micro_usd, '3000000'); assert.equal(after[0].text_attempts, 0);
assert.equal(after[0].limit_micro_usd, 5000000); assert.equal(after[0].max_image_outputs, 4);
assert.deepEqual(await json('onboarding-business-after.json'), await json('onboarding-business-before.json'));
const installed = (await json('onboarding-install-verification.json'))[0];
for (const name of ['client_profile_insert', 'client_profile_delete', 'direct_service_profile_insert', 'client_draft_read',
  'client_receipt_insert', 'client_publish']) assert.equal(installed[name], false, name);
for (const name of ['service_publish', 'profile_append_only', 'profile_member_read', 'migration_recorded']) assert.equal(installed[name], true, name);
for (const name of ['profiles', 'drafts', 'revisions', 'publications']) assert.equal(installed[name], 0, name);
const migration = 'supabase/migrations/202609180004_desaing_onboarding.sql';
assert.equal(createHash('sha256').update(await readFile(migration)).digest('hex'), (await json('onboarding-install-prepared.json')).sha256);
const deployed = (await json('onboarding-deployment-after.json')).find(item => item.slug === 'desaing-server');
assert.equal(deployed.status, 'ACTIVE'); assert.equal(deployed.version, 11); assert.equal(deployed.verify_jwt, true);
const endpoint = await json('onboarding-endpoint-checks.json');
assert.equal(endpoint.checks.length, 16); assert(endpoint.checks.every(item => item.passed));
const protectedFiles = {
  'docs/ScoryDesign_Plan_Integracion_Experimental_v2.md': '2428D916DC19AD8D056AC71B2763E5D91EBC62DFF86FE639C9F852FF15A4382E',
  'deno.lock': 'A5649A22D6F860A5DF78B03C600819C61D4DCA6D8DC4DC51116CAB20DD58433E',
  'supabase/migrations/202609170001_desaing_server_foundation.sql': '61B36E173B5303000EB9BB70CBA91509199528FE6E488751306D08C656B9DB8D',
  'supabase/migrations/202609180003_desaing_materials.sql': '1FCA976E0C7F28A2243F116DC7BD4BE3159C25F6963F3351DDf52AD6507A84BD'.toUpperCase(),
};
for (const [file, hash] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase(), hash, file);
const local = [];
for (const [route, evidence] of [['/onboarding', ''], ['/src/pages/OnboardingPage.tsx', 'BrandSetupPanel'],
  ['/src/components/desaing/BrandSetupPanel.tsx', 'Guardar dirección de marca'], ['/src/pages/XendingDesignPage.tsx', 'Configurar marca']]) {
  const response = await fetch('http://127.0.0.1:3000' + route, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); assert((await response.text()).includes(evidence)); local.push({ route, status: 200, current_module: true });
}
const report = { checked_at: new Date().toISOString(), stage: 'integrated_initial_brand_setup',
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).trim(), uncommitted_workspace: true,
  tests: { suites, tests, cumulative: true }, browser, browser_checks: browser.reduce((sum, item) => sum + item.checks, 0),
  deployment: { slug: deployed.slug, status: deployed.status, version: deployed.version, verify_jwt: deployed.verify_jwt },
  migration, installation: installed, pilot: after[0], unchanged_expiry: '2026-09-19T04:48:03.836Z', new_paid_calls: 0,
  actual_cloud_profiles_created_by_checks: 0, existing_business_and_master_prompts_unchanged: true,
  actual_user_session_tested: false, real_visual_quality_tested: false, production_frontend_deployed: false,
  protected_files_unchanged: Object.keys(protectedFiles), local, next_stage: 'individual_images_and_carousels', remaining_blocks: 3 };
await writeFile(directory + 'onboarding-release.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
