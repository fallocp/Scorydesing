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

Vacío hasta la Fase 4. El primer archivo será el baseline `YYYYMMDD000_scory_schema_baseline.sql`, curado desde un dump read-only schema-only del compartido (ver ADR-0002 y `docs/MIGRATION_SCOPE.md`).

## Reglas

- Nombres de tablas, columnas, índices, constraints, enums y policies en inglés `snake_case`; valores de CHECK/enums en inglés.
- Seeds fuera de este directorio (`[db.seed]` apagado hasta decidirlo en Fase 4).
- Se aplican solo al local (`supabase migration up`, después `supabase db lint`). Prohibido `db push`, `migration repair` y `--linked` contra el compartido.
- El endurecimiento de privilegios va en migraciones nuevas (`docs/MIGRATION_SCOPE.md` §6), nunca editando el baseline.
