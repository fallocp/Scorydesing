// Step 1 (ADR-0004): create the single local user with the SAME UUID as the owner in the shared Auth.
// Reads (read-only) id, email, email_confirmed_at, raw_user_meta_data and raw_app_meta_data of the owner.
// Creates the user through the LOCAL Auth Admin API with a new random password, written only to
// SCORY_LOCAL_OWNER_LOGIN_FILE (outside the repo). Idempotent: an existing local user with the same id is kept.
import { randomInt } from 'node:crypto';
import fs from 'node:fs';
import {
  LOCAL_API_URL, OWNER_LOGIN_FILE, addSecret, decodeJwtPayload, fail, fetchRetry, localKeys, localSql, log, opsPath,
  rows, sharedSql, writeJson,
} from './common.mjs';

const out = rows(await sharedSql(`
SELECT u.id, u.email, COALESCE(u.email_confirmed_at::text, ''), COALESCE(u.raw_user_meta_data::text, '{}'), COALESCE(u.raw_app_meta_data::text, '{}')
  FROM auth.users u
 WHERE u.id IN (SELECT m.user_id FROM public.user_business_memberships m WHERE m.role = 'owner');`));
if (out.length !== 1) fail(`expected exactly 1 owner in the shared project, found ${out.length}`);
const [id, email, emailConfirmedAt, userMeta, appMeta] = out[0];
addSecret(id, email);
const app = JSON.parse(appMeta);
const ownerInfo = { id, email, email_confirmed_at: emailConfirmedAt || null, user_metadata: JSON.parse(userMeta), app_metadata_active_business: app.active_business_id ?? null };
writeJson(opsPath('owner.json'), ownerInfo);
log('owner read from shared (id and email kept in owner.json, outside the repo)');

const { service, anon } = localKeys();
const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };

// Password: reuse the one already written, otherwise a new 32-char alphanumeric one.
let login = null;
if (fs.existsSync(OWNER_LOGIN_FILE)) {
  const text = fs.readFileSync(OWNER_LOGIN_FILE, 'utf8');
  const pw = text.match(/^password=(.+)$/m)?.[1]?.trim();
  if (pw) login = { email, password: pw };
}
if (!login) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const password = Array.from({ length: 32 }, () => alphabet[randomInt(alphabet.length)]).join('');
  login = { email, password };
}
addSecret(login.password);

const existing = await fetchRetry(`${LOCAL_API_URL}/auth/v1/admin/users/${id}`, { headers: adminHeaders });
if (existing.status === 200) {
  const u = await existing.json();
  if (u.id !== id) fail('local user id mismatch');
  // Keep the user; make sure the password matches the login file.
  const upd = await fetchRetry(`${LOCAL_API_URL}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password: login.password }) });
  if (upd.status !== 200) fail(`could not set local password: HTTP ${upd.status} ${await upd.text()}`);
  log('local user already existed with the same id; password synced with the login file');
} else {
  const body = {
    id,
    email,
    password: login.password,
    email_confirm: true,
    user_metadata: ownerInfo.user_metadata,
    ...(ownerInfo.app_metadata_active_business ? { app_metadata: { active_business_id: ownerInfo.app_metadata_active_business } } : {}),
  };
  const res = await fetchRetry(`${LOCAL_API_URL}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify(body) });
  const text = await res.text();
  if (res.status !== 200 && res.status !== 201) fail(`admin create user failed: HTTP ${res.status} ${text}`);
  const created = JSON.parse(text);
  if (created.id !== id) fail('local user created with a different id');
  log('local user created with the same id');
}
fs.writeFileSync(OWNER_LOGIN_FILE, `# ScoryDesign local Supabase owner login (ADR-0004). Local only; not the shared password.\nemail=${login.email}\npassword=${login.password}\n`);

// Verify: same id in the DB, password grant 200, JWT sub == id.
const localId = (await localSql(`SELECT id FROM auth.users WHERE id = '${id}'::uuid;`)).trim();
const users = Number((await localSql('SELECT count(*) FROM auth.users;')).trim());
const tok = await fetchRetry(`${LOCAL_API_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: login.email, password: login.password }),
});
const tokBody = await tok.json();
const sub = tok.status === 200 ? decodeJwtPayload(tokBody.access_token).sub : null;
const result = { local_id_equals_source: localId === id, local_users: users, password_grant_status: tok.status, jwt_sub_equals_id: sub === id, checked_at: new Date().toISOString() };
writeJson(opsPath('owner-check.json'), result);
log('owner check', result);
if (!result.local_id_equals_source || tok.status !== 200 || !result.jwt_sub_equals_id) process.exit(1);
