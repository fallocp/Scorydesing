/** Read-only closure: verify implementation evidence, deployment and unchanged pilot/business data. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'artifacts/desaing-lab/';
const json = async name => JSON.parse((await readFile(directory + name, 'utf8')).replace(/^\uFEFF/, ''));
const unit = await readFile(directory + 'prompt-admin-unit-tests.log', 'utf8');
const suites = Number(unit.match(/Test Files\s+(\d+) passed/)?.[1]), tests = Number(unit.match(/Tests\s+(\d+) passed/)?.[1]);
assert(suites > 63 && tests > 1297); assert.doesNotMatch(unit, /\d+ failed/);
assert.match(await readFile(directory + 'prompt-admin-build.log', 'utf8'), /built in [0-9.]+s/);
for (const name of ['typescript', 'app-typescript', 'harness-typescript', 'deno-check'])
  assert.doesNotMatch(await readFile(directory + `prompt-admin-${name}.log`, 'utf8'), /error TS\d+|error:|Check failed/);
const browser = [];
for (const [name, file] of [['administrative_prompt', 'prompt-admin-smoke-result.json'], ['images_and_carousels', 'prompt-admin-production-smoke-result.json'], ['initial_brand_setup', 'prompt-admin-onboarding-smoke-result.json']]) {
  const result = await json(file); assert(result.ok === true || result.success === true, file); assert(result.checks.length > 0, file);
  assert.equal(result.actual_provider_calls ?? result.provider_calls ?? result.metrics?.real_provider_calls, 0, file);
  browser.push({ name, checks: result.checks.length, real_provider_calls: 0 });
}
const before = await json('prompt-admin-remote-before.json'), after = await json('prompt-admin-remote-after.json');
assert.deepEqual(after, before); assert.equal(after[0].revision, 11); assert.equal(after[0].image_jobs, 3);
assert.equal(after[0].image_committed_micro_usd, '3000000'); assert.equal(after[0].text_attempts, 0);
assert.equal(after[0].limit_micro_usd, 5000000); assert.equal(after[0].max_image_outputs, 4);
assert.deepEqual(await json('prompt-admin-business-after.json'), await json('prompt-admin-business-before.json'));
const installed = (await json('prompt-admin-install-verification.json'))[0];
for (const name of ['client_grant_insert', 'client_draft_read', 'direct_history_delete', 'client_mutate']) assert.equal(installed[name], false, name);
for (const name of ['exact_grant', 'service_mutate', 'unique_versions', 'migration_recorded']) assert.equal(installed[name], true, name);
for (const name of ['drafts', 'history', 'tests', 'reviews', 'mutations']) assert.equal(installed[name], 0, name);
assert.equal(installed.scopes, 1); assert.equal(installed.grants, 1); assert.equal(installed.restrictive_policies, 3); assert.equal(installed.rls_tables, 7);
const migration = 'supabase/migrations/202609180006_desaing_prompt_admin.sql';
assert.equal(createHash('sha256').update(await readFile(migration)).digest('hex'), (await json('prompt-admin-install-prepared.json')).sha256);
const previous = await json('prompt-admin-deployment-before.json'), current = await json('prompt-admin-deployment-after.json');
const slugs = ['desaing-server', 'generate-design-image', 'generate-strategy', 'generate-design-html', 'generate-ideas', 'generate-variants', 'adapt-channel', 'hydrate-templates', 'suggest-image-ideas', 'refine-branch', 'analyze-image-reference', 'suggest-copy', 'generate-carousel-script', 'generate-carousel-plan'];
const deployed = slugs.map(slug => {
  const old = previous.find(item => item.slug === slug), value = current.find(item => item.slug === slug);
  assert(old && value, slug); assert.equal(value.status, 'ACTIVE', slug); assert(value.version > old.version, slug); assert.equal(value.verify_jwt, old.verify_jwt, slug);
  return { slug, previous_version: old.version, version: value.version, status: value.status, verify_jwt: value.verify_jwt };
});
const endpoint = await json('prompt-admin-endpoint-checks.json'); assert.equal(endpoint.checks.length, 36); assert(endpoint.checks.every(item => item.passed));
const protectedFiles = {
  'docs/ScoryDesign_Plan_Integracion_Experimental_v2.md': '2428D916DC19AD8D056AC71B2763E5D91EBC62DFF86FE639C9F852FF15A4382E',
  'deno.lock': 'A5649A22D6F860A5DF78B03C600819C61D4DCA6D8DC4DC51116CAB20DD58433E',
  'supabase/migrations/202609170001_desaing_server_foundation.sql': '61B36E173B5303000EB9BB70CBA91509199528FE6E488751306D08C656B9DB8D',
  'supabase/migrations/202609180003_desaing_materials.sql': '1FCA976E0C7F28A2243F116DC7BD4BE3159C25F6963F3351DDF52AD6507A84BD',
  'supabase/migrations/202609180004_desaing_onboarding.sql': '09F63813AB673B6C957DA472CEA736E5BA9AEBB687B513810EBE6432FBD13A8C',
  'supabase/migrations/202609180005_desaing_production.sql': '39ABC95FE0DCA7D79BBC25B3BE4C8A7D29C509CFDE3E945459DF02600829EF51',
};
for (const [file, hash] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase(), hash, file);
const local = [];
for (const [route, content] of [['/admin/business', ''], ['/src/components/MasterPromptEditor.tsx', 'PromptAdminPanel']]) {
  const response = await fetch('http://127.0.0.1:3000' + route, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); assert((await response.text()).includes(content)); local.push({ route, status: 200 });
}
const report = { checked_at: new Date().toISOString(), stage: 'administrative_master_prompt_learning',
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).trim(), uncommitted_workspace: true,
  tests: { suites, tests, cumulative: true, includes_existing_readiness_suites: true }, browser,
  browser_checks: browser.reduce((sum, item) => sum + item.checks, 0), deployed, migration, installation: installed,
  pilot: after[0], unchanged_expiry: '2026-09-19T04:48:03.836Z', new_paid_calls: 0,
  real_master_prompt_publications: 0, existing_business_and_master_prompts_unchanged: true,
  actual_user_session_tested: false, real_visual_quality_tested: false, production_frontend_deployed: false,
  protected_files_unchanged: Object.keys(protectedFiles), local, next_stage: 'real_user_validation', remaining_blocks: 1 };
await writeFile(directory + 'prompt-admin-release.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
