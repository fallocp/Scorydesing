# Migraciones del Supabase local propio

Este directorio es la única fuente del ledger de ScoryDesign (ADR-0002). No contiene migraciones de MarketXending ni del ledger compartido; el historial anterior está archivado en `supabase/legacy_shared_migrations/` y no se aplica.

## Convención e inmutabilidad

```text
YYYYMMDDXXX_description.sql
```

- fecha `YYYYMMDD`;
- secuencia `000–999` por día, sin saltos ni duplicados;
- descripción en inglés `snake_case`;
- una migración aplicada nunca se modifica, renombra ni renumera;
- cualquier corrección se agrega en la siguiente migración secuencial.

## Estado

Baseline aplicado en local el 13-10-2026 (Fase 4, estrategia (a) de ADR-0002). Sale de un dump read-only schema-only del compartido (`pg_dump 17`, `default_transaction_read_only=on`), curado por catálogo:

| Archivo | Contenido |
|---|---|
| `20261013000_extensions_and_types.sql` | Schema `desaing_private` y enum `user_role`. Sin extensiones nuevas |
| `20261013001_identity_snapshot_tables.sql` | 5 tablas IdP como copia local (`business_tenants`, `user_business_memberships`, `profiles`, `user_roles`, `extended_user_roles`) |
| `20261013002_scory_tables.sql` | 57 tablas de ScoryDesign (39 scory_owned + 18 ambiguous) con constraints, índices y FKs |
| `20261013003_functions_and_triggers.sql` | 49 funciones (46 nombres) del cierre transitivo y 20 triggers |
| `20261013004_rls_policies_and_grants.sql` | RLS de las 62 tablas, 121 policies y grants con paridad al desplegado |
| `20261013005_storage_buckets_and_policies.sql` | 6 buckets y 19 policies de `storage.objects` |

No hay `006_realtime_publication`: ninguna tabla en alcance está en `supabase_realtime`. Paridad y desviaciones: `.agents/tasks/own-local-supabase/phase4-schema-parity.md`.

## Seeds

No hay seeds de datos: la Fase 5 copia los datos reales del compartido (ADR-0005). `[db.seed]` queda en `enabled = false` y este directorio no admite `seed_*.sql` (lo comprueba `npm run validate:structure`).

## Reglas

- Nombres de tablas, columnas, índices, constraints, enums y policies en inglés `snake_case`; valores de CHECK/enums en inglés. El baseline conserva los nombres desplegados tal cual (algunas policies tienen espacios); renombrarlos sería una migración aparte.
- Validar antes de commitear: `npm run validate:structure`.
- Se aplican solo al local (`supabase migration up`, después `supabase db lint`). Prohibido `db push`, `migration repair` y `--linked` contra el compartido.
- El endurecimiento de privilegios va en migraciones nuevas (`docs/MIGRATION_SCOPE.md` §6), nunca editando el baseline.
