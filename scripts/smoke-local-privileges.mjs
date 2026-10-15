// Privilege smoke of the LOCAL Supabase (Phase 8). Node 22, no dependencies. Run with: npm run smoke:local
// Reads nothing from the shared project. Local keys come from `supabase status -o json` and stay in memory;
// the owner login comes from SCORY_LOCAL_OWNER_LOGIN_FILE (outside the repo). Output is redacted.
// Checks (fail = exit 1):
//   - anon without a JWT reads 0 rows (or gets 401/403) from the main in-scope tables; the owner JWT reads them
//   - anon cannot list or upload in the private buckets, nor upload in the public ones
//   - public buckets (design-images, Brand) serve a public GET without headers
//   - the owner JWT reads private objects exactly as the storage.objects policies allow (API == SQL as the user)
//   - public signup is rejected
//   - no remote link in supabase/.temp
//   - 0 hosted Supabase hosts in the local DB (text/json columns of the 62 tables, storage.objects, auth.users)
//     and 0 in tracked files changed since the branch base (older tracked files are listed, not failed)
//   - stack ports published only inside 55320-55329 and the Firewall rule enabled
// Inherited parity (reported as backlog, never fails): ALL grants to anon, SECURITY DEFINER with EXECUTE PUBLIC,
// design-images policies, other tables anon can read.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_TABLES, LOCAL_API_URL, OWNER_LOGIN_FILE, REPO_ROOT, SHARED_REF_FILE, addSecret, decodeJwtPayload, localKeys, redact, sqlIdent, sqlLiteral } from './shared-migration/common.mjs';

const DB = process.env.SCORY_LOCAL_DB_CONTAINER ?? 'supabase_db_scorydesign';
const BASE_COMMIT = process.env.SCORY_BRANCH_BASE ?? '0b82927';
const FIREWALL_RULE = 'scorydesign - Supabase local only';
const MAIN_TABLES = ['business_tenants', 'user_business_memberships', 'profiles', 'design_mockups', 'design_pieces', 'presentations', 'design_library', 'image_library', 'content_library', 'copy_bank_items', 'design_campaigns', 'news_editions', 'desaing_audit', 'desaing_explorations', 'desaing_state', 'commercial_branches'];
const PRIVATE_BUCKETS = ['desaing-assets', 'desaing-conversation-references', 'desaing-materials', 'brand-assets'];
const PUBLIC_BUCKETS = ['design-images', 'Brand'];
const HOSTED = /[a-z0-9]{20}\.supabase\.co/gi;
// 1x1 transparent PNG (allowed MIME in every private bucket, so a rejection comes from the policies).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const checks = [];
const backlog = [];
const check = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail }); console.log(redact(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`)); };
const note = (name, detail) => { backlog.push({ name, detail }); console.log(redact(`BACKLOG ${name} ${JSON.stringify(detail)}`)); };

function psql(sql) {
  const r = spawnSync('docker', ['exec', '-i', DB, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-F', '\t'], { input: sql, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(redact(`psql failed: ${(r.stderr || r.error?.message || '').trim()}`));
  return r.stdout.split('\n').filter((l) => l.length > 0).map((l) => l.split('\t'));
}
// SQL evaluated with the owner's RLS context (same claims PostgREST/Storage set from the JWT).
const asUser = (sub, sql) => psql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = ${sqlLiteral(JSON.stringify({ sub, role: 'authenticated' }))};\n${sql}\nROLLBACK;`);

async function http(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, body, text: () => body.toString('utf8') };
}
const objectPath = (name) => name.split('/').map(encodeURIComponent).join('/');

// --- Preconditions -----------------------------------------------------------
const running = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', DB], { encoding: 'utf8' });
if (running.status !== 0 || running.stdout.trim() !== 'true') {
  console.error(`${DB} is not running (open Docker Desktop and run npm run supabase:start).`);
  process.exit(1);
}
const { anon, service } = localKeys();
const login = fs.readFileSync(OWNER_LOGIN_FILE, 'utf8');
const email = login.match(/^email=(.+)$/m)?.[1].trim();
const password = login.match(/^password=(.+)$/m)?.[1].trim();
addSecret(email, password);
const tokenRes = await http(`${LOCAL_API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
const session = tokenRes.status === 200 ? JSON.parse(tokenRes.text()) : {};
const jwt = session.access_token;
addSecret(jwt, session.refresh_token);
check('owner password login', tokenRes.status === 200 && jwt, { status: tokenRes.status });
if (!jwt) process.exit(1);
const sub = decodeJwtPayload(jwt).sub;
addSecret(sub);
const anonHeaders = { apikey: anon };
const userHeaders = { apikey: anon, Authorization: `Bearer ${jwt}` };

// --- Tables ------------------------------------------------------------------
async function restCount(table, headers) {
  const r = await http(`${LOCAL_API_URL}/rest/v1/${table}?select=*`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
  return { status: r.status, rows: Number((r.headers.get('content-range') ?? '').split('/')[1] ?? NaN) };
}
const dbRows = Object.fromEntries(psql(ALL_TABLES.map((t) => `SELECT ${sqlLiteral(t)}, count(*) FROM public.${sqlIdent(t)};`).join('\n')).map(([t, n]) => [t, Number(n)]));
// Server-only tables (no SELECT grant for authenticated, read by Edge Functions with the service role).
const serverOnly = new Set(psql(ALL_TABLES.map((t) => `SELECT ${sqlLiteral(t)} WHERE NOT has_table_privilege('authenticated', ${sqlLiteral(`public.${t}`)}, 'SELECT');`).join('\n')).map(([t]) => t));
const anonReadable = [];
for (const table of ALL_TABLES) {
  const anonOnly = await restCount(table, anonHeaders);
  const blocked = anonOnly.status === 401 || anonOnly.status === 403 || (anonOnly.status < 300 && anonOnly.rows === 0);
  if (MAIN_TABLES.includes(table)) {
    const user = await restCount(table, userHeaders);
    const detail = { db: dbRows[table], anon: anonOnly.status < 300 ? anonOnly.rows : anonOnly.status, owner: user.status < 300 ? user.rows : user.status };
    if (serverOnly.has(table)) check(`table ${table} (server-only): anon and owner blocked`, blocked && (user.status === 401 || user.status === 403), detail);
    else check(`table ${table}: anon blocked, owner reads`, blocked && user.status < 300 && (dbRows[table] === 0 || user.rows > 0), detail);
  } else if (!blocked) anonReadable.push({ table, rows: anonOnly.rows });
}
if (anonReadable.length) note('tables anon can read (RLS USING true / public policies, inherited parity)', anonReadable);

// --- Storage -----------------------------------------------------------------
for (const bucket of PRIVATE_BUCKETS) {
  const list = await http(`${LOCAL_API_URL}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...anonHeaders, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 100 }) });
  const listed = list.status < 300 ? JSON.parse(list.text()).length : 0;
  check(`bucket ${bucket}: anon cannot list`, list.status >= 400 || listed === 0, { status: list.status, listed });
}
for (const bucket of [...PRIVATE_BUCKETS, ...PUBLIC_BUCKETS]) {
  const probe = `smoke-local-privileges/${Date.now()}.png`;
  const up = await http(`${LOCAL_API_URL}/storage/v1/object/${bucket}/${probe}`, { method: 'POST', headers: { ...anonHeaders, Authorization: `Bearer ${anon}`, 'Content-Type': 'image/png' }, body: PNG });
  let cleaned;
  if (up.status < 300) {
    // Should never happen; remove the probe so the smoke leaves no data behind.
    const del = await http(`${LOCAL_API_URL}/storage/v1/object/${bucket}/${probe}`, { method: 'DELETE', headers: { apikey: service, Authorization: `Bearer ${service}` } });
    cleaned = del.status;
  }
  check(`bucket ${bucket}: anon cannot upload`, up.status >= 400, { status: up.status, ...(cleaned ? { probe_deleted_status: cleaned } : {}) });
}
for (const bucket of PUBLIC_BUCKETS) {
  const [row] = psql(`SELECT name, (metadata->>'size')::bigint FROM storage.objects WHERE bucket_id = ${sqlLiteral(bucket)} AND (metadata->>'size')::bigint > 0 ORDER BY 2, name COLLATE "C" LIMIT 1;`);
  if (!row) { check(`bucket ${bucket}: public GET`, false, 'no objects'); continue; }
  const res = await http(`${LOCAL_API_URL}/storage/v1/object/public/${bucket}/${objectPath(row[0])}`);
  check(`bucket ${bucket}: public GET without headers`, res.status === 200 && res.body.length === Number(row[1]), { status: res.status, bytes: res.body.length, expected_bytes: Number(row[1]) });
}
for (const bucket of PRIVATE_BUCKETS) {
  const all = psql(`SELECT name FROM storage.objects WHERE bucket_id = ${sqlLiteral(bucket)} ORDER BY name COLLATE "C";`).map(([n]) => n);
  const visible = new Set(asUser(sub, `SELECT name FROM storage.objects WHERE bucket_id = ${sqlLiteral(bucket)};`).map(([n]) => n));
  const allowed = all.find((n) => visible.has(n));
  const denied = all.find((n) => !visible.has(n));
  const detail = { objects: all.length, visible_by_policy: visible.size };
  let ok = true;
  if (allowed) {
    const u = await http(`${LOCAL_API_URL}/storage/v1/object/authenticated/${bucket}/${objectPath(allowed)}`, { headers: userHeaders });
    const a = await http(`${LOCAL_API_URL}/storage/v1/object/authenticated/${bucket}/${objectPath(allowed)}`, { headers: { ...anonHeaders, Authorization: `Bearer ${anon}` } });
    Object.assign(detail, { owner_get_allowed: u.status, anon_get_same: a.status });
    ok &&= u.status === 200 && a.status >= 400;
  }
  if (denied) {
    const u = await http(`${LOCAL_API_URL}/storage/v1/object/authenticated/${bucket}/${objectPath(denied)}`, { headers: userHeaders });
    detail.owner_get_denied = u.status;
    ok &&= u.status >= 400;
  }
  check(`bucket ${bucket}: owner access matches policies`, ok, detail);
}

// --- Auth --------------------------------------------------------------------
const signup = await http(`${LOCAL_API_URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `smoke-${Date.now()}@example.invalid`, password: randomBytes(18).toString('base64url') }) });
let signupCode;
try { signupCode = JSON.parse(signup.text()).error_code; } catch { signupCode = null; }
check('public signup rejected', signup.status >= 400, { status: signup.status, code: signupCode });

// --- Remote link -------------------------------------------------------------
const temp = path.join(REPO_ROOT, 'supabase', '.temp');
const linked = ['project-ref', 'linked-project.json'].filter((f) => fs.existsSync(path.join(temp, f)));
check('no remote link in supabase/.temp', linked.length === 0, { found: linked });

// --- Hosted Supabase host: local DB and tracked files -------------------------
const sharedRef = fs.existsSync(SHARED_REF_FILE) ? fs.readFileSync(SHARED_REF_FILE, 'utf8').trim() : null;
addSecret(sharedRef);
const pattern = sharedRef ? `(${sharedRef}|[a-z0-9]{20}\\.supabase\\.co)` : '[a-z0-9]{20}\\.supabase\\.co';
const cols = psql(`SELECT c.table_schema, c.table_name, c.column_name FROM information_schema.columns c
  WHERE ((c.table_schema = 'public' AND c.table_name IN (${ALL_TABLES.map(sqlLiteral).join(',')}))
      OR (c.table_schema = 'storage' AND c.table_name = 'objects') OR (c.table_schema = 'auth' AND c.table_name = 'users'))
    AND c.data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY');`);
const dbHits = psql(`SELECT coalesce(sum(n), 0) FROM (${cols.map(([s, t, c]) => `SELECT (SELECT count(*) FROM regexp_matches(x.${sqlIdent(c)}::text, ${sqlLiteral(pattern)}, 'gi')) n FROM ${sqlIdent(s)}.${sqlIdent(t)} x`).join(' UNION ALL\n')}) z;`)[0][0];
check('0 hosted Supabase hosts in the local DB', Number(dbHits) === 0, { columns_scanned: cols.length, occurrences: Number(dbHits) });

const git = (args) => spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout;
const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
const changed = new Set([...git(['diff', '--name-only', `${BASE_COMMIT}`]).split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).split('\n')].filter(Boolean));
const fileHits = [];
for (const file of new Set([...tracked, ...changed])) {
  const full = path.join(REPO_ROOT, file);
  let text;
  try { if (fs.statSync(full).size > 30 * 1024 * 1024) continue; text = fs.readFileSync(full, 'latin1'); } catch { continue; }
  const n = (sharedRef ? text.split(sharedRef).length - 1 : 0) + (text.match(HOSTED) ?? []).length;
  if (n > 0) fileHits.push({ file, occurrences: n, changed_on_branch: changed.has(file) });
}
const newHits = fileHits.filter((h) => h.changed_on_branch);
check(`0 hosted Supabase hosts in files changed since ${BASE_COMMIT}`, newHits.length === 0, { files: newHits.map((h) => h.file) });
if (fileHits.length > newHits.length) note(`tracked files older than the branch that still name the shared host (scripts/docs of the shared project)`, fileHits.filter((h) => !h.changed_on_branch).map((h) => h.file));

// --- Ports and Firewall --------------------------------------------------------
const ports = spawnSync('docker', ['ps', '--filter', 'name=_scorydesign', '--format', '{{.Names}}\t{{.Ports}}'], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
const published = ports.flatMap((l) => [...l.matchAll(/:(\d+)->/g)].map((m) => Number(m[1])));
check('stack ports only in 55320-55329', published.length > 0 && published.every((p) => p >= 55320 && p <= 55329), { containers: ports.length, published: [...new Set(published)].sort() });
const fw = spawnSync('powershell.exe', ['-NoProfile', '-Command', `$r = Get-NetFirewallRule -DisplayName '${FIREWALL_RULE}' -ErrorAction Stop; $p = $r | Get-NetFirewallPortFilter; [pscustomobject]@{ Enabled = [string]$r.Enabled; Action = [string]$r.Action; Direction = [string]$r.Direction; Protocol = [string]$p.Protocol; LocalPort = ($p.LocalPort -join ',') } | ConvertTo-Json -Compress`], { encoding: 'utf8' });
let rule = null;
try { rule = JSON.parse(fw.stdout.trim()); } catch { rule = null; }
check(`Firewall rule '${FIREWALL_RULE}' enabled`, rule?.Enabled === 'True' && rule.Action === 'Block' && rule.Direction === 'Inbound' && rule.LocalPort === '55320-55329', rule ?? { error: (fw.stderr || '').trim().slice(0, 200) });

// --- Inherited parity (backlog, not fixed here) ---------------------------------
const anonAll = psql(`SELECT count(*) FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
  AND c.relname IN (${ALL_TABLES.map(sqlLiteral).join(',')})
  AND has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`)[0][0];
note('ALL grants to anon on in-scope tables (protected only by RLS)', { tables: Number(anonAll) });
const definer = psql(`SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')
  ORDER BY 1;`).map(([f]) => f);
note('SECURITY DEFINER functions in public with EXECUTE to PUBLIC', definer);
const imagePolicies = psql(`SELECT policyname, cmd, array_to_string(roles, ',') FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('Public read access for design images', 'Authenticated users can upload design images', 'Authenticated users can delete design images') ORDER BY 1;`)
  .map(([name, cmd, roles]) => ({ name, cmd, roles }));
note('design-images policies replicated by parity (any authenticated uploads/deletes; public read)', imagePolicies);

const failed = checks.filter((c) => !c.ok);
console.log(redact(`\n${checks.length - failed.length}/${checks.length} checks OK; ${backlog.length} backlog items (inherited parity).`));
if (process.env.SMOKE_REPORT_FILE) fs.writeFileSync(process.env.SMOKE_REPORT_FILE, redact(JSON.stringify({ finished: new Date().toISOString(), checks, backlog }, null, 2)));
if (failed.length) process.exit(1);
