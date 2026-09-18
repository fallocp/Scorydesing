/** Prepare one additive development migration. No network requests or financial changes. */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const source = 'supabase/migrations/202609180004_desaing_onboarding.sql';
const migration = await readFile(source, 'utf8'); assert(!migration.includes('$desaing_onboarding_migration$'));
const previous = JSON.parse((await readFile('artifacts/desaing-lab/onboarding-install-preflight.json', 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(previous.length, 1); const current = previous[0];
assert.equal(current.business_id, 'a0000000-0000-0000-0000-000000000001');
assert.equal(current.policy_id, 'fai-pilot-5usd-2026-09-17');
assert.equal(current.limit_micro_usd, 5000000); assert.equal(current.max_image_outputs, 4);
for (const key of ['profiles_exist', 'drafts_exist', 'revisions_exist', 'publications_exist', 'migration_recorded']) assert.equal(current[key], false, key);
const sql = `BEGIN;
DO $guard$ BEGIN
 IF to_regclass('public.creative_profiles') IS NOT NULL OR to_regclass('public.desaing_brand_drafts') IS NOT NULL
 OR to_regclass('public.desaing_brand_revisions') IS NOT NULL OR to_regclass('public.desaing_brand_publications') IS NOT NULL
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180004') THEN
 RAISE EXCEPTION 'Unexpected preexisting onboarding installation'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.desaing_policies WHERE business_id='a0000000-0000-0000-0000-000000000001'
 AND policy_id='fai-pilot-5usd-2026-09-17' AND limit_micro_usd=5000000 AND max_image_outputs=4) THEN
 RAISE EXCEPTION 'Development policy differs from authorization'; END IF;
END $guard$;
${migration}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('202609180004','desaing_onboarding',ARRAY[$desaing_onboarding_migration$${migration}$desaing_onboarding_migration$]);
COMMIT;
`;
await writeFile('artifacts/desaing-lab/onboarding-install.sql', sql);
console.log(JSON.stringify({ prepared: true, source, sha256: createHash('sha256').update(migration).digest('hex'), network_calls: 0 }));
