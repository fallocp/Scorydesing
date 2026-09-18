# Installs only the reviewed journal migration in the already authorized development project.
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$migrationPath = Join-Path $workspace 'supabase/migrations/202609170002_desaing_exploration_journal.sql'
$migration = Get-Content -LiteralPath $migrationPath -Raw
$guard = @'
BEGIN;
DO $desaing_install$
BEGIN
  IF to_regclass('public.desaing_explorations') IS NOT NULL THEN
    RAISE EXCEPTION 'exploration_journal_already_installed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.desaing_policies p
    JOIN public.business_tenants b ON b.id = p.business_id AND b.is_active
    JOIN public.user_business_memberships m ON m.business_id = p.business_id
    WHERE p.business_id = 'a0000000-0000-0000-0000-000000000001'
      AND m.user_id = '0274bd51-1858-4893-8561-a9c99000feb7' AND m.role = 'owner'
      AND p.policy_id = 'fai-pilot-5usd-2026-09-17' AND p.limit_micro_usd = 5000000
      AND p.max_image_outputs = 4 AND p.reservation_per_output_micro_usd = 1000000
      AND p.enabled_image_profiles = ARRAY['flare_candidate']::text[] AND p.responses_image_enabled
  ) THEN RAISE EXCEPTION 'authorized_pilot_scope_changed'; END IF;
END;
$desaing_install$;
'@
# Escape the migration as one SQL text literal when retaining migration history.
$literal = $migration.Replace("'", "''")
$history = "INSERT INTO supabase_migrations.schema_migrations(version, statements, name) VALUES ('202609170002', ARRAY['$literal']::text[], 'desaing_exploration_journal');`nCOMMIT;"
$artifact = Join-Path $workspace 'artifacts/desaing-lab/exploration-install.sql'
[IO.File]::WriteAllText($artifact, $guard + "`n" + $migration + "`n" + $history, [Text.UTF8Encoding]::new($false))
& (Join-Path $PSScriptRoot 'supabase-query.ps1') -SqlFile $artifact -Write
