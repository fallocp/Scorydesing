# Alcance de la migración a Supabase local propio

- **Estado:** aceptado (Fase 2). Fecha: 13 de octubre de 2026.
- **Rama:** `feat/own-local-supabase`.
- **Evidencia:** `docs/DEPLOYED_SCHEMA_AUDIT.md` (Fase 1, commit `1401050`). Las cifras de filas, objetos y bytes son las de esa auditoría; la copia definitiva vuelve a contar en el origen.
- **Decisiones:** `docs/decisions/0001` a `0006`. El usuario delegó las decisiones técnicas de esta fase.

## 1. Decisión

ScoryDesign deja de usar el Supabase compartido con MarketXending y pasa a un Supabase **local** propio (Supabase CLI en Docker) con todos sus datos históricos, todos sus objetos de Storage y sus Edge Functions. No se crea proyecto hosted. No se borra nada: el compartido queda intacto como respaldo de solo lectura y las migraciones actuales se archivan con `git mv`.

## 2. Qué entra

### 2.1 Tablas (62 de `public`)

Se recrean en el baseline (ADR-0002) y se copian completas (ADR-0005). Las 18 `ambiguous` se reclasifican a `scory_owned` para la copia (auditoría §18): todas sus filas son del único usuario, ninguna tabla de MarketXending tiene FK hacia ellas y ninguna vista depende de ellas.

scory_owned desplegadas (39 tablas, 2,174 filas):

| tabla | filas | tabla | filas |
|---|---|---|---|
| brand_assets | 0 | desaing_prompt_admin_grants | 1 |
| brand_disclaimers | 9 | desaing_prompt_admin_history | 0 |
| brand_onboarding_sessions | 0 | desaing_prompt_admin_mutations | 0 |
| compliance_messages | 11 | desaing_prompt_admin_reviews | 0 |
| compliance_rejected_suggestions | 0 | desaing_prompt_admin_scopes | 1 |
| compliance_rule_versions | 1 | desaing_prompt_admin_tests | 0 |
| compliance_sessions | 1 | desaing_state | 1 |
| copy_bank_items | 599 | design_feedback | 21 |
| copy_kits | 0 | design_mockups | 806 |
| creative_profiles | 0 | design_sessions | 0 |
| desaing_audit | 583 | pipeline_pieces | 0 |
| desaing_brand_drafts | 0 | pipeline_runs | 0 |
| desaing_brand_publications | 0 | pipeline_steps | 0 |
| desaing_brand_revisions | 0 | presentations | 8 |
| desaing_continuity | 13 | promoters | 0 |
| desaing_explorations | 99 | validation_disputes | 0 |
| desaing_material_collections | 1 | validation_history | 0 |
| desaing_material_revisions | 4 | desaing_production_receipts | 5 |
| desaing_policies | 3 | desaing_production_snapshots | 7 |
| desaing_prompt_admin_drafts | 0 | | |

ambiguous → scory_owned (18 tablas, 1,249 filas, ≈757 MB):

| tabla | filas | tabla | filas |
|---|---|---|---|
| business_angles | 18 | generated_ideas | 8 |
| business_channels | 21 | image_library | 391 (401.6 MB) |
| campaign_categories | 8 | industry_verticals | 20 |
| commercial_branches | 16 | market_moments | 14 |
| content_calendar | 0 | master_prompts | 8 |
| content_library | 303 | narrative_angles | 12 |
| design_campaigns | 9 | news_editions | 17 |
| design_images | 120 | schema_versions | 0 |
| design_library | 83 (82.7 MB) | design_pieces | 201 (268.5 MB) |

idp_shared (5 tablas): estructura completa en el baseline como **copia local**; datos solo del snapshot mínimo del dueño (ADR-0004).

| tabla | filas en el compartido | filas que se copian |
|---|---|---|
| business_tenants | 3 | 3 (los 3 negocios del dueño, con las columnas extra de ScoryDesign) |
| user_business_memberships | 3 | 3 (dueño × 3 negocios, rol `owner`) |
| profiles | 7 | 1 (el dueño) |
| user_roles | 7 | 0, salvo que una función o policy en alcance la lea (se comprueba con `pg_depend` y el dump en Fase 4) |
| extended_user_roles | 5 | 0, misma regla |

La estructura sale del catálogo desplegado, no de las migraciones del repo: incluye las columnas agregadas a mano (`commercial_branches.prompt_kit`, `commercial_branches.branch_type`, `design_campaigns.branch_data`) y `generated_ideas` con sus 14 columnas, 4 FKs, RLS y 4 policies.

### 2.2 Storage (6 buckets, 1,582 objetos, 1,861,427,838 bytes ≈ 1.73 GiB)

| bucket | visibilidad | límite / MIME | objetos | bytes |
|---|---|---|---|---|
| design-images | pública | sin límite ni MIME | 1,327 | 1,609,364,424 (1.50 GiB) |
| desaing-assets | privada | 8 MiB; png/jpeg/webp | 225 | 239,144,303 (228 MiB) |
| Brand | pública | sin límite ni MIME | 5 | 2,843,511 |
| desaing-conversation-references | privada | 8 MiB; png | 23 | 7,359,870 |
| desaing-materials | privada | 8 MiB; pdf/txt/md/png | 2 | 2,715,730 |
| brand-assets | privada | sin límite | 0 | 0 |

Se crean por migración con la misma visibilidad, límites y MIME del desplegado, y se copian conservando bucket y path (ADR-0003).

### 2.3 Funciones SQL

Las que existen desplegadas y usan las tablas en alcance:

- Trigger: `update_design_campaigns_updated_at`, `update_updated_at_column`, `set_updated_at`, `presentations_set_updated_at`, `brand_layer_set_updated_at`.
- `desaing_*` de `public` (31) y de `desaing_private` (11), con la firma, `SECURITY DEFINER`, `search_path=''` y EXECUTE desplegados (incluye las dos firmas de `desaing_read_continuity`, `desaing_commit_continuity` y `desaing_apply_production`).
- Sin repo, tomadas del catálogo: `user_is_member_of(p_business_id uuid)` y `set_active_business(business_id uuid)`.
- `auto_increment_creative_profile_version` y `prevent_creative_profile_update` **no** entran: no están desplegadas (drift §14) y el baseline replica lo desplegado.

### 2.4 Triggers, policies y grants

- Los 20 triggers desplegados sobre tablas en alcance (lista exacta: dump de Fase 4).
- Las policies desplegadas de las 62 tablas (123 en las 59 tablas de ScoryDesign e IdP sin `profiles`/roles), tal como están, incluidas las que usan `user_is_member_of()`.
- `profiles`: sus policies dependen de `is_admin()` (MarketXending). No se trae `is_admin()`; se reemplazan por policies del propio usuario (`auth.uid() = id`). Es la única policy que no replica lo desplegado.
- Grants de tablas y EXECUTE de funciones: paridad con lo desplegado (incluye ALL para anon en 42 tablas). Ver backlog §6.

### 2.5 Policies de `storage.objects`

- Las 16 del repo (todas desplegadas tal cual).
- Las 3 de `design-images` que solo existen desplegadas: `Public read access for design images`, `Authenticated users can upload design images` y `Authenticated users can delete design images` (las necesita `useBrandLogos` para `brand-icons/`). Se replican por paridad y se endurecen después (§6).

### 2.6 Edge Functions

La carpeta `supabase/functions` completa (35 funciones + `_shared`) la sirve el edge runtime local. Prueba dedicada (ADR-0006) para las que `src` invoca:

- Usadas desde rutas: `generate-design-image`, `generate-design-html`.
- Invocadas desde `src` (auditoría §9): `analyze-brand-assets`, `brand-onboarding`, `compliance-wizard`, `desaing-server`, `desaing-state`, `evolution-summary`, `generate-carousel-plan`, `generate-carousel-script`, `generate-fx-daily`, `generate-news-plan`, `generate-news-visuals`, `interpret-feedback`, `pipeline-orchestrator`, `quick-fire`, `render-multichannel`, `scrape-brand-presence`, `suggest-copy`, `translate-text`.
- Sin prueba dedicada: las 7 duplicadas indeterminables (`generate-ideas`, `generate-strategy`, `generate-design-copy`, `generate-variants`, `refine-branch`, `adapt-channel`, `render-design-png`) y las que solo llaman otras funciones o scripts.

### 2.7 Secretos (solo nombres)

En `supabase/functions/.env` (ignorado), con `supabase/functions/.env.example` solo con nombres (Fase 6):

OPENAI_API_KEY, PHOTO_STYLE, SLIDE_FIX_MODEL, DESAING_ALLOWED_ORIGINS, DESAING_EXPLORATION_ENABLED, DESAING_PILOT_ACTOR_ID, DESAING_PILOT_BUSINESS_ID, DESAING_PILOT_ENABLED, DESAING_PILOT_EXPIRES_AT_MS, DESAING_PILOT_POLICY_ID, DESAING_PILOT_SUPABASE_ORIGIN, DESAING_PILOT_TOKEN, DESAING_PROMPT_ADMIN_ENABLED, DESAING_SERVER_ENABLED, DESAING_UI_EXECUTOR, DESAING_UI_GENERATION_ENABLED.

Usados por el código y sin valor desplegado (la función usa su default; se dejan vacíos salvo decisión en Fase 6): COPY_KIT_SOURCE, COPY_MODEL, COPY_V2_MODEL, MASTER_IMAGE_PROMPT_SOURCE, MASTER_IMAGE_PROMPT_VERSION, RENDER_SERVICE_URL, RENDER_SERVICE_TOKEN, SLIDE_MODEL, SLIDE_REVIEW_MODEL, TRANSLATE_MODEL.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los pone el edge runtime local.

### 2.8 Auth

Un solo usuario (el dueño) en el Auth local con el mismo UUID que en MarketXending, contraseña local nueva y registro público deshabilitado (ADR-0004).

## 3. Qué se excluye y por qué

| Excluido | Motivo |
|---|---|
| 87 tablas `marketxending_owned` (lista en auditoría §4) | Son de MarketXending; ScoryDesign no las usa |
| `asset_snapshots`, `custom_templates`, `interaction_log`, `learning_deltas`, `template_registry`, `trigger_templates` | Están en el repo pero no existen desplegadas ni tienen datos. El baseline replica lo desplegado. El código que las usa ya falla en el compartido; crearlas es una migración posterior con decisión propia |
| Buckets `pipeline-renders` y `templates` | No existen en el compartido; no hay objetos que copiar. Las rutas que los usan ya fallan hoy |
| Policies de `design-mockups` | El bucket no existe |
| 6 filas de `profiles`, 6 de `user_roles`, 4 de `extended_user_roles` y 6 usuarios de `auth.users` | Son de otros usuarios (MarketXending) |
| Buckets de MarketXending (`kyc`, `invoices`, `pdfs`, `fiscal-documents`, `task-files`, `market-screenshots`) | No son de ScoryDesign |
| Extensiones `pg_cron`, `pg_net`, `unaccent`, cron jobs y publicación realtime de `crm_prospects` | Son de MarketXending. Si el dump de Fase 4 muestra una dependencia de una función en alcance, se agrega con decisión documentada |
| `is_admin()` y las 46 funciones definer de MarketXending | No se copian (ver `profiles` en §2.4) |
| Ledger del compartido y versiones `202609180007`/`202609180008` | No sirven como baseline (ADR-0002) |
| 19 Edge Functions de MarketXending | No son de ScoryDesign |
| `branch-chat` | Solo existe en `E:\MarketXending`. `useBranchChat` lo importan `CopyWorkstation` (desruteado) y `BranchBrainstorm` (sin importador): hoy no es alcanzable desde una ruta. Fase 6 lo reconfirma; si cambia, se copia en solo lectura |
| `import-design-reference` y `render-design-preview` | Sin código en el repo y `src` no las invoca (grep del 13-10-2026) |

## 4. Orden de fases

| Fase | Entrega | Gate |
|---|---|---|
| 3 | Supabase local en Docker: CLI fijada, `config.toml`, red, runbook, ledger viejo archivado | Disco de Docker con al menos 5 GB libres; Firewall creado por el usuario |
| 4 | Baseline curado desde dump schema-only read-only (`YYYYMMDD000_scory_schema_baseline.sql` y siguientes), buckets por migración, `migration up` + `db lint`, validador de estructura | Base local sin errores de lint y con los objetos de §2 |
| 5 | Ensayo de datos y Storage, después copia definitiva: usuario local con el mismo UUID, snapshot IdP, dump data-only, carga, objetos, reescritura de URLs, verificación por tabla y bucket | Conteos y checksums iguales al origen; 0 URLs del compartido |
| 6 | Edge Functions locales: `.env` y `.env.example`, serve, prueba de las usadas, `verify_jwt` de `render-design-png` | Funciones usadas responden contra el local |
| 7 | App contra el local: env nuevo (el actual se conserva), 7 URLs firmadas en código, renderer si hace falta, login/logout/refresh y flujos con imágenes | Flujos principales verificados |
| 8 | Verificación completa, backup y restore probado, rollback documentado, inicio del endurecimiento | Restore probado |

## 5. Rollback

Hasta la Fase 7 la app sigue con su env actual contra el compartido, que no se toca. Volver atrás es no cambiar el env o restaurar el anterior. Las migraciones archivadas siguen en `supabase/legacy_shared_migrations/`.

## 6. Backlog de endurecimiento (después de verificar la app en Fases 7-8)

El baseline replica privilegios del desplegado para que los datos carguen y la app funcione igual. Se endurece con migraciones nuevas y secuenciales, nunca editando el baseline:

1. Revocar ALL de `anon` en las 42 tablas que hoy dependen solo de RLS; dejar a `authenticated` solo lo que la app usa.
2. `user_is_member_of` y `set_active_business`: `search_path=''` y EXECUTE solo para `authenticated` (hoy PUBLIC/anon).
3. `design-images`: reemplazar las policies de upload y delete para cualquier autenticado por las de membership (resolver antes `brand-icons/` de `useBrandLogos`).
4. `design-images` y `Brand`: límite de tamaño y MIME; decidir si siguen públicos o pasan a URLs firmadas.
5. Policies tautológicas o recursivas del IdP (R5) y policies `USING (true)` de `design_images`, `narrative_angles` y `schema_versions`.
6. Funciones con `verify_jwt=false` y service role sin `getUser` (R6, R7).
7. Crear `pipeline-renders`, `templates` y las 6 tablas no desplegadas solo si se decide reactivar esas rutas.
8. `AuthGate` con `VITE_AUTH_EMAIL`/`VITE_AUTH_PASSWORD` (obligatorio antes de agregar usuarios, ADR-0004).
9. Exposición: todo local en 127.0.0.1 y regla de Firewall `scorydesign - Supabase local only` (puertos 55320-55329).
