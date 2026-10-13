# Migraciones legacy del Supabase compartido (solo referencia)

Estos 72 archivos (56 de schema y 16 `seed_*`) son el historial que ScoryDesign mantenía mientras compartía Supabase con MarketXending. Se movieron aquí con `git mv` el 13 de octubre de 2026 (ADR-0002).

- **Solo lectura.** No se editan, no se renombran y no se borran.
- **No se aplican.** La Supabase CLI solo lee `supabase/migrations/`; esta carpeta queda fuera de `supabase start`, `migration up` y `db reset`.
- **No reproducen lo desplegado**: el ledger del compartido registra 7 de los 56 archivos, hay columnas, RLS y funciones aplicadas a mano, y 8 archivos son idénticos a los de MarketXending (`docs/DEPLOYED_SCHEMA_AUDIT.md` §14 y §22).
- El schema local sale de un baseline curado desde el catálogo desplegado (`docs/decisions/0002_schema_migration_ownership.md`). Úsalos solo para entender la intención original de un objeto.
- Nunca se usan con `db push`, `migration repair` ni `--linked` contra el compartido.
