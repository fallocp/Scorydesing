/** Read-only closure: no auth session, paid requests, migrations or policy changes. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const directory = 'artifacts/desaing-lab/';
const json = async name => JSON.parse((await readFile(directory + name, 'utf8')).replace(/^\uFEFF/, ''));
const reports = [
  ['full_design', 'full-design-smoke-result.json', 7], ['composition', 'composition-smoke-result.json', 6],
  ['generation', 'composition-generation-regression.log', 8], ['exploration', 'composition-exploration-regression.log', 8],
  ['proposals_with_references', 'composition-proposals-regression.log', 9], ['presentations', 'composition-presentations-regression.log', 19],
];
const browser = [];
for (const [name, file, count] of reports) {
  const report = await json(file);
  assert(report.success === true || report.ok === true, file); assert.equal(report.checks.length, count, file);
  assert.equal(report.actual_provider_calls ?? report.provider_calls ?? report.metrics?.real_provider_calls, 0, file);
  browser.push({ name, file, checks: count, real_provider_calls: 0 });
}
const unitLog = await readFile(directory + 'composition-unit-tests.log', 'utf8');
assert.match(unitLog, /44 passed \(44\)/); assert.match(unitLog, /1085 passed \(1085\)/);
const buildLog = await readFile(directory + 'composition-build.log', 'utf8');
assert.match(buildLog, /built in [0-9.]+s/); assert.doesNotMatch(buildLog, /error TS[0-9]+/);
const before = await json('composition-remote-before.json'), after = await json('composition-remote-after.json');
assert.deepEqual(after, before); assert.equal(after[0].revision, 11); assert.equal(after[0].image_jobs, 3);
assert.equal(after[0].image_committed_micro_usd, '3000000'); assert.equal(after[0].text_attempts, 0);
assert.equal(after[0].limit_micro_usd, 5000000); assert.equal(after[0].max_image_outputs, 4);
const deployed = (await json('composition-deployment-after.json')).find(item => item.slug === 'desaing-server');
assert.equal(deployed.status, 'ACTIVE'); assert.equal(deployed.version, 8); assert.equal(deployed.verify_jwt, true);
const endpoint = await json('composition-endpoint-checks.json');
assert.equal(endpoint.checks.length, 20); assert(endpoint.checks.every(item => item.passed));
const protectedFiles = {
  'docs/ScoryDesign_Plan_Integracion_Experimental_v2.md': '2428D916DC19AD8D056AC71B2763E5D91EBC62DFF86FE639C9F852FF15A4382E',
  'deno.lock': 'A5649A22D6F860A5DF78B03C600819C61D4DCA6D8DC4DC51116CAB20DD58433E',
  'supabase/migrations/202609170001_desaing_server_foundation.sql': '61B36E173B5303000EB9BB70CBA91509199528FE6E488751306D08C656B9DB8D',
};
for (const [file, expected] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase(), expected, file);
const local = [];
for (const [route, evidence] of [['/presentations', ''], ['/src/components/presentations/ServerDesignPanel.tsx', 'full_design'],
  ['/src/components/presentations/DesignToHtmlPanel.tsx', 'renderHtmlComposition'],
  ['/src/lib/desaing/serverClient.ts', '/html/']]) {
  const response = await fetch('http://127.0.0.1:3000' + route, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200); const body = await response.text(); assert(body.includes(evidence));
  local.push({ route, status: response.status, current_module: true });
}
await writeFile(directory + 'composition-local-checks.json', JSON.stringify({ checked_at: new Date().toISOString(), local,
  actual_user_session_tested: false, paid_calls: 0 }, null, 2));
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', windowsHide: true }).trim();
const report = { checked_at: new Date().toISOString(), stage: 'full_visual_design_to_editable_html', branch,
  planned_experiment_branch: 'experimental/desaing', uncommitted_workspace: true,
  tests: { suites: 44, tests: 1085, cumulative: true }, browser, browser_checks: browser.reduce((sum, item) => sum + item.checks, 0),
  deployment: { slug: deployed.slug, status: deployed.status, version: deployed.version, verify_jwt: deployed.verify_jwt },
  pilot: after[0], unchanged_expiry: '2026-09-19T04:48:03.836Z', new_paid_calls: 0,
  real_user_session_tested: false, production_frontend_deployed: false, protected_files_unchanged: Object.keys(protectedFiles),
  next_stage: 'free_design_and_full_presentations', remaining_blocks: 6 };
await writeFile(directory + 'composition-release.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
