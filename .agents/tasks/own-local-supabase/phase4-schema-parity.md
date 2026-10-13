# Fase 4: paridad de schema local vs compartido

- Fecha: 13-10-2026. Rama `feat/own-local-supabase`.
- Compartido: `<PROJECT_REF_COMPARTIDO>`, leído solo con `default_transaction_read_only=on` y `BEGIN TRANSACTION READ ONLY … ROLLBACK` (imagen `postgres:17`). Dumps y salidas crudas fuera del repo.
- Local: `supabase_db_scorydesign` después de `supabase migration up` con `20261013000` a `20261013005`.
- Método: la misma consulta de catálogos en los dos lados, comparada por clave y con espacios normalizados. Alcance: 62 tablas (39 scory_owned + 18 ambiguous + 5 IdP), 49 funciones, 6 buckets.

## Resultado

| Sección | Compartido | Local | Solo compartido | Solo local | Distintas |
|---|---|---|---|---|---|
| Tablas (RLS, force RLS) | 62 | 62 | 0 | 0 | 0 |
| Columnas (tipo, NOT NULL, default, identity, generated) | 614 | 614 | 0 | 0 | 0 |
| Constraints (PK, unique, check, FK) | 264 | 264 | 0 | 0 | 2 (cosmético, D3) |
| Índices | 167 | 167 | 0 | 0 | 0 |
| Triggers (definición y estado) | 20 | 20 | 0 | 0 | 0 |
| Policies de tablas (cmd, permissive, roles, qual, with_check) | 123 | 121 | 5 (D1) | 3 (D1) | 0 |
| Grants de tablas (anon, authenticated, service_role) | 62 | 62 | 0 | 0 | 0 |
| Funciones (firma, resultado, SECURITY DEFINER, proconfig, lenguaje, volatilidad, EXECUTE) | 49 | 49 | 0 | 0 | 0 |
| Cuerpos de funciones (hash) | 49 | 49 | 0 | 0 | 16 (cosmético, D2) |
| Tipo `user_role` | 1 | 1 | 0 | 0 | 0 |
| ACL de `desaing_private` | 1 | 1 | 0 | 0 | 0 |
| Buckets (id, name, public, file_size_limit, allowed_mime_types) | 6 | 6 | 0 | 0 | 0 |
| Policies de `storage.objects` de los 6 buckets | 19 | 19 | 0 | 0 | 0 |
| Tablas en alcance en `supabase_realtime` | 0 | 0 | 0 | 0 | 0 |

Fuera de las desviaciones documentadas: **0 diferencias**.

## Desviaciones documentadas

D1. Policies del IdP. Las originales dependen de funciones de MarketXending que no se copian (`is_admin`, `has_role`, `get_extended_role`). Ninguna función en alcance lee `user_roles` ni `extended_user_roles` (búsqueda en los cuerpos del cierre).

| Tabla | Desplegada (no se copia) | Local |
|---|---|---|
| profiles | `Users can view own profile and admins can view all` (SELECT, `auth.uid() = id OR is_admin(auth.uid())`) | `Users can view own profile` (SELECT, `auth.uid() = id`) |
| profiles | `Users can update own profile` | igual que desplegado |
| user_roles | `Admins can view all roles, users can view own` (SELECT) | `Users can view own roles` (SELECT, `auth.uid() = user_id`) |
| user_roles | `Only admins can insert roles` (INSERT, `is_admin`) | sin policy: solo `service_role` escribe |
| extended_user_roles | `Master admin and admin can view all extended roles` (SELECT) | `Users can view own extended roles` (SELECT, `user_id = auth.uid()`) |
| extended_user_roles | `Master admin and admin can manage extended roles` (ALL, `get_extended_role`) | sin policy: solo `service_role` escribe |

Los roles (`TO …`) de las 3 policies nuevas son los de las originales.

D2. Cuerpos de función con fin de línea distinto. Los 16 cuerpos distintos tienen CRLF en el compartido y LF en local; quitando `\r` los 49 son idénticos. Es cosmético y no se corrige con otra migración (git usa `core.autocrlf`, así que el fin de línea del archivo no es estable de todos modos).

D3. Dos CHECK de `desaing_continuity` (`desaing_continuity_document_id_check`, `desaing_continuity_slide_id_check`): Postgres re-deparsea `((a AND b) AND c)` como `(a AND b AND c)`. La expresión es la misma.

## Objetos excluidos

| Objeto | Motivo |
|---|---|
| 87 tablas `marketxending_owned`, sus funciones, vistas (36), tipos (32 enums MX) y la secuencia `notas_calendario_id_seq` | No son de ScoryDesign (MIGRATION_SCOPE §3) |
| `is_admin`, `has_role`, `get_extended_role` | MarketXending; solo las usaban las policies de D1 |
| Trigger `on_auth_user_created` en `auth.users` → `public.handle_new_user` | Es de MarketXending; no se copian triggers sobre `auth.users` |
| `pg_cron`, `pg_net`, `unaccent` | Ningún objeto en alcance las usa (defaults, checks, policies y cuerpos revisados); `pgcrypto` y `uuid-ossp` ya están en el local |
| 24 policies de `storage.objects` de buckets de MarketXending y de `design-mockups` | Fuera de alcance o bucket inexistente |
| Publicación realtime (`crm_prospects`) | MarketXending; por eso no hay `006_realtime_publication` |
| Default privileges (`DEFAULT ACL`) del compartido | Los pone el Supabase local; los grants se fijan explícitamente en 004 |

FKs quitadas: **ninguna**. Ninguna FK de las 62 tablas apunta a tablas de MarketXending (`pg_constraint`). Se conservan las FKs a `auth.users` y a las tablas IdP (ADR-0002).

## Secretos

Escaneo del dump de `public` (JWT, `sk-`, `Bearer`, `service_role_key`, ref del compartido, URLs, emails) y de cuerpos, defaults, checks y policies en alcance: **0 secretos y 0 URLs del compartido** en objetos en alcance. Las únicas coincidencias (patrón de email) están en 3 objetos de MarketXending que no se copian. Las 6 migraciones no contienen URLs, UUIDs, emails ni JWT.

## Grants

`004` revoca primero lo que agregan los default privileges del Supabase local y después aplica exactamente `relacl`/`proacl` del compartido. La comparación usa los privilegios efectivos (sin grantor; ACL nula = default del tipo de objeto). Se mantiene ALL para `anon` en las 42 tablas que lo tienen hoy; el endurecimiento sigue en el backlog (MIGRATION_SCOPE §6).

## Lint

`supabase db lint --local --level warning --schema public,desaing_private,storage`: sin errores ni avisos.
