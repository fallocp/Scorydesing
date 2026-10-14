# Reporte de migración de datos y Storage al Supabase local (Fase 5)

- Fecha: 13-10-2026 (horas en UTC). Rama `feat/own-local-supabase`.
- Origen: Supabase compartido `<PROJECT_REF_COMPARTIDO>`, **solo lectura** (`default_transaction_read_only=on`, `pg_dump`, Storage solo GET). El compartido no se modificó.
- Destino: Supabase local `scorydesign` (API `http://127.0.0.1:55321`, contenedor `supabase_db_scorydesign`), baseline `20261013000`-`005`.
- Decisiones: ADR-0003 (Storage), ADR-0004 (usuario único), ADR-0005 (datos).
- Scripts: `scripts/shared-migration/` (Node 22, sin dependencias; `npm run migrate:shared:*`). Dumps, objetos descargados, manifest y reportes crudos fuera del repo, en `F:\ScoryDesign-ops\phase5\`. Este documento no tiene secretos, UUIDs, emails ni valores de filas.

## 1. Resultado

| Verificación | Resultado |
|---|---|
| Usuario local con el mismo UUID | id local == id origen (comparado en script); login por password grant 200; `sub` del JWT == id; 1 usuario en `auth.users` |
| Tablas (conteo + checksum, origen vs local, antes de reescribir URLs) | **62/62 iguales** (57 de ScoryDesign + 5 IdP con el snapshot del dueño), 3,456 filas |
| Integridad referencial | 103 FKs revisadas, 0 filas huérfanas |
| Escrituras en el origen durante la copia | ninguna (conteo, checksum y `max(updated_at/created_at)` iguales al inicio y al final) |
| Storage (objetos y bytes por bucket) | **6/6 buckets iguales**: 1,600 objetos, 1,881,721,856 bytes |
| sha256 por objeto | 1,600/1,600: sha256 del archivo descargado del origen == sha256 del objeto re-descargado del local |
| URLs reescritas | 2,736 en 14 tablas (293 firmadas de `Brand` → públicas); 0 ocurrencias del host compartido en la base local; muestra de 20 URLs: 20 × HTTP 200 |
| Prueba de app (REST + JWT del usuario) | `design_mockups` 814/814, `design_pieces` 201/201, `presentations` 8/8 con JWT; 0 con solo anon key; objeto privado descargado con JWT (200, sha256 igual) y rechazado sin JWT (400); signup público rechazado (`signup_disabled`) |

## 2. Ensayo y definitiva

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| Usuario local (`migrate:shared:owner`) | 19:05-19:14 | Creado con la API admin local; ver desviación D1 |
| Export (`migrate:shared:export`) | 19:32-19:37 | Una sesión `REPEATABLE READ READ ONLY` exporta su snapshot; `pg_dump --data-only --snapshot` de las 57 tablas (766 MB), `\copy` del snapshot IdP y checksums del origen en la misma sesión |
| Ensayo de datos (`migrate:shared:load --mode rehearsal`) | 19:39 | `BEGIN … ROLLBACK`: 62/62 iguales, 0 huérfanas, 42 s |
| Ensayo de Storage (`migrate:shared:storage --mode rehearsal`) | 19:42 | 70 objetos: `Brand` 5, `desaing-conversation-references` 23, `desaing-materials` 2, `brand-assets` 0 (completos) + 20 de `design-images` y 20 de `desaing-assets`; 70/70 verificados por sha256 y metadatos alineados |
| Definitiva de datos (`--mode commit`) | 19:43 | `BEGIN … COMMIT` sobre tablas vacías (sin TRUNCATE): 62/62 iguales, 0 huérfanas, 40 s |
| Definitiva de Storage (`--mode full`) | 19:44-19:51 | 1,600 objetos, 0 fallos; los 70 del ensayo se reutilizaron (manifest) |
| Verificación (`migrate:shared:verify`) | 19:54 | Lectura nueva del origen: 62/62 tablas y 6/6 buckets iguales; 0 escrituras durante la copia |
| Reescritura de URLs (`migrate:shared:rewrite-urls`) | 20:0x | 2,736 reemplazos; checksums post-reescritura guardados como nueva referencia (`post-rewrite-checksums.json`) |
| Prueba de app (`migrate:shared:smoke`) | 20:19 | OK (§1) |

Carga: una sola transacción con `SET LOCAL session_replication_role = replica` (sin triggers ni FKs: `updated_at` y valores del histórico intactos); se vuelve a `origin` antes de verificar FKs y checksums dentro de la misma transacción. Orden: IdP (`business_tenants`, `profiles`, `user_business_memberships`, `user_roles`, `extended_user_roles`) y después el dump. No hay secuencias ni identities en las 62 tablas (confirmado en catálogo): 0 ajustes.

Checksum por tabla: `md5(string_agg(md5(ROW(columnas en orden local)::text), E'\n' ORDER BY pk))` con `TimeZone=UTC` y `DateStyle=ISO` en los dos lados. El `md5` por fila evita agregados de 400 MB en el compartido y detecta las mismas diferencias.

## 3. Tablas

Filas = origen en el snapshot del export (iguales en el local). Ensayo, definitiva y verificación: conteo **y** checksum.

| tabla | filas | ensayo | definitiva | verificación final |
|---|---|---|---|---|
| business_tenants (IdP) | 3 | igual | igual | igual |
| user_business_memberships (IdP) | 3 | igual | igual | igual |
| profiles (IdP) | 1 | igual | igual | igual |
| user_roles (IdP) | 1 | igual | igual | igual |
| extended_user_roles (IdP) | 1 | igual | igual | igual |
| brand_assets | 0 | igual | igual | igual |
| brand_disclaimers | 9 | igual | igual | igual |
| brand_onboarding_sessions | 0 | igual | igual | igual |
| compliance_messages | 11 | igual | igual | igual |
| compliance_rejected_suggestions | 0 | igual | igual | igual |
| compliance_rule_versions | 1 | igual | igual | igual |
| compliance_sessions | 1 | igual | igual | igual |
| copy_bank_items | 599 | igual | igual | igual |
| copy_kits | 0 | igual | igual | igual |
| creative_profiles | 0 | igual | igual | igual |
| desaing_audit | 598 | igual | igual | igual |
| desaing_brand_drafts | 0 | igual | igual | igual |
| desaing_brand_publications | 0 | igual | igual | igual |
| desaing_brand_revisions | 0 | igual | igual | igual |
| desaing_continuity | 13 | igual | igual | igual |
| desaing_explorations | 99 | igual | igual | igual |
| desaing_material_collections | 1 | igual | igual | igual |
| desaing_material_revisions | 4 | igual | igual | igual |
| desaing_policies | 3 | igual | igual | igual |
| desaing_production_receipts | 5 | igual | igual | igual |
| desaing_production_snapshots | 7 | igual | igual | igual |
| desaing_prompt_admin_drafts | 0 | igual | igual | igual |
| desaing_prompt_admin_grants | 1 | igual | igual | igual |
| desaing_prompt_admin_history | 0 | igual | igual | igual |
| desaing_prompt_admin_mutations | 0 | igual | igual | igual |
| desaing_prompt_admin_reviews | 0 | igual | igual | igual |
| desaing_prompt_admin_scopes | 1 | igual | igual | igual |
| desaing_prompt_admin_tests | 0 | igual | igual | igual |
| desaing_state | 1 | igual | igual | igual |
| design_feedback | 21 | igual | igual | igual |
| design_mockups | 814 | igual | igual | igual |
| design_sessions | 0 | igual | igual | igual |
| pipeline_pieces | 0 | igual | igual | igual |
| pipeline_runs | 0 | igual | igual | igual |
| pipeline_steps | 0 | igual | igual | igual |
| presentations | 8 | igual | igual | igual |
| promoters | 0 | igual | igual | igual |
| validation_disputes | 0 | igual | igual | igual |
| validation_history | 0 | igual | igual | igual |
| business_angles | 18 | igual | igual | igual |
| business_channels | 21 | igual | igual | igual |
| campaign_categories | 8 | igual | igual | igual |
| commercial_branches | 16 | igual | igual | igual |
| content_calendar | 0 | igual | igual | igual |
| content_library | 303 | igual | igual | igual |
| design_campaigns | 9 | igual | igual | igual |
| design_images | 120 | igual | igual | igual |
| design_library | 83 | igual | igual | igual |
| design_pieces | 201 | igual | igual | igual |
| generated_ideas | 8 | igual | igual | igual |
| image_library | 391 | igual | igual | igual |
| industry_verticals | 20 | igual | igual | igual |
| market_moments | 14 | igual | igual | igual |
| master_prompts | 8 | igual | igual | igual |
| narrative_angles | 12 | igual | igual | igual |
| news_editions | 18 | igual | igual | igual |
| schema_versions | 0 | igual | igual | igual |

Diferencia con la auditoría de Fase 1 (3,423 filas de ScoryDesign): hoy son 3,447 (+24), por uso de la app entre la auditoría y la copia: `design_mockups` +8, `desaing_audit` +15, `news_editions` +1. El snapshot IdP coincide con la auditoría (3 + 3 + 1 + 1 + 1); `user_roles` y `extended_user_roles` se copiaron porque las tablas están en el baseline (1 fila del dueño cada una).

## 4. Storage

| bucket | visibilidad | objetos origen | objetos local | bytes origen | bytes local | sha256 OK | metadatos OK |
|---|---|---|---|---|---|---|---|
| design-images | pública | 1,340 | 1,340 | 1,623,441,720 | 1,623,441,720 | 1,340 | 1,340 |
| desaing-assets | privada | 230 | 230 | 245,361,025 | 245,361,025 | 230 | 230 |
| Brand | pública | 5 | 5 | 2,843,511 | 2,843,511 | 5 | 5 |
| desaing-conversation-references | privada | 23 | 23 | 7,359,870 | 7,359,870 | 23 | 23 |
| desaing-materials | privada | 2 | 2 | 2,715,730 | 2,715,730 | 2 | 2 |
| brand-assets | privada | 0 | 0 | 0 | 0 | 0 | 0 |
| **total** | | **1,600** | **1,600** | **1,881,721,856** | **1,881,721,856** | **1,600** | **1,600** |

- Lista desde `storage.objects` del origen (read-only). Descarga: públicos por `/object/public/`, privados por `/object/<bucket>/<path>` con la service key del compartido (solo GET). Subida al local con `x-upsert`, `content-type` y `cache-control` del origen; después `owner`, `owner_id`, `user_metadata`, `created_at` y `updated_at` alineados en `storage.objects` local (1,600/1,600).
- "metadatos OK": tamaño, MIME, `cacheControl`, owner, owner_id, user_metadata, created_at y updated_at iguales al origen. 0 objetos de más en el local.
- El `eTag` difiere en 7 objetos de `design-images` y 4 de `Brand`: el local recalcula el eTag al subir y el origen guardó otro formato para esos objetos (no se investigó cuál); el contenido es el mismo (sha256 igual).
- Objeto más grande: 39,114,234 bytes (`design-images`); el límite global de 50 MiB alcanza.
- Diferencia con la auditoría (1,582 objetos): +13 en `design-images` y +5 en `desaing-assets`, por uso de la app.
- Copia extra de los 1,600 archivos en `F:\ScoryDesign-ops\phase5\storage\<bucket>\<path>` y manifest con sha256 por objeto en `F:\ScoryDesign-ops\phase5\storage-manifest.json`.

## 5. URLs reescritas

`https://<PROJECT_REF_COMPARTIDO>.supabase.co` → `http://127.0.0.1:55321`. Las firmadas de buckets públicos (`/object/sign/Brand/<path>?token=…`) pasan a `/object/public/Brand/<path>` sin token. 0 URLs `/render/image/`, así que `[storage.image_transformation]` queda apagado.

| tabla | columnas | URLs |
|---|---|---|
| business_tenants | logo_url | 2 |
| copy_bank_items | image_meta | 45 |
| desaing_continuity | snapshot | 54 |
| desaing_explorations | request | 92 |
| desaing_production_receipts | receipt | 5 |
| desaing_production_snapshots | snapshot | 1 |
| design_campaigns | branch_data | 92 |
| design_images | storage_path | 120 |
| design_library | html_content (83 firmadas) | 203 |
| design_mockups | image_url 814, selections 131 | 945 |
| design_pieces | html_content (195 firmadas) | 499 |
| image_library | image_url | 154 |
| news_editions | slides | 240 |
| presentations | slides (15 firmadas) | 284 |
| **total** | | **2,736** (293 firmadas → públicas) |

Diferencia con la auditoría (2,712): +24 por las mismas filas nuevas (`design_mockups` +13, `news_editions` +10, `presentations` +1). El conteo se tomó en la base local antes de reescribir (dry run) y es igual al del origen.

Después: 0 ocurrencias del host compartido en las 62 tablas, en `storage.objects` y en `auth.users`; 0 `/object/sign/` restantes. Muestra de 20 URLs públicas reescritas (5 de `Brand` + 15 de `design-images`): 20 × HTTP 200. De las 1,175 rutas distintas que quedan en la base, 1,169 apuntan a un objeto local existente; las 6 restantes (7 ocurrencias) ya estaban rotas en el origen (D4).

## 6. Desviaciones y correcciones

- **D1. Login local deshabilitado por config.** Con `[auth.email] enable_signup = false` el Auth local respondía `email_provider_disabled` al password grant: en la CLI ese flag apaga el proveedor de email completo. Se cambió a `true` en `supabase/config.toml` (cambio de config, no de migración) y se reinició el stack conservando volúmenes (`supabase stop` sin `--no-backup`). El registro público sigue cerrado por `[auth] enable_signup = false`: `POST /auth/v1/signup` responde 422 `signup_disabled` (probado).
- **D2. Reporte de la reescritura.** La primera corrida aplicó y confirmó la reescritura, pero falló después al armar la muestra (error de SQL en `ORDER BY` con `DISTINCT`), y no escribió el reporte. Se corrigió el script; la re-corrida encontró 0 URLs del origen e hizo la muestra (20/20) y los checksums post-reescritura. Las cifras por tabla son las del dry run sobre los mismos datos (`rewrite-report.json` lo anota).
- **D3. Dos URLs pegadas.** En `desaing_continuity.snapshot` hay 2 ocurrencias donde dos URLs están concatenadas sin separador en el mismo valor (dato del origen, se copió tal cual). Se reescribió el host de las dos.
- **D4. Referencias a objetos inexistentes.** 5 rutas en `copy_bank_items.image_meta` y 1 ruta (2 ocurrencias) en `desaing_continuity.snapshot` apuntan a objetos de `design-images` que no existen en el origen. Ya fallaban en el compartido; no se inventan objetos.
- **D5. Cifras más altas que la auditoría** (filas, objetos y URLs): uso real de la app entre Fase 1 y la copia; detalle en §3-§5.
- Rol de carga: `supabase_admin` (superusuario local), necesario para `session_replication_role` y para alinear `storage.objects`.
- Sin cambios de schema: no hizo falta una migración `20261013006`.

## 7. Cómo re-ejecutar

Requisitos: stack local arriba (`npm run supabase:start`), credenciales del compartido en `F:\ScoryDesign-ops\shared-readonly.env` (o la ruta de `SCORY_SHARED_CREDENTIALS_FILE`): `SHARED_DB_URL` y `SHARED_SERVICE_ROLE_KEY` (solo para GET de buckets privados). Salidas en `SCORY_PHASE5_DIR` (default `F:\ScoryDesign-ops\phase5`).

```powershell
npm run migrate:shared:owner                       # usuario local con el mismo UUID; login en F:\ScoryDesign-ops\local-owner-login.txt
npm run migrate:shared:export                      # snapshot único: pg_dump data-only + IdP + checksums del origen
npm run migrate:shared:load -- --mode rehearsal    # BEGIN … ROLLBACK
npm run migrate:shared:storage -- --mode rehearsal
npm run migrate:shared:load -- --mode commit --truncate   # --truncate solo antes de Fase 7
npm run migrate:shared:storage -- --mode full      # reanudable por manifest
npm run migrate:shared:verify                      # antes de reescribir URLs
npm run migrate:shared:rewrite-urls -- --dry-run
npm run migrate:shared:rewrite-urls
npm run migrate:shared:smoke
```

- `--truncate` vacía las 62 tablas en alcance del local. Permitido **solo mientras la app no escriba en el local (antes de Fase 7)**; después borraría datos nuevos.
- Una re-ejecución de la carga deja las URLs del compartido otra vez: repetir `verify` y `rewrite-urls`.
- Para un servidor propio: `migrate:shared:rewrite-urls -- --from http://127.0.0.1:55321 --to https://<servidor>` y `SCORY_LOCAL_API_URL`/`SCORY_LOCAL_DB_CONTAINER` para el destino.

## 8. Cómo volver

El compartido sigue intacto (solo se leyó) y la app sigue contra él hasta la Fase 7: no hay nada que revertir en la app. Para repetir la copia en local: `migrate:shared:load -- --mode commit --truncate` + `storage --mode full` (upsert). Los archivos originales quedan en `F:\ScoryDesign-ops\phase5\storage\`.

## 9. No verificado

- Flujos de la app en el navegador contra el local (Fase 7).
- Edge Functions contra los datos copiados (Fase 6).
- Las 7 URLs firmadas de `Brand` escritas en código siguen apuntando al compartido (Fase 7; ver `docs/MIGRATION_SCOPE.md` §4).
