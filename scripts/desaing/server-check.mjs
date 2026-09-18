/** Read-only deployment probes. Uses the application's public key only;
 * never reads a user session, administrative pilot token or provider key. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expectedOrigin = 'https://gdfhytvjnzdovjfovqfv.supabase.co';
const env = await readFile(path.join(root, '.env'), 'utf8');
function publicSetting(name) {
  const lines = env.split(/\r?\n/).map(line => line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
    .filter(match => match?.[1] === name);
  assert.equal(lines.length, 1, 'Required public app configuration is missing or duplicated.');
  return lines[0][2].replace(/^(['"])(.*)\1$/, '$2');
}
assert.equal(publicSetting('VITE_SUPABASE_URL'), expectedOrigin, 'Unexpected development project.');
const publicKey = publicSetting('VITE_SUPABASE_ANON_KEY');
const endpoint = `${expectedOrigin}/functions/v1/desaing-server`;
const exploration = process.argv.includes('--exploration');
const html = process.argv.includes('--html');
const workspace = process.argv.includes('--workspace');
const materials = process.argv.includes('--materials');
const onboarding = process.argv.includes('--onboarding');
const production = process.argv.includes('--production');
const promptAdmin = process.argv.includes('--prompt-admin');
const origin = 'http://127.0.0.1:3000';
const checks = [];
async function probe(name, expectedStatus, options, expectedCors = null, route = '') {
  const response = await fetch(`${endpoint}${route}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
  const cors = response.headers.get('access-control-allow-origin');
  await response.body?.cancel();
  checks.push({ name, status: response.status, cors, passed: response.status === expectedStatus && cors === expectedCors });
  assert.equal(response.status, expectedStatus, `${name}: unexpected HTTP status`);
  assert.equal(cors, expectedCors, `${name}: unexpected CORS origin`);
}
const body = JSON.stringify({ business_id: 'a0000000-0000-0000-0000-000000000001', command: { kind: 'read' } });
for (const route of promptAdmin ? ['/prompt-admin/capabilities', '/prompt-admin/read', '/prompt-admin/save', '/prompt-admin/discard', '/prompt-admin/test', '/prompt-admin/review', '/prompt-admin/publish', '/prompt-admin/revert', '/prompt-admin/recover'] : production ? ['/production/prepare', '/production/read', '/production/apply', '/production/recover'] : onboarding ? ['/onboarding/read', '/onboarding/save', '/onboarding/publish', '/onboarding/recover'] : materials ? ['/materials/read', '/materials/upload', '/materials/save', '/materials/analyze', '/materials/recover', '/materials/history', '/materials/capabilities', '/materials/source'] : html ? ['/html/plan', '/html/recover', '/html/history', '/html/capabilities', '/html/import'] : exploration ? ['/exploration/plan', '/exploration/recover', '/exploration/history', '/exploration/capabilities'] : ['']) {
  await probe(`${route}:allowed_local_preflight`, 204, { method: 'OPTIONS', headers: { origin,
    'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,apikey,content-type' } }, origin, route);
  await probe(`${route}:foreign_preflight_rejected`, 403, { method: 'OPTIONS', headers: { origin: 'https://foreign.invalid' } }, null, route);
  // The Supabase JWT gateway returns its own CORS header before our handler runs.
  await probe(`${route}:missing_session_rejected`, 401, { method: 'POST', headers: { 'content-type': 'application/json' }, body }, '*', route);
  await probe(`${route}:public_key_is_not_a_user_session`, 401, { method: 'POST', headers: { origin,
    'content-type': 'application/json', apikey: publicKey, authorization: `Bearer ${publicKey}` }, body }, origin, route);
}
const report = { checked_at: new Date().toISOString(), endpoint, checks, real_user_session_tested: false,
  provider_calls: 0, generation_requests: 0 };
const directory = path.join(root, 'artifacts/desaing-lab');
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, promptAdmin ? 'prompt-admin-endpoint-checks.json' : production ? 'production-endpoint-checks.json' : onboarding ? 'onboarding-endpoint-checks.json' : materials ? 'materials-endpoint-checks.json' : workspace ? 'workspace-endpoint-checks.json' : html ? 'composition-endpoint-checks.json' : exploration ? 'exploration-server-endpoint-checks.json' : 'server-generation-endpoint-checks.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
