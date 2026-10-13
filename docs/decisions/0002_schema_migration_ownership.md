# ADR-0002: Ownership del schema y estrategia del baseline

- **Estado:** aceptada
- **Fecha:** 13 de octubre de 2026
- **Decisión de:** el usuario delegó la elección de estrategia; se eligió (a).

## Contexto

`supabase/migrations` tiene 72 archivos (56 de schema y 16 `seed_*`) mezclados con MarketXending (8 idénticos). La auditoría de Fase 1 encontró que el repo no reproduce lo desplegado:

- El ledger del compartido registra 7 de los 56 archivos; 2 versiones (`202609180007`, `202609180008`) están registradas sin archivo en ningún repo.
- Columnas agregadas a mano: `commercial_branches.prompt_kit`, `commercial_branches.branch_type`, `design_campaigns.branch_data`.
- `generated_ideas` está desplegada con 14 columnas, 4 FKs, RLS y 4 policies; el repo solo tiene un `ALTER`.
- `user_is_member_of` y `set_active_business` están desplegadas (definer, EXECUTE PUBLIC/anon) sin código en el repo.
- Faltan desplegados 2 triggers de `creative_profiles` y 6 tablas del repo.
- Hay DML dentro de migraciones de schema (R9) y versiones repetidas (R8).

## Decisión

### Ledger propio

- `supabase/migrations` es la única fuente del ledger nuevo. Formato `YYYYMMDDXXX_description.sql` (fecha, secuencia 000-999 sin huecos ni duplicados, descripción en inglés `snake_case`).
- Una migración aplicada no se edita, renombra ni renumera; las correcciones van en la siguiente secuencia.
- Las migraciones actuales se archivan con `git mv` en `supabase/legacy_shared_migrations/` como referencia de solo lectura. La CLI no las aplica. No se borran.
- Prohibido `db push`, `migration repair` y `--linked` contra el compartido.

### Estrategia elegida: (a) baseline desde el desplegado

El baseline sale de un dump **read-only y schema-only** del compartido (`pg_dump --schema-only` con `default_transaction_read_only=on`, imagen `postgres:17`, credencial fuera del repo), **curado** para dejar solo:

- las tablas scory_owned desplegadas y las ambiguous (57), más las 5 `idp_shared` como copia local;
- enums y tipos, secuencias, funciones y triggers que usan esas tablas;
- policies y grants de esas tablas;
- buckets y policies de `storage.objects` (ADR-0003).

Se descarta (b), aplicar las migraciones existentes y corregir el drift: no reproduce lo desplegado (7/56 en el ledger, columnas y RLS a mano, funciones sin repo, DML embebido), así que el dump data-only no cargaría sin transformaciones. Con (a) los datos cargan en el mismo shape del origen y la verificación por checksum es directa (ADR-0005).

### FKs hacia Auth e IdP

Se conservan las FKs a `auth.users` y a las tablas `idp_shared` (`business_tenants`, `user_business_memberships`, …). En la fase actual esas tablas y el usuario existen en local (ADR-0004), así que las FKs se cumplen. Es una **desviación consciente** de la regla "sin FKs cross-project" de agents-finmarket ADR-0004, ligada a la ADR-0004 de este repo: si más adelante se elige puente con MarketXending, una migración nueva reemplaza esas FKs por IDs opacos.

## Consecuencias

- El primer archivo del ledger nuevo es el baseline (`YYYYMMDD000_scory_schema_baseline.sql`), escrito en Fase 4.
- Seeds fuera de `migrations/` y `[db.seed]` apagado hasta decidirlo en Fase 4.
- El baseline replica privilegios del desplegado por paridad; el endurecimiento va en migraciones posteriores (`docs/MIGRATION_SCOPE.md` §6).
- Lo que solo existía en el repo (6 tablas, 2 triggers) no entra; se recrea solo con decisión propia.
