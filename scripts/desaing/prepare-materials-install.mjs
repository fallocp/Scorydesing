/** Prepare the exact additive migration for the already-authorized development project; no network I/O. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const file = 'supabase/migrations/202609180003_desaing_materials.sql';
const migration = await readFile(file, 'utf8');
assert(!migration.includes('$desaing_materials_migration$'));
const preflight = JSON.parse((await readFile('artifacts/desaing-lab/materials-install-preflight.json', 'utf8')).replace(/^\uFEFF/, ''));
assert.equal(preflight.length, 1);
const current = preflight[0];
assert.equal(current.business_id, 'a0000000-0000-0000-0000-000000000001');
assert.equal(current.policy_id, 'fai-pilot-5usd-2026-09-17');
assert.equal(current.limit_micro_usd, 5000000); assert.equal(current.max_image_outputs, 4);
assert.equal(current.catalog_exists, false); assert.equal(current.revisions_exist, false); assert.equal(current.bucket, null); assert.equal(current.migration_recorded, false);
const sql = `BEGIN;
DO $guard$ BEGIN
 IF to_regclass('public.desaing_material_collections') IS NOT NULL
 OR to_regclass('public.desaing_material_revisions') IS NOT NULL
 OR EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'desaing-materials')
 OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '202609180003') THEN
 RAISE EXCEPTION 'Unexpected preexisting materials installation'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.desaing_policies WHERE business_id = 'a0000000-0000-0000-0000-000000000001'
 AND policy_id = 'fai-pilot-5usd-2026-09-17' AND limit_micro_usd = 5000000 AND max_image_outputs = 4) THEN
 RAISE EXCEPTION 'Development pilot policy differs from authorization'; END IF;
END $guard$;
${migration}
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('202609180003', 'desaing_materials', ARRAY[$desaing_materials_migration$${migration}$desaing_materials_migration$]);
COMMIT;
`;
await writeFile('artifacts/desaing-lab/materials-install.sql', sql);
console.log(JSON.stringify({ prepared: true, source: file, sha256: createHash('sha256').update(migration).digest('hex'), network_calls: 0 }));
