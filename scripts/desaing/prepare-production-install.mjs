/** Prepare the single reviewed additive migration; never calls providers or changes quotas. */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const source = 'supabase/migrations/202609180005_desaing_production.sql';
const migration = await readFile(source, 'utf8'); assert(!migration.includes('$desaing_production_migration$'));
const previous = JSON.parse((await readFile('artifacts/desaing-lab/production-install-preflight.json', 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(previous.length, 1); const current = previous[0];
assert.equal(current.business_id, 'a0000000-0000-0000-0000-000000000001');
assert.equal(current.policy_id, 'fai-pilot-5usd-2026-09-17');
assert.equal(current.limit_micro_usd, 5000000); assert.equal(current.max_image_outputs, 4);
for (const key of ['snapshots_exist', 'receipts_exist', 'migration_recorded']) assert.equal(current[key], false, key);
const sql = `BEGIN;
DO $guard$ BEGIN
 IF to_regclass('public.desaing_production_snapshots') IS NOT NULL OR to_regclass('public.desaing_production_receipts') IS NOT NULL
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='202609180005') THEN
 RAISE EXCEPTION 'Unexpected preexisting production integration'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.desaing_policies WHERE business_id='a0000000-0000-0000-0000-000000000001'
 AND policy_id='fai-pilot-5usd-2026-09-17' AND limit_micro_usd=5000000 AND max_image_outputs=4) THEN
 RAISE EXCEPTION 'Development policy differs from authorization'; END IF;
END $guard$;
${migration}
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('202609180005','desaing_production',ARRAY[$desaing_production_migration$${migration}$desaing_production_migration$]);
COMMIT;
`;
await writeFile('artifacts/desaing-lab/production-install.sql', sql);
console.log(JSON.stringify({ prepared: true, source, sha256: createHash('sha256').update(migration).digest('hex'), network_calls: 0 }));
