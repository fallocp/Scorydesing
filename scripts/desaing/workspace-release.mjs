/** Read-only closure of DAI-17; no user session, generation, migration or policy mutation. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'artifacts/desaing-lab/';
const json = async name => JSON.parse((await readFile(directory + name, 'utf8')).replace(/^\uFEFF/, ''));
const reports = [
  ['workspace', 'workspace-smoke-result.json'],
  ['full_design', 'workspace-full-design-regression.log', 7],
  ['proposals_with_references', 'workspace-proposals-regression.log', 9],
  ['composition', 'workspace-composition-smoke-result.json', 6],
  ['presentations', 'workspace-presentations-regression.log', 19],
];
const browser = [];
for (const [name, file, count] of reports) {
  const report = await json(file);
  assert(report.success === true || report.ok === true, file);
  if (count) assert.equal(report.checks.length, count, file); else assert(report.checks.length >= 9, file);
  assert.equal(report.actual_provider_calls ?? report.provider_calls ?? report.metrics?.real_provider_calls, 0, file);
  browser.push({ name, file, checks: report.checks.length, real_provider_calls: 0 });
}
const unitLog = await readFile(directory + 'workspace-unit-tests.log', 'utf8');
assert.match(unitLog, /49 passed \(49\)/); assert.match(unitLog, /1149 passed \(1149\)/);
const buildLog = await readFile(directory + 'workspace-build.log', 'utf8');
assert.match(buildLog, /built in [0-9.]+s/); assert.doesNotMatch(buildLog, /error TS[0-9]+/);
const before = await json('workspace-remote-before.json'), after = await json('workspace-remote-after.json');
assert.deepEqual(after, before); assert.equal(after[0].revision, 11); assert.equal(after[0].image_jobs, 3);
assert.equal(after[0].image_committed_micro_usd, '3000000'); assert.equal(after[0].text_attempts, 0);
assert.equal(after[0].limit_micro_usd, 5000000); assert.equal(after[0].max_image_outputs, 4);
const deployed = (await json('workspace-deployment-after.json')).find(item => item.slug === 'desaing-server');
assert.equal(deployed.status, 'ACTIVE'); assert.equal(deployed.version, 9); assert.equal(deployed.verify_jwt, true);
const endpoint = await json('workspace-endpoint-checks.json');
assert.equal(endpoint.checks.length, 4); assert(endpoint.checks.every(item => item.passed));
const protectedFiles = {
  'docs/ScoryDesign_Plan_Integracion_Experimental_v2.md': '2428D916DC19AD8D056AC71B2763E5D91EBC62DFF86FE639C9F852FF15A4382E',
  'deno.lock': 'A5649A22D6F860A5DF78B03C600819C61D4DCA6D8DC4DC51116CAB20DD58433E',
  'supabase/migrations/202609170001_desaing_server_foundation.sql': '61B36E173B5303000EB9BB70CBA91509199528FE6E488751306D08C656B9DB8D',
};
for (const [file, expected] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase(), expected, file);
const local = [];
for (const [route, evidence] of [['/free-design', ''], ['/src/pages/FreeDesignPage.tsx', 'FreeDesignWorkspacePage'],
  ['/src/components/presentations/DeckComposerPanel.tsx', 'Crear presentación completa'],
  ['/src/lib/presentations/reviewedPresentationProject.ts', 'saveReviewedPresentation']]) {
  const response = await fetch('http://127.0.0.1:3000' + route, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); const body = await response.text(); assert(body.includes(evidence));
  local.push({ route, status: response.status, current_module: true });
}
await writeFile(directory + 'workspace-local-checks.json', JSON.stringify({ checked_at: new Date().toISOString(), local,
  actual_user_session_tested: false, paid_calls: 0 }, null, 2));
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).trim();
const report = { checked_at: new Date().toISOString(), stage: 'free_design_and_reusable_presentations', branch,
  planned_experiment_branch: 'experimental/desaing', uncommitted_workspace: true,
  tests: { suites: 49, tests: 1149, cumulative: true }, browser, browser_checks: browser.reduce((sum, item) => sum + item.checks, 0),
  deployment: { slug: deployed.slug, status: deployed.status, version: deployed.version, verify_jwt: deployed.verify_jwt },
  pilot: after[0], unchanged_expiry: '2026-09-19T04:48:03.836Z', new_paid_calls: 0,
  real_user_session_tested: false, production_frontend_deployed: false, actual_cloud_projects_created_by_checks: 0,
  free_document_persistence: 'IndexedDB scoped to actor and business, JSON export/import',
  deck_scope: '2-20 reviewed slides sharing one chosen HTML template and exact assets',
  protected_files_unchanged: Object.keys(protectedFiles), next_stage: 'durable_material_ingestion', remaining_blocks: 5 };
await writeFile(directory + 'workspace-release.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
