/** Prepare only the reviewed additive migration plus the user's explicit management grant. */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const source = 'supabase/migrations/202609180006_desaing_prompt_admin.sql';
const migration = await readFile(source, 'utf8'); assert(!migration.includes('$prompt_admin_migration$'));
const prior = JSON.parse((await readFile('artifacts/desaing-lab/prompt-admin-install-preflight.json', 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(prior.length, 1); const row = prior[0];
assert.equal(row.business_id, 'a0000000-0000-0000-0000-000000000001');
assert.equal(row.policy_id, 'fai-pilot-5usd-2026-09-17'); assert.equal(row.limit_micro_usd, 5000000); assert.equal(row.max_image_outputs, 4);
for (const key of ['actor_exists', 'actor_admin']) assert.equal(row[key], true);
for (const key of ['scopes_exist', 'migration_recorded']) assert.equal(row[key], false);
assert.equal(row.duplicate_versions, 0);
const sql = `BEGIN;
DO $guard$ BEGIN
 IF to_regclass('public.desaing_prompt_admin_scopes') IS NOT NULL
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180006') THEN
 RAISE EXCEPTION 'Unexpected preexisting prompt governance'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.desaing_policies WHERE business_id='a0000000-0000-0000-0000-000000000001'
 AND policy_id='fai-pilot-5usd-2026-09-17' AND limit_micro_usd=5000000 AND max_image_outputs=4) THEN
 RAISE EXCEPTION 'Development policy differs from authorization'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_business_memberships WHERE business_id='a0000000-0000-0000-0000-000000000001'
 AND user_id='0274bd51-1858-4893-8561-a9c99000feb7' AND role IN ('owner','admin')) THEN
 RAISE EXCEPTION 'Authorized administrator missing'; END IF;
END $guard$;
${migration}
INSERT INTO public.desaing_prompt_admin_scopes(business_id) VALUES('a0000000-0000-0000-0000-000000000001');
INSERT INTO public.desaing_prompt_admin_grants(business_id,actor_id,capability)
VALUES('a0000000-0000-0000-0000-000000000001','0274bd51-1858-4893-8561-a9c99000feb7','prompt_master.manage');
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('202609180006','desaing_prompt_admin',ARRAY[$prompt_admin_migration$${migration}$prompt_admin_migration$]);
COMMIT;
`;
await writeFile('artifacts/desaing-lab/prompt-admin-install.sql', sql);
console.log(JSON.stringify({ prepared: true, source, sha256: createHash('sha256').update(migration).digest('hex'),
  granted_actor: '0274bd51-1858-4893-8561-a9c99000feb7', granted_business: row.business_id, capability: 'prompt_master.manage', network_calls: 0 }));
