// Step 8: minimal app check against the LOCAL stack with the local owner (no shared access).
// - password grant with the login file, JWT sub == owner id
// - REST with anon key + user JWT: 3 main tables return as many rows as the DB holds (RLS with auth.uid());
//   the same request with the anon key alone returns 0 rows
// - a private object (desaing-conversation-references) downloads with the user JWT (policies) and not without it
// - public signup stays disabled
// - every rewritten public Storage URL in the DB points to an existing local object
import fs from 'node:fs';
import { ALL_TABLES, LOCAL_API_URL, OWNER_LOGIN_FILE, addSecret, decodeJwtPayload, fetchRetry, localKeys, localSql, log, opsPath, owner, readJson, rows, sha256, sqlIdent, sqlLiteral, writeJson } from './common.mjs';
import { localCatalog } from './catalog.mjs';

const own = owner();
const { anon } = localKeys();
const text = fs.readFileSync(OWNER_LOGIN_FILE, 'utf8');
const email = text.match(/^email=(.+)$/m)[1].trim();
const password = text.match(/^password=(.+)$/m)[1].trim();
addSecret(password);

const tok = await fetchRetry(`${LOCAL_API_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
const session = await tok.json();
const jwt = session.access_token;
addSecret(jwt, session.refresh_token);
const result = { finished: new Date().toISOString(), login_status: tok.status, jwt_sub_equals_owner: tok.status === 200 && decodeJwtPayload(jwt).sub === own.id, rest: [], storage: {}, signup_disabled: null };

async function restCount(table, headers) {
  const res = await fetchRetry(`${LOCAL_API_URL}/rest/v1/${table}?select=*`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
  await res.arrayBuffer();
  const range = res.headers.get('content-range') ?? '';
  return { status: res.status, count: Number(range.split('/')[1] ?? NaN) };
}
for (const table of ['design_mockups', 'design_pieces', 'presentations']) {
  const db = Number((await localSql(`SELECT count(*) FROM public.${sqlIdent(table)};`)).trim());
  const user = await restCount(table, { apikey: anon, Authorization: `Bearer ${jwt}` });
  const anonOnly = await restCount(table, { apikey: anon });
  result.rest.push({ table, db_rows: db, user_status: user.status, user_rows: user.count, anon_rows: anonOnly.count, ok: user.status < 300 && user.count === db && anonOnly.count === 0 });
}

const manifest = readJson(opsPath('storage-manifest.json'), { objects: {} });
const name = (await localSql("SELECT name FROM storage.objects WHERE bucket_id = 'desaing-conversation-references' ORDER BY name COLLATE \"C\" LIMIT 1;")).trim();
if (name) {
  const url = `${LOCAL_API_URL}/storage/v1/object/authenticated/desaing-conversation-references/${name.split('/').map(encodeURIComponent).join('/')}`;
  const withJwt = await fetchRetry(url, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } });
  const buf = Buffer.from(await withJwt.arrayBuffer());
  const withoutJwt = await fetchRetry(url, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  await withoutJwt.arrayBuffer();
  result.storage = {
    bucket: 'desaing-conversation-references', user_status: withJwt.status,
    sha256_equals_source: sha256(buf) === manifest.objects[`desaing-conversation-references/${name}`]?.sha256,
    anon_status: withoutJwt.status,
  };
  result.storage.ok = withJwt.status === 200 && result.storage.sha256_equals_source && withoutJwt.status >= 400;
}

const signup = await fetchRetry(`${LOCAL_API_URL}/auth/v1/signup`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `smoke-${Date.now()}@example.invalid`, password: 'Smoke-test-123456' }) });
result.signup_disabled = signup.status >= 400 ? { status: signup.status, code: (await signup.json()).error_code } : false;

// Every rewritten public URL resolves to an existing local object.
const catalog = await localCatalog();
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const urlRe = `${reEsc(LOCAL_API_URL)}/storage/v1/object/public/([^/"'\\\\\\s<>)?]+)/([^"'\\\\\\s<>)?]+)`;
const cols = ALL_TABLES.flatMap((t) => catalog[t].columns.filter((c) => /^(text|character varying|json|jsonb|text\[\])$/.test(c.type)).map((c) => [t, c.col]));
const q = cols.map(([t, c]) => `SELECT m[1], m[2] FROM public.${sqlIdent(t)} x, regexp_matches(x.${sqlIdent(c)}::text, ${sqlLiteral(urlRe)}, 'g') m`).join(' UNION ALL\n');
const refs = rows(await localSql(`SELECT b, p, count(*) FROM (${q}) z(b, p) GROUP BY 1, 2;`));
const objects = new Set(rows(await localSql('SELECT bucket_id, name FROM storage.objects;')).map(([b, n]) => `${b}/${n}`));
const missing = refs.filter(([b, p]) => { let d = p; try { d = decodeURIComponent(p); } catch { /* keep raw */ } return !objects.has(`${b}/${d}`); });
result.url_targets = { distinct_paths: refs.length, occurrences: refs.reduce((a, r) => a + Number(r[2]), 0), missing_paths: missing.length, missing_occurrences: missing.reduce((a, r) => a + Number(r[2]), 0) };

writeJson(opsPath('app-smoke-report.json'), result);
log('app smoke', result);
const ok = result.login_status === 200 && result.jwt_sub_equals_owner && result.rest.every((r) => r.ok) && result.storage.ok && result.signup_disabled;
if (!ok) process.exit(1);
