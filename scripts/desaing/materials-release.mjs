/** Read-only evidence closure: no user session, model request or state mutation. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'artifacts/desaing-lab/';
const json = async name => JSON.parse((await readFile(directory + name, 'utf8')).replace(/^\uFEFF/, ''));
const browser = [];
const materials = await json('materials-smoke-result.json');
assert.equal(materials.ok, true); assert(materials.checks.length >= 8);
assert.equal(materials.metrics.real_provider_calls, 0); assert.deepEqual(materials.external_requests, []);
assert.deepEqual(materials.exceptions, []);
browser.push({ name: 'durable_materials', checks: materials.checks.length, real_provider_calls: 0 });
for (const [name, file, count] of [['free_design_and_decks', 'materials-workspace-smoke-result.json', 11],
  ['proposals_with_references', 'materials-proposals-regression.log', 9]]) {
  const result = await json(file); assert(result.ok === true || result.success === true, file);
  assert.equal(result.checks.length, count, file);
  assert.equal(result.actual_provider_calls ?? result.provider_calls ?? result.metrics?.real_provider_calls, 0, file);
  browser.push({ name, checks: result.checks.length, real_provider_calls: 0 });
}
const unit = await readFile(directory + 'materials-unit-tests.log', 'utf8');
const suites = Number(unit.match(/Test Files\s+(\d+) passed/)?.[1]), tests = Number(unit.match(/Tests\s+(\d+) passed/)?.[1]);
assert(suites >= 55 && tests >= 1201); assert.doesNotMatch(unit, /\d+ failed/);
const build = await readFile(directory + 'materials-build.log', 'utf8');
assert.match(build, /built in [0-9.]+s/); assert.doesNotMatch(build, /error TS\d+/);
for (const file of ['materials-typescript.log', 'materials-harness-typescript.log', 'materials-deno-check.log']) {
  assert.doesNotMatch(await readFile(directory + file, 'utf8'), /error TS\d+|error:|Check failed/);
}
const before = await json('materials-remote-before.json'), after = await json('materials-remote-after.json');
assert.deepEqual(after, before); assert.equal(after[0].revision, 11); assert.equal(after[0].image_jobs, 3);
assert.equal(after[0].image_committed_micro_usd, '3000000'); assert.equal(after[0].text_attempts, 0);
assert.equal(after[0].limit_micro_usd, 5000000); assert.equal(after[0].max_image_outputs, 4);
const installed = (await json('materials-install-verification.json'))[0];
for (const name of ['bucket_public', 'client_read', 'client_insert', 'direct_service_update', 'direct_history_delete', 'client_commit']) assert.equal(installed[name], false, name);
for (const name of ['service_commit', 'storage_isolation', 'migration_recorded']) assert.equal(installed[name], true, name);
for (const name of ['collections', 'revisions', 'material_files']) assert.equal(installed[name], 0, name);
assert.equal(installed.max_file_bytes, 8388608);
const migration = 'supabase/migrations/202609180003_desaing_materials.sql';
assert.equal(createHash('sha256').update(await readFile(migration)).digest('hex'), (await json('materials-install-prepared.json')).sha256);
const deployed = (await json('materials-deployment-after.json')).find(item => item.slug === 'desaing-server');
assert.equal(deployed.status, 'ACTIVE'); assert.equal(deployed.version, 10); assert.equal(deployed.verify_jwt, true);
const endpoint = await json('materials-endpoint-checks.json');
assert.equal(endpoint.checks.length, 32); assert(endpoint.checks.every(item => item.passed));
const protectedFiles = {
  'docs/ScoryDesign_Plan_Integracion_Experimental_v2.md': '2428D916DC19AD8D056AC71B2763E5D91EBC62DFF86FE639C9F852FF15A4382E',
  'deno.lock': 'A5649A22D6F860A5DF78B03C600819C61D4DCA6D8DC4DC51116CAB20DD58433E',
  'supabase/migrations/202609170001_desaing_server_foundation.sql': '61B36E173B5303000EB9BB70CBA91509199528FE6E488751306D08C656B9DB8D',
};
for (const [file, hash] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase(), hash, file);
const local = [];
for (const [route, evidence] of [['/materials', ''], ['/src/pages/MaterialsPage.tsx', 'Materiales de referencia'],
  ['/src/components/desaing/MaterialsPanel.tsx', 'Usar ficha revisada'], ['/src/pages/FreeDesignPage.tsx', 'MaterialsPanel'],
  ['/src/components/presentations/ServerDesignPanel.tsx', 'MaterialsPanel']]) {
  const response = await fetch('http://127.0.0.1:3000' + route, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); assert((await response.text()).includes(evidence)); local.push({ route, status: 200, current_module: true });
}
await writeFile(directory + 'materials-local-checks.json', JSON.stringify({ checked_at: new Date().toISOString(), local,
  actual_user_session_tested: false, paid_calls: 0 }, null, 2));
const report = { checked_at: new Date().toISOString(), stage: 'durable_material_ingestion',
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).trim(), uncommitted_workspace: true,
  tests: { suites, tests, cumulative: true }, browser, browser_checks: browser.reduce((sum, item) => sum + item.checks, 0),
  deployment: { slug: deployed.slug, status: deployed.status, version: deployed.version, verify_jwt: deployed.verify_jwt },
  migration, installation: installed, pilot: after[0], unchanged_expiry: '2026-09-19T04:48:03.836Z', new_paid_calls: 0,
  actual_cloud_materials_created_by_checks: 0, real_user_session_tested: false, real_pdf_model_quality_tested: false,
  production_frontend_deployed: false, protected_files_unchanged: Object.keys(protectedFiles),
  next_stage: 'integrated_initial_onboarding', remaining_blocks: 4 };
await writeFile(directory + 'materials-release.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
