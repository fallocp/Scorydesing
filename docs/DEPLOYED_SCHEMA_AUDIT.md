# Auditoría del Supabase compartido usado por ScoryDesign

**Este documento NO es baseline: es un inventario para decidir la separación. Estado: completo (Fase 1).**

- Fase 1, parte A (lado repo) y parte B (lado desplegado, §18 a §24). Rama `feat/own-local-supabase`, creada desde `codex/ui-crear-editar-v2`.
- Proyecto compartido: `<PROJECT_REF_COMPARTIDO>`. No aparecen refs, secretos ni valores de `.env` en este documento.
- Insumo para scripts de la parte B: `.agents/tasks/own-local-supabase/phase1-repo-inventory.json`.

## 1. Propósito

Saber qué usa ScoryDesign del Supabase compartido con MarketXending (tablas, funciones SQL, Storage, Edge Functions y Auth), quién es dueño de cada objeto y qué riesgos hay, para decidir el alcance de la migración a un Supabase local propio (Fases 2 a 8). La parte B agrega lo desplegado: filas, objetos y bytes por bucket, drift, cron, extensiones y secretos.

## 2. Método y evidencia

| Fuente | Qué se hizo |
|---|---|
| `supabase/migrations` (72 archivos) | Parser de SQL (respeta `$$`, comillas y comentarios), sin copiar cuerpos de funciones |
| `E:\MarketXending\supabase\migrations` (89) y nombres de carpetas de `functions` | Solo lectura: nombres, hashes SHA-256 y tablas creadas |
| `src/` (538 archivos .ts/.tsx/.js) | Regex de `supabase-js` (`.from`, `storage.from`, `.rpc`, `functions.invoke`, `auth.*`, `/functions|rest|storage/v1/`, `.channel`) y constantes de nombre dinámico resueltas a mano |
| `supabase/functions` (35 + `_shared`) | Grafo de imports desde `index.ts` (sin tests): `Deno.env.get`, tablas, buckets, RPCs, llamadas entre funciones y proveedores |
| `src/integrations/supabase/types.ts` | Snapshot generado del esquema desplegado (último commit `350a62e`, 2026-09-18). Es un indicio, no prueba: 134 tablas, 36 vistas y 61 funciones en `public` |
| Archivos trackeados y no ignorados (1,698, sin lockfiles) | Escaneo de secretos; el payload de cada JWT se decodificó en memoria; ref compartido contado sin imprimirlo |

| Parte B: Postgres del compartido | `psql` de la imagen `postgres:17` con `default_transaction_read_only=on`, `statement_timeout` y cada consulta en `BEGIN TRANSACTION READ ONLY … ROLLBACK`. Solo catálogos y conteos; sin cuerpos de funciones, sin `cron.job.command`, sin valores de filas |
| Parte B: Supabase CLI | `functions list` y `secrets list` (solo nombres) con `--project-ref`, desde una carpeta fuera del repo. Sin `link`, `deploy`, `download`, `db dump` ni `inspect` |

Límites:

- Parte A: no se ejecutó la CLI ni se accedió al compartido. Parte B: solo lectura (ver tabla de arriba); scripts y salidas crudas fuera del repo.
- No se abrieron `.env` reales; solo `*.example`.
- El parser es por regex: los FKs compuestos (tablas `desaing_*`) aparecen por columna.
- La alcanzabilidad desde rutas se revisó a un nivel de imports, no con un grafo completo.
- Los scripts temporales vivieron fuera del repo y se borraron al terminar.

## 3. Resumen

| Concepto | Repo |
|---|---|
| Migraciones en `supabase/migrations` | 56 de schema + 16 `seed_*.sql` |
| Archivos con el mismo nombre que en MarketXending | 10: 8 con el mismo hash y 2 seeds con hash distinto |
| Tablas en migraciones de ScoryDesign | 65: 64 con `CREATE TABLE` y `generated_ideas` (solo `ALTER`) |
| Clasificación de esas 65 | scory_owned 45 · ambiguous 18 · idp_shared 2 (más `profiles`, `user_roles` y `extended_user_roles` de MarketXending: 5 en total) |
| marketxending_owned (migraciones de MX o types.ts; ScoryDesign no las usa) | 87 |
| Funciones SQL definidas | 55 definiciones (`CREATE [OR REPLACE] FUNCTION`), 47 nombres; 2 más se usan sin estar definidas en el repo (`set_active_business` y `user_is_member_of`) |
| Triggers | 25 |
| Extensiones, `cron.schedule`, `ALTER PUBLICATION supabase_realtime` | 0, 0, 0 |
| Buckets | 5 en migraciones de ScoryDesign; 3 más que se usan sin migración (`Brand`, `pipeline-renders`, `templates`) |
| Policies de `storage.objects` | 16 (11 RESTRICTIVE) |
| Edge Functions | 35 carpetas; 15 con entrada en `config.toml` (11 `verify_jwt=false`, 4 `true`) y 20 con el default |
| supabase-js en `src/` (sin tests) | 144 `.from()` en 60 archivos (35 tablas), 51 `storage.from` en 14, 28 `functions.invoke` en 24 (más 10 vía `invokeWithRetry`), 5 `.rpc` en 3, 34 `auth.*` en 23, 5 llamadas HTTP directas a `/functions/v1/` y 13 URLs `/storage/v1/` armadas o literales; 0 realtime |
| Secretos reales en código trackeado | 7 archivos con URLs firmadas del Storage compartido (token JWT vigente hasta 2027-04-25). Sin API keys reales |

Lado desplegado (parte B):

| Concepto | Desplegado |
|---|---|
| Tablas en `public` | 149: 39 scory_owned (6 del repo no existen), 18 ambiguous, 5 IdP y 87 MX. ScoryDesign: 3,423 filas, ≈775 MB |
| Un solo usuario | **Se cumple**: 1 UUID en todas las columnas de usuario, presente en `auth.users`, owner de los 3 negocios; 0 filas y 0 objetos de otros (§19) |
| Storage de ScoryDesign | 6 buckets existentes, 1,582 objetos, ≈1.73 GiB; `pipeline-renders` y `templates` no existen (§8) |
| URLs del compartido en la base | 2,712 ocurrencias en 14 tablas (§20) |
| Edge Functions | 56 desplegadas; 34 de las 35 del repo (falta `quick-fire`), 2 sin fuente en el repo (§21) |
| Ledger | 56 filas; 7 de los 56 archivos del repo registrados (§22) |

Los hallazgos preliminares de la guía (§7.1) se confirman, con estas diferencias:

- Hay 8 archivos idénticos (mismo hash), no 10. Los otros 2 son seeds con el mismo nombre y contenido distinto.
- El conteo de `.from()` difiere del de la guía (144 frente a ~158): esta cuenta excluye `storage.from` y los tests, e incluye `'x' as any`.
- Hay objetos usados que ningún repo crea: `generated_ideas`, `user_is_member_of`, `Brand`, `pipeline-renders` y `templates`.

## 4. Tablas

Leyenda:

- Policies: total (uid = usan `auth.uid()`, mem = consultan `user_business_memberships`, fn = helper). **true** marca `USING (true)` o `WITH CHECK (true)`.
- Columnas: `u:` usuario, `b:` negocio.
- "en types.ts" = la tabla aparece en el snapshot del esquema desplegado.

| tabla | migración | clasificación | RLS | policies | FK auth.users | FK a idp/externas | cols usuario/negocio | usos en src | usos en functions | filas (count exacto) | desplegado (tamaño total; policies desplegadas; drift) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| asset_snapshots | 20260524_create_asset_snapshots.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 4 en 1 arch. (select,insert) | hydrate-templates, pipeline-orchestrator | - | **no desplegada** |
| brand_assets | 20260521_brand_onboarding_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | - | - | 0 | sí (32 KB; 1 policies) |
| brand_disclaimers | 20260801_brand_layer_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 4 en 1 arch. (select,insert,update) | - | 9 | sí (48 KB; 1 policies) |
| brand_onboarding_sessions | 20260521_brand_onboarding_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | - | brand-onboarding, pipeline-orchestrator, quick-fire | 0 | sí (24 KB; 1 policies) |
| business_angles | 20260501_create_campaign_architecture.sql | ambiguous | sí | 4 (uid 4, mem 4) | - | business_id→business_tenants | b:business_id | 2 en 2 arch. (insert,select) | 14 funciones | 18 | sí (64 KB; 4 policies) |
| business_channels | 20260501_create_campaign_architecture.sql | ambiguous | sí | 4 (uid 4, mem 4) | - | business_id→business_tenants | b:business_id | 3 en 3 arch. (select,insert) | 14 funciones | 21 | sí (64 KB; 4 policies) |
| business_tenants | 20260501_create_business_tenants.sql | idp_shared | sí | 4 (uid 3, mem 3, **true**) | - | - | - | 9 en 9 arch. (update,insert,select) | 19 funciones | 3 | sí (48 KB; 4 policies) |
| campaign_categories | 20260501_create_campaign_architecture.sql | ambiguous | sí | 4 (uid 4, mem 4) | - | business_id→business_tenants | b:business_id | 6 en 6 arch. (insert,select) | generate-strategy | 8 | sí (64 KB; 4 policies) |
| commercial_branches | 20260501_create_campaign_architecture.sql | ambiguous | sí | 4 (uid 4, mem 4) | - | business_id→business_tenants | b:business_id | 6 en 6 arch. (insert,select,update) | 6 funciones | 16 | sí (240 KB; 4 policies; +2 cols (prompt_kit, branch_type)) |
| compliance_messages | 20260510_compliance_wizard.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | - | - | - | compliance-wizard | 11 | sí (48 KB; 1 policies) |
| compliance_rejected_suggestions | 20260510_compliance_wizard.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | - | compliance-wizard | 0 | sí (24 KB; 1 policies) |
| compliance_rule_versions | 20260510_compliance_wizard.sql | scory_owned | sí | 2 (uid 2, mem 2) | created_by | business_id→business_tenants | u:created_by, b:business_id | - | compliance-wizard | 1 | sí (64 KB; 2 policies) |
| compliance_sessions | 20260510_compliance_wizard.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | - | compliance-wizard | 1 | sí (48 KB; 1 policies) |
| content_calendar | 20260502_pipeline_v2_tables.sql | ambiguous | sí | 3 (uid 0, mem 0, fn user_is_member_of) | - | business_id→business_tenants | b:business_id | 3 en 2 arch. (insert,select,update) | - | 0 | sí (40 KB; 3 policies) |
| content_library | 20260502_pipeline_v2_tables.sql | ambiguous | sí | 3 (uid 0, mem 0, fn user_is_member_of) | - | business_id→business_tenants | b:business_id | 1 en 1 arch. (select) | generate-ideas | 303 | sí (800 KB; 3 policies) |
| copy_bank_items | 20260806_copy_bank_v2.sql | scory_owned | sí | 4 (uid 4, mem 4) | created_by, reviewed_by, used_by | business_id→business_tenants | u:created_by, u:reviewed_by, u:used_by, b:business_id | 5 en 1 arch. (select,update) | generate-copy-v2 | 599 | sí (1.5 MB; 4 policies) |
| copy_kits | 20260806_copy_bank_v2.sql | scory_owned | sí | 2 (uid 2, mem 2) | created_by | business_id→business_tenants | u:created_by, b:business_id | - | generate-carousel-plan, generate-carousel-script, generate-copy-v2 | 0 | sí (24 KB; 2 policies) |
| creative_profiles | 20260524_create_creative_profiles.sql<br>202609180004_desaing_onboarding.sql | scory_owned | sí | 2 (uid 1, mem 1, fn desaing_business_role) | - | business_id→business_tenants, business_id→business_tenants | u:created_by, b:business_id | 2 en 2 arch. (insert,select) | 5 funciones | 0 | sí (32 KB; 1 policies) |
| custom_templates | 20260523_create_custom_templates.sql | scory_owned | sí | 1 (uid 1, mem 1) | created_by | business_id→business_tenants | u:created_by, b:business_id | 2 en 2 arch. (select,insert) | - | - | **no desplegada** |
| desaing_audit | 202609170001_desaing_server_foundation.sql | scory_owned | sí | 1 (uid 0, mem 0, fn desaing_business_role) | - | business_id→business_tenants | u:actor_id, b:business_id | - | - | 583 | sí (336 KB; 1 policies) |
| desaing_brand_drafts | 202609180004_desaing_onboarding.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 0 | sí (24 KB; 0 policies) |
| desaing_brand_publications | 202609180004_desaing_onboarding.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, u:profile_id, b:business_id | - | - | 0 | sí (16 KB; 0 policies) |
| desaing_brand_revisions | 202609180004_desaing_onboarding.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 0 | sí (16 KB; 0 policies) |
| desaing_continuity | 202609190001_desaing_continuity.sql | scory_owned | sí | 1 (uid 1, mem 0, fn desaing_business_role) | actor_id | business_id→business_tenants | u:actor_id, b:business_id | - | - | 13 | sí (536 KB; 1 policies) |
| desaing_explorations | 202609170002_desaing_exploration_journal.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 99 | sí (1.5 MB; 0 policies) |
| desaing_material_collections | 202609180003_desaing_materials.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 1 | sí (32 KB; 0 policies) |
| desaing_material_revisions | 202609180003_desaing_materials.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 4 | sí (32 KB; 0 policies) |
| desaing_policies | 202609170001_desaing_server_foundation.sql | scory_owned | sí | 1 (uid 0, mem 0, fn desaing_business_role) | - | business_id→business_tenants | b:business_id | - | - | 3 | sí (32 KB; 1 policies) |
| desaing_production_receipts | 202609180005_desaing_production.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 5 | sí (64 KB; 0 policies) |
| desaing_production_snapshots | 202609180005_desaing_production.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 7 | sí (168 KB; 0 policies) |
| desaing_prompt_admin_drafts | 202609180006_desaing_prompt_admin.sql | scory_owned | sí | 0 (sin policies) | actor_id | - | u:actor_id, b:business_id | - | - | 0 | sí (24 KB; 0 policies) |
| desaing_prompt_admin_grants | 202609180006_desaing_prompt_admin.sql | scory_owned | sí | 0 (sin policies) | actor_id | - | u:actor_id, b:business_id | - | - | 1 | sí (32 KB; 0 policies) |
| desaing_prompt_admin_history | 202609180006_desaing_prompt_admin.sql | scory_owned | sí | 0 (sin policies) | - | - | - | - | - | 0 | sí (16 KB; 0 policies) |
| desaing_prompt_admin_mutations | 202609180006_desaing_prompt_admin.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 0 | sí (16 KB; 0 policies) |
| desaing_prompt_admin_reviews | 202609180006_desaing_prompt_admin.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 0 | sí (16 KB; 0 policies) |
| desaing_prompt_admin_scopes | 202609180006_desaing_prompt_admin.sql | scory_owned | sí | 0 (sin policies) | - | business_id→business_tenants | b:business_id | - | - | 1 | sí (24 KB; 0 policies) |
| desaing_prompt_admin_tests | 202609180006_desaing_prompt_admin.sql | scory_owned | sí | 0 (sin policies) | - | - | u:actor_id, b:business_id | - | - | 0 | sí (16 KB; 0 policies) |
| desaing_state | 202609170001_desaing_server_foundation.sql | scory_owned | sí | 1 (uid 0, mem 0, fn desaing_business_role) | - | - | b:business_id | - | - | 1 | sí (6.8 MB; 1 policies) |
| design_campaigns | 20260424_create_design_campaigns.sql | ambiguous | sí | 7 (uid 7, mem 3) | user_id | business_id→business_tenants | u:user_id, b:business_id | 12 en 5 arch. (insert,select,update,delete) | - | 9 | sí (352 KB; 7 policies; +1 col (branch_data)) |
| design_feedback | 20260524_create_design_feedback.sql | scory_owned | sí | 3 (uid 3, mem 2) | created_by | business_id→business_tenants | u:created_by, b:business_id | 7 en 2 arch. (insert,select) | desaing-server, generate-design-mockups, quick-fire | 21 | sí (288 KB; 3 policies) |
| design_images | 20260424_create_design_images.sql | ambiguous | sí | 7 (uid 6, mem 3, **true**) | - | business_id→business_tenants | b:business_id | 3 en 2 arch. (select,insert) | - | 120 | sí (336 KB; 7 policies) |
| design_library | 20260506_create_design_library.sql | ambiguous | sí | 4 (uid 0, mem 0, fn user_is_member_of) | - | business_id→business_tenants | b:business_id | 6 en 1 arch. (select,update,insert,delete) | - | 83 | sí (82.7 MB; 4 policies) |
| design_mockups | 20260523_create_design_mockups.sql | scory_owned | sí | 4 (uid 4, mem 2) | created_by | business_id→business_tenants | u:created_by, b:business_id | 1 en 1 arch. (helper CRUD (useDesignMockups.ts:46)) | - | 806 | sí (5.5 MB; 4 policies) |
| design_pieces | 20260424_create_design_pieces.sql | ambiguous | sí | 7 (uid 7, mem 3) | - | business_id→business_tenants | b:business_id | 6 en 1 arch. (select,insert,update,delete) | - | 201 | sí (268.5 MB; 7 policies) |
| design_sessions | 20260522_create_design_sessions.sql | scory_owned | sí | 1 (uid 1, mem 1) | user_id | business_id→business_tenants | u:user_id, b:business_id | 3 en 1 arch. (select,upsert,update) | - | 0 | sí (24 KB; 1 policies) |
| generated_ideas | (no la crea; ALTER en 20260530_add_piece_v2_to_generated_ideas.sql) | ambiguous | **no** | 0 | - | - | b:business_id | 8 en 2 arch. (insert,update,select,delete) | - | 8 | sí (176 KB; 4 policies; 14 cols sin DDL en repo; RLS **sí**) |
| image_library | 20260502_pipeline_v2_tables.sql | ambiguous | sí | 3 (uid 0, mem 0, fn user_is_member_of) | - | business_id→business_tenants | b:business_id | 4 en 4 arch. (select,update) | generate-design-image | 391 | sí (401.6 MB; 3 policies) |
| industry_verticals | 20260501_create_campaign_architecture.sql | ambiguous | sí | 4 (uid 4, mem 4) | - | business_id→business_tenants | b:business_id | 4 en 3 arch. (insert,select) | generate-carousel-script, generate-design-image, generate-ideas | 20 | sí (112 KB; 4 policies) |
| interaction_log | 20260524_create_interaction_log.sql | scory_owned | sí | 1 (uid 1, mem 1) | created_by | business_id→business_tenants | u:created_by, b:business_id | - | - | - | **no desplegada** |
| learning_deltas | 20260524_create_learning_deltas.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 2 en 2 arch. (insert,select) | evolution-summary, interpret-feedback, pipeline-orchestrator | - | **no desplegada** |
| market_moments | 20260501_create_campaign_architecture.sql | ambiguous | sí | 4 (uid 4, mem 4) | - | business_id→business_tenants | b:business_id | 3 en 3 arch. (insert,select) | generate-design-image, generate-ideas | 14 | sí (80 KB; 4 policies) |
| master_prompts | 20260501_create_campaign_architecture.sql | ambiguous | sí | 7 (uid 4, mem 4, fn desaing_prompt_governed, RESTRICTIVE) | - | business_id→business_tenants | b:business_id | 5 en 4 arch. (select,insert) | 16 funciones | 8 | sí (144 KB; 7 policies) |
| narrative_angles | 20260502_pipeline_v2_tables.sql | ambiguous | sí | 1 (uid 0, mem 0, **true**) | - | - | - | 2 en 2 arch. (select) | - | 12 | sí (48 KB; 1 policies) |
| news_editions | 20260822_create_news_editions.sql | ambiguous | sí | 1 (uid 1, mem 1) | created_by | business_id→business_tenants | u:created_by, b:business_id | 1 en 1 arch. (helper CRUD (useNewsEditions.ts:129)) | - | 17 | sí (1.3 MB; 1 policies) |
| pipeline_pieces | 20260520_pipeline_orchestrator_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 2 en 2 arch. (select) | hydrate-templates, pipeline-orchestrator, render-design-png | 0 | sí (40 KB; 1 policies) |
| pipeline_runs | 20260520_pipeline_orchestrator_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 2 en 2 arch. (select) | generate-design-image, pipeline-orchestrator, quick-fire, render-multichannel | 0 | sí (24 KB; 1 policies) |
| pipeline_steps | 20260520_pipeline_orchestrator_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | - | - | 2 en 2 arch. (select) | pipeline-orchestrator | 0 | sí (32 KB; 1 policies) |
| presentations | 20260626_presentations_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 15 en 2 arch. (select,insert,update,delete) | - | 8 | sí (600 KB; 1 policies) |
| promoters | 20260801_brand_layer_tables.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 4 en 1 arch. (select,insert,update) | - | 0 | sí (24 KB; 1 policies) |
| schema_versions | 20260501_create_campaign_architecture.sql | ambiguous | sí | 4 (uid 0, mem 0, **true**) | - | - | - | - | - | 0 | sí (24 KB; 4 policies) |
| template_registry | 20260525_create_template_registry.sql | scory_owned | sí | 5 (uid 4, mem 4) | - | business_id→business_tenants | b:business_id | 1 en 1 arch. (select) | quick-fire | - | **no desplegada** |
| trigger_templates | 20260526_create_trigger_templates.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | 1 en 1 arch. (select) | quick-fire | - | **no desplegada** |
| user_business_memberships | 20260501_create_business_tenants.sql | idp_shared | sí | 4 (uid 4, mem 4) | user_id | business_id→business_tenants | u:user_id, b:business_id | 3 en 3 arch. (insert,select) | 14 funciones | 3 | sí (80 KB; 4 policies) |
| validation_disputes | 20260511_validation_disputes.sql | scory_owned | sí | 1 (uid 1, mem 1) | created_by | business_id→business_tenants | u:created_by, b:business_id | - | compliance-wizard | 0 | sí (24 KB; 1 policies) |
| validation_history | 20260510_compliance_wizard.sql | scory_owned | sí | 1 (uid 1, mem 1) | - | business_id→business_tenants | b:business_id | - | compliance-wizard | 0 | sí (24 KB; 1 policies) |

Decisiones que hacen falta (tablas ambiguous):

| Grupo | Tablas | Decisión |
|---|---|---|
| Archivos idénticos con MX | design_campaigns, design_images, design_pieces, campaign_categories, commercial_branches, industry_verticals, market_moments, master_prompts, schema_versions, business_channels, business_angles, narrative_angles, image_library, content_library, content_calendar, design_library | ScoryDesign las usa y les agregó columnas y datos. Hay que confirmar en la parte B si MarketXending las lee (sus copias de las 9 funciones leen `business_*` y `master_prompts`). Si no las lee, pasan a scory_owned y se copian completas |
| Sin migración | generated_ideas | La usa ScoryDesign (`useDesignCopyBank`, `desaing_*_production`). Hace falta un dump de solo schema para recrearla. 20260502 la lee con `SELECT … FROM public.generated_ideas` |
| Creada por ScoryDesign, posible uso externo | news_editions | Confirmar si el Plan B o MarketXending escriben en ella |
| IdP | business_tenants, user_business_memberships, profiles | Snapshot mínimo del dueño (decisión 5). ScoryDesign además **escribe** en `business_tenants` (logo, colores, fuentes, `compliance_rules`) y en `user_business_memberships` (onboarding). En local, esas escrituras quedan solo en local |

marketxending_owned (no se copian): ai_queue, ai_rate_limits, beneficiaries, chat_message_queue, client_applications, comprobantes_historial, comprobantes_pago, conversation_history, crm_prospect_actions, crm_prospect_alerts, crm_prospect_notes, crm_prospects, daily_fx_reports, executive_companies, financial_analysis, fx_deal_confirmations, fx_saved_beneficiaries, market_data_snapshots, members, monex_clients, monex_companies, monex_promoters, monex_report_operations, monex_reports, monex_transactions, notas_calendario, operaciones, organizational_hierarchy, pld_alerts, pld_anonymous_reports, pld_audit_log, pld_beneficial_owners, pld_blocked_list, pld_cash_approvals, pld_client_documents, pld_client_operations_summary, pld_client_products, pld_client_risk, pld_committee_alerts, pld_committee_meetings, pld_committee_members, pld_committee_votes, pld_gafi_countries, pld_internal_reports, pld_operations, pld_pep_list, pld_risk_factors, pld_risk_weights, pld_screening_logs, pld_thresholds, pld_transactional_profiles, pld_uif_report_operations, pld_uif_reports, pld_user_roles, projects, prospect_activities, prospect_imports, prospect_movement_logs, prospect_process_timeline, scory2, task_alerts, task_attachments, task_modifications, task_notes, tasks, user_permissions, user_rate_limits, workspaces, xending_alert_rules, xending_alerts, xending_audit_log, xending_bank_accounts, xending_expense_categories, xending_expenses, xending_kpi_monthly, xending_meeting_topics, xending_org_users, xending_partner_config, xending_plan_targets, xending_promoter_payout_rules, xending_promoter_payouts, xending_promoter_strikes, xending_promoters, xending_revenue, xending_revenue_tiers, xending_scenarios, xending_weekly_tasks.

## 5. Funciones SQL / RPC

EXECUTE: `+` es GRANT y `-` es REVOKE, con archivo:línea.

| función | firma(s) | SECURITY DEFINER | search_path | EXECUTE | definida en | clasificación | quién la usa |
|---|---|---|---|---|---|---|---|
| update_design_campaigns_updated_at | () | no | - | sin GRANT/REVOKE (PUBLIC por defecto) | 20260424_create_design_campaigns.sql:53 | ambiguous | trigger |
| update_updated_at_column | () | no | - | sin GRANT/REVOKE (PUBLIC por defecto) | 20260501_create_business_tenants.sql:8 | ambiguous | trigger |
| set_updated_at | () | no | - | sin GRANT/REVOKE (PUBLIC por defecto) | 20260506_create_design_library.sql:99<br>20260806_copy_bank_v2.sql:126 | ambiguous | trigger |
| auto_increment_creative_profile_version | () | no | - | sin GRANT/REVOKE (PUBLIC por defecto) | 20260524_create_creative_profiles.sql:41 | scory_owned | trigger |
| prevent_creative_profile_update | () | no | - | sin GRANT/REVOKE (PUBLIC por defecto) | 20260524_create_creative_profiles.sql:63 | scory_owned | trigger |
| presentations_set_updated_at | () | no | - | sin GRANT/REVOKE (PUBLIC por defecto) | 20260626_presentations_tables.sql:31 | scory_owned | trigger |
| brand_layer_set_updated_at | () | no | - | sin GRANT/REVOKE (PUBLIC por defecto) | 20260801_brand_layer_tables.sql:66 | scory_owned | trigger |
| desaing_private.business_role | p_actor_id uuid, p_business_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170001:63 | 202609170001_desaing_server_foundation.sql:53 | scory_owned | interno (desaing_private) |
| desaing_business_role | p_business_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170001:70 +authenticated@202609170001:71 | 202609170001_desaing_server_foundation.sql:65 | scory_owned | policies, renderer/scripts/renderer-access.js:40 |
| desaing_private.require_policy_revision | () | no | '' | -PUBLIC,anon,authenticated,service_role@202609170001:99 | 202609170001_desaing_server_foundation.sql:83 | scory_owned | trigger; interno (desaing_private) |
| desaing_read_state | p_business_id uuid, p_actor_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170001:133 +service_role@202609170001:134 | 202609170001_desaing_server_foundation.sql:103 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_commit_state | p_business_id uuid, p_actor_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_event text, p_operation_key text DEFAULT NULL | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170001:223 +service_role@202609170001:225 | 202609170001_desaing_server_foundation.sql:136 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_private.exploration_member_role | p_business_id uuid, p_actor_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170002:289 | 202609170002_desaing_exploration_journal.sql:33 | scory_owned | interno (desaing_private) |
| desaing_private.image_committed_micro_usd | p_snapshot jsonb | no | '' | -PUBLIC,anon,authenticated,service_role@202609170002:289 | 202609170002_desaing_exploration_journal.sql:51 | scory_owned | interno (desaing_private) |
| desaing_private.exploration_entry | p_row public.desaing_explorations | no | '' | -PUBLIC,anon,authenticated,service_role@202609170002:289 | 202609170002_desaing_exploration_journal.sql:88 | scory_owned | interno (desaing_private) |
| desaing_private.guard_shared_design_budget | () | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170002:289 | 202609170002_desaing_exploration_journal.sql:96 | scory_owned | trigger; interno (desaing_private) |
| desaing_claim_exploration | p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_policy_id text, p_expires_at_ms bigint, p_reserved_micro_usd bigint | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170002:297 +service_role@202609170002:302 | 202609170002_desaing_exploration_journal.sql:126<br>202609260001_desaing_remove_pilot_limits.sql:14 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_read_exploration | p_business_id uuid, p_actor_id uuid, p_request_key text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170002:297 +service_role@202609170002:302 | 202609170002_desaing_exploration_journal.sql:187 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_list_explorations | p_business_id uuid, p_actor_id uuid, p_session_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170002:297 +service_role@202609170002:302 | 202609170002_desaing_exploration_journal.sql:199<br>202609260001_desaing_remove_pilot_limits.sql:69 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_exploration_budget | p_business_id uuid, p_actor_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170002:297 +service_role@202609170002:302 | 202609170002_desaing_exploration_journal.sql:208 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_finish_exploration | p_business_id uuid, p_actor_id uuid, p_request_key text, p_claim_token uuid, p_status text, p_result jsonb, p_error_code text, p_response_id text, p_usage jsonb, p_settled_micro_usd bigint | sí | '' | -PUBLIC,anon,authenticated,service_role@202609170002:297 +service_role@202609170002:302 | 202609170002_desaing_exploration_journal.sql:223 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_read_materials | p_business_id uuid, p_actor_id uuid, p_collection_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180003:89 +service_role@202609180003:91 | 202609180003_desaing_materials.sql:26 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_commit_materials | p_business_id uuid, p_actor_id uuid, p_collection_id uuid, p_expected_revision bigint, p_snapshot jsonb, p_expected_policy_id text, p_expires_at_ms bigint | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180003:90 +service_role@202609180003:92 | 202609180003_desaing_materials.sql:35 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_private.protect_creative_profile_version | () | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180004:204 | 202609180004_desaing_onboarding.sql:19 | scory_owned | trigger; interno (desaing_private) |
| desaing_private.brand_base | p_tenant jsonb,p_profile jsonb | no | '' | -PUBLIC,anon,authenticated,service_role@202609180004:204 | 202609180004_desaing_onboarding.sql:58 | scory_owned | interno (desaing_private) |
| desaing_read_onboarding | p_business_id uuid,p_actor_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180004:209 +service_role@202609180004:211 | 202609180004_desaing_onboarding.sql:63 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_save_onboarding | p_business_id uuid,p_actor_id uuid,p_expected_revision bigint,p_snapshot jsonb,p_policy_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180004:209 +service_role@202609180004:211 | 202609180004_desaing_onboarding.sql:75 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_recover_onboarding | p_business_id uuid,p_actor_id uuid,p_publish_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180004:209 +service_role@202609180004:211 | 202609180004_desaing_onboarding.sql:126 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_publish_onboarding | p_business_id uuid,p_actor_id uuid,p_request jsonb,p_snapshot jsonb, p_expected_state_revision bigint,p_profile_base jsonb,p_profile_strategic jsonb,p_profile_preferences jsonb,p_policy_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180004:209 +service_role@202609180004:211 | 202609180004_desaing_onboarding.sql:134 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_private.production_source | p_business_id uuid,p_source jsonb,p_write boolean DEFAULT false | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180005:172 | 202609180005_desaing_production.sql:20 | scory_owned | interno (desaing_private) |
| desaing_inspect_production | p_business_id uuid,p_actor_id uuid,p_source jsonb | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180005:179 +service_role@202609180005:182 | 202609180005_desaing_production.sql:77 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_snapshot_production | p_business_id uuid,p_actor_id uuid,p_snapshot_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180005:179 +service_role@202609180005:182 | 202609180005_desaing_production.sql:81 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_prepare_production | p_business_id uuid,p_actor_id uuid,p_request jsonb,p_snapshot jsonb,p_policy_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180005:179 +service_role@202609180005:182 | 202609180005_desaing_production.sql:86 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_read_production | p_business_id uuid,p_actor_id uuid,p_source jsonb | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180005:179 +service_role@202609180005:182 | 202609180005_desaing_production.sql:109 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_recover_production | p_business_id uuid,p_actor_id uuid,p_apply_id uuid | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180005:179 +service_role@202609180005:182 | 202609180005_desaing_production.sql:118 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_apply_production | (1) p_business_id uuid,p_actor_id uuid,p_request jsonb,p_expected_state_revision bigint,p_image_url text,p_prompt text,p_instruction text,p_policy_id text<br>(2) p_business_id uuid, p_actor_id uuid, p_request jsonb, p_expected_state_revision bigint, p_image_url text, p_prompt text, p_instruction text, p_copy_text text, p_policy_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180005:179 +service_role@202609180005:182 -PUBLIC,anon,authenticated,service_role@202609230001:91 +service_role@202609230001:92 | 202609180005_desaing_production.sql:123<br>202609230001_desaing_production_copy_edits.sql:2 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_prompt_governed | p_business_id uuid | sí | '' | -PUBLIC,anon@202609180006:44 +authenticated,service_role@202609180006:45 | 202609180006_desaing_prompt_admin.sql:41 | scory_owned | policies, scripts/desaing/real-*-smoke.mjs |
| desaing_private.prompt_admin_access | p_business_id uuid,p_actor_id uuid,p_manage boolean DEFAULT true | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180006:199 | 202609180006_desaing_prompt_admin.sql:55 | scory_owned | interno (desaing_private) |
| desaing_private.prompt_admin_base | p_business_id uuid,p_type text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609180006:199 | 202609180006_desaing_prompt_admin.sql:66 | scory_owned | interno (desaing_private) |
| desaing_prompt_admin_capabilities | p_business_id uuid,p_actor_id uuid | sí | '' | -PUBLIC,anon,authenticated@202609180006:200 +service_role@202609180006:202 | 202609180006_desaing_prompt_admin.sql:74 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_prompt_admin_read | p_business_id uuid,p_actor_id uuid,p_prompt_type text DEFAULT NULL | sí | '' | -PUBLIC,anon,authenticated@202609180006:200 +service_role@202609180006:202 | 202609180006_desaing_prompt_admin.sql:81 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_prompt_admin_item | p_business_id uuid,p_actor_id uuid,p_kind text,p_id uuid | sí | '' | -PUBLIC,anon,authenticated@202609180006:200 +service_role@202609180006:202 | 202609180006_desaing_prompt_admin.sql:99 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_prompt_admin_mutate | p_business_id uuid,p_actor_id uuid,p_kind text,p_request jsonb,p_result jsonb,p_expected_state_revision bigint,p_policy_id text | sí | '' | -PUBLIC,anon,authenticated@202609180006:200 +service_role@202609180006:202 | 202609180006_desaing_prompt_admin.sql:112 | scory_owned | functions: desaing-server/state/pilot (_shared/desaing) |
| desaing_read_continuity | (1) p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text<br>(2) p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_session_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609190001:177 +authenticated@202609190001:179 -PUBLIC,anon,authenticated,service_role@202610080001:190 +authenticated@202610080001:192 | 202609190001_desaing_continuity.sql:22<br>202610080001_design_conversation_sessions.sql:10<br>202610080001_design_conversation_sessions.sql:178 | scory_owned | src: src/lib/presentations/designConversationRemote.ts:47 |
| desaing_commit_continuity | (1) p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb<br>(2) p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202609190001:177 +authenticated@202609190001:179 -PUBLIC,anon,authenticated,service_role@202610080001:190 +authenticated@202610080001:192 | 202609190001_desaing_continuity.sql:38<br>202610080001_design_conversation_sessions.sql:30<br>202610080001_design_conversation_sessions.sql:182 | scory_owned | src: src/lib/presentations/designConversationRemote.ts:53 |
| desaing_private.continuity_target_revision_guard | () | no | '' | -PUBLIC,anon,authenticated,service_role@202609190002:13 | 202609190002_desaing_continuity_guards.sql:3 | scory_owned | trigger; interno (desaing_private) |
| desaing_reset_continuity | p_actor_id uuid, p_business_id uuid, p_kind text, p_document_id text, p_slide_id text, p_expected_revision bigint, p_mutation_id uuid, p_snapshot jsonb, p_session_id text | sí | '' | -PUBLIC,anon,authenticated,service_role@202610080001:260 +authenticated@202610080001:261 | 202610080001_design_conversation_sessions.sql:197 | scory_owned | src: src/lib/presentations/designConversationRemote.ts:59 |
| set_active_business | business_id uuid | sí | public | +authenticated (MX) | E:/MarketXending/.../20260501_set_active_business_rpc.sql:11 | idp_shared | src: src/hooks/useActiveBusiness.ts:32, src/hooks/useInitActiveBusiness.ts:46; scripts/desaing/real-validation-*-close.mjs. Escribe auth.users.raw_app_meta_data |
| user_is_member_of | p_business_id uuid (types.ts) | ? | ? | ? | **ningún repo** (drift) | ambiguous | policies de content_calendar, content_library, design_library, image_library |

Notas:

- `set_updated_at()` se define dos veces: en `20260506` (idéntico a MX) y con `CREATE OR REPLACE` en `20260806_copy_bank_v2.sql:126`. La segunda reemplaza la función que también usan tablas de MX.
- `desaing_read_continuity` y `desaing_commit_continuity` tienen tres versiones. En `202610080001` la firma vieja (5 y 8 argumentos) se redefine como wrapper `sql`, y la nueva lleva `p_session_id`.
- Las funciones de trigger y `update_updated_at_column()` no tienen REVOKE: quedan con EXECUTE para PUBLIC por defecto. No son SECURITY DEFINER.

## 6. Triggers

| trigger | tabla | evento | función | archivo |
|---|---|---|---|---|
| trg_design_campaigns_updated_at | design_campaigns | BEFORE UPDATE | update_design_campaigns_updated_at | 20260424_create_design_campaigns.sql:61 |
| trg_business_tenants_updated_at | business_tenants | BEFORE UPDATE | update_updated_at_column | 20260501_create_business_tenants.sql:39 |
| trg_campaign_categories_updated_at | campaign_categories | BEFORE UPDATE | update_updated_at_column | 20260501_create_campaign_architecture.sql:25 |
| trg_commercial_branches_updated_at | commercial_branches | BEFORE UPDATE | update_updated_at_column | 20260501_create_campaign_architecture.sql:54 |
| trg_industry_verticals_updated_at | industry_verticals | BEFORE UPDATE | update_updated_at_column | 20260501_create_campaign_architecture.sql:85 |
| trg_market_moments_updated_at | market_moments | BEFORE UPDATE | update_updated_at_column | 20260501_create_campaign_architecture.sql:114 |
| trg_design_library_updated_at | design_library | BEFORE UPDATE | set_updated_at | 20260506_create_design_library.sql:108 |
| trg_compliance_sessions_updated_at | compliance_sessions | BEFORE UPDATE | update_updated_at_column | 20260510_compliance_wizard.sql:34 |
| trg_pipeline_runs_updated_at | pipeline_runs | BEFORE UPDATE | update_updated_at_column | 20260520_pipeline_orchestrator_tables.sql:66 |
| trg_pipeline_pieces_updated_at | pipeline_pieces | BEFORE UPDATE | update_updated_at_column | 20260520_pipeline_orchestrator_tables.sql:186 |
| trg_design_sessions_updated_at | design_sessions | BEFORE UPDATE | update_updated_at_column | 20260522_create_design_sessions.sql:42 |
| set_custom_templates_updated_at | custom_templates | BEFORE UPDATE | update_updated_at_column | 20260523_create_custom_templates.sql:58 |
| trg_creative_profiles_auto_version | creative_profiles | BEFORE INSERT | auto_increment_creative_profile_version | 20260524_create_creative_profiles.sql:54 |
| trg_creative_profiles_no_update | creative_profiles | BEFORE UPDATE | prevent_creative_profile_update | 20260524_create_creative_profiles.sql:71 |
| set_template_registry_updated_at | template_registry | BEFORE UPDATE | update_updated_at_column | 20260525_create_template_registry.sql:80 |
| trg_trigger_templates_updated_at | trigger_templates | BEFORE UPDATE | update_updated_at_column | 20260526_create_trigger_templates.sql:55 |
| trg_presentations_updated_at | presentations | BEFORE UPDATE | presentations_set_updated_at | 20260626_presentations_tables.sql:40 |
| trg_brand_disclaimers_updated_at | brand_disclaimers | BEFORE UPDATE | brand_layer_set_updated_at | 20260801_brand_layer_tables.sql:75 |
| trg_promoters_updated_at | promoters | BEFORE UPDATE | brand_layer_set_updated_at | 20260801_brand_layer_tables.sql:80 |
| copy_bank_items_updated_at | copy_bank_items | BEFORE UPDATE | set_updated_at | 20260806_copy_bank_v2.sql:137 |
| trg_news_editions_updated_at | news_editions | BEFORE UPDATE | update_updated_at_column | 20260822_create_news_editions.sql:42 |
| desaing_policy_revision_required | desaing_policies | BEFORE UPDATE | desaing_private.require_policy_revision | 202609170001_desaing_server_foundation.sql:100 |
| desaing_shared_design_budget | desaing_state | BEFORE UPDATE OF SNAPSHOT | desaing_private.guard_shared_design_budget | 202609170002_desaing_exploration_journal.sql:123 |
| desaing_profile_append_only | creative_profiles | BEFORE INSERT OR UPDATE OR DELETE | desaing_private.protect_creative_profile_version | 202609180004_desaing_onboarding.sql:31 |
| desaing_continuity_target_revision_guard | desaing_continuity | BEFORE UPDATE | desaing_private.continuity_target_revision_guard | 202609190002_desaing_continuity_guards.sql:14 |

En `202609260001_desaing_remove_pilot_limits.sql:9-10` se borran `desaing_shared_design_budget` y `desaing_private.guard_shared_design_budget()`.

## 7. Extensiones, cron y realtime

- Repo de ScoryDesign: no tiene `CREATE EXTENSION`, `cron.schedule` ni `ALTER PUBLICATION supabase_realtime`, y `src/` no usa `.channel()` ni `postgres_changes`. `gen_random_uuid()` es nativo de PG 17.
- MarketXending: 6 `CREATE EXTENSION`, 7 `cron.schedule` y 1 publicación realtime en sus migraciones. No se leyeron comandos.
- Desplegado (parte B):

| Tipo | Objetos | ¿De ScoryDesign? |
|---|---|---|
| Extensiones | pg_cron 1.6, pg_net 0.14.0 (schema `public`), pg_stat_statements, pgcrypto, uuid-ossp (`extensions`), supabase_vault, unaccent (`public`), plpgsql | Ninguna la pide ScoryDesign. pgcrypto y uuid-ossp vienen por defecto en el Supabase local |
| Realtime | `supabase_realtime`: solo `public.crm_prospects` | No (MarketXending) |
| cron.job | 1 auto-process-batches (`*/5 * * * *`), 2 check-inactive-tasks (`0 9 * * *`), 5 archive-old-comprobantes (`0 * * * *`), 6 send-weekly-task-report (`0 15 * * 1`); todos activos | No (MarketXending por nombre) |
| Vistas en `public` | 36, ninguna depende de tablas de ScoryDesign (`pg_depend`) | No |

## 8. Storage

| bucket | público (desplegado) | límite / MIME (desplegado) | creado en | clasificación | objetos | bytes | owner | uso |
|---|---|---|---|---|---|---|---|---|
| brand-assets | no | sin límite | 20260521_brand_onboarding_tables.sql:136 | scory_owned | 0 | 0 | - | `BrandOnboardingWizard.tsx:188`, `useConversationalOnboarding.ts:399`. Usan `getPublicUrl` sobre un bucket privado |
| design-images | **sí** | **sin límite ni MIME** | 20260822_design_images_storage_policy.sql:14 y MX `20260425_create_design_images_bucket.sql` | ambiguous → **scory_owned** | 1,327 | 1,609,364,424 (1.50 GiB) | 1,280 del dueño, 47 sin owner (service role) | Bucket principal de la app: 17 llamadas con literal y 21 vía constantes (`MOCKUP_BUCKET`, `NEWS_IMAGE_BUCKET`, `FX_KIT_BUCKET`, `UPLOAD_BUCKET`, `BUCKET`); `desaing-server` |
| desaing-assets | no | 8 MiB; png/jpeg/webp | 202609170001_desaing_server_foundation.sql:228 | scory_owned | 225 | 239,144,303 (228 MiB) | todos sin owner (service role) | desaing-server/pilot (service role) |
| desaing-materials | no | 8 MiB; pdf/txt/md/png | 202609180003_desaing_materials.sql:94 | scory_owned | 2 | 2,715,730 | sin owner | desaing-server |
| desaing-conversation-references | no | 8 MiB; png | 202609190001_desaing_continuity.sql:182 | scory_owned | 23 | 7,359,870 | 23 del dueño | `src/lib/presentations/designConversationRemote.ts:73` |
| Brand | **sí** | **sin límite ni MIME** | **ninguna migración** (creado 2026-04-25) | ambiguous → **scory_owned** | 5 (en la raíz) | 2,843,511 | sin owner | URLs firmadas en 7 archivos; `useBrandLogos.ts:26` (list y sign) |
| pipeline-renders | **no existe** | - | **ninguna migración** | ambiguous | - | - | - | `render-design-png/index.ts:40`, `useMultichannelPieces.ts:78`. Falla también en el compartido |
| templates | **no existe** | - | **ninguna migración** | ambiguous | - | - | - | `hydrate-templates/index.ts:55` (download). Falla también en el compartido |
| market-screenshots | no | sin límite | ninguna migración de ScoryDesign (creado 2026-04-30) | marketxending_owned (por nombre; sin uso en el repo) | 0 | 0 | - | no se usa |
| kyc, invoices, pdfs, fiscal-documents, task-files (público) | kyc/invoices/pdfs/fiscal no; task-files sí | sin límite | MarketXending | marketxending_owned | 47 en total | 28.3 MB | fiscal-documents tiene 2 objetos de un owner distinto del dueño | no se usan |

Total a copiar (6 buckets existentes de ScoryDesign): **1,582 objetos, 1,861,427,838 bytes (≈1.73 GiB)**. Ningún objeto de esos buckets tiene un owner distinto del dueño.

Primer segmento del path (desplegado): `design-images` tiene 1,011 objetos bajo un `business_id` de `business_tenants`, 182 bajo `presentations/`, 126 bajo `xending/`, 6 bajo `brand-icons/` y 2 bajo `xending_capital/`. `desaing-assets` (225) y `desaing-materials` (2) van bajo `business_id`. `desaing-conversation-references` (23) va bajo un UUID que no es tenant (la policy compara con `auth.uid()`; no se verificó el valor). `Brand` (5) está en la raíz.

Policies de `storage.objects` en el repo de ScoryDesign:

| policy | cmd | roles | tipo | bucket | auth.uid() | membership | archivo |
|---|---|---|---|---|---|---|---|
| Business members can manage brand assets | ALL | authenticated | permissive | brand-assets | sí | sí | 20260521_brand_onboarding_tables.sql:142 |
| Business members can manage design images | ALL | authenticated | permissive | design-images | sí | sí | 20260822_design_images_storage_policy.sql:19 |
| desaing_assets_authenticated_read | SELECT | authenticated | permissive | desaing-assets | no | no | 202609170001_desaing_server_foundation.sql:233 |
| desaing_assets_registered_read | SELECT | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609170001_desaing_server_foundation.sql:237 |
| desaing_assets_no_client_insert | INSERT | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609170001_desaing_server_foundation.sql:251 |
| desaing_assets_no_client_update | UPDATE | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609170001_desaing_server_foundation.sql:253 |
| desaing_assets_no_client_delete | DELETE | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609170001_desaing_server_foundation.sql:255 |
| desaing_assets_no_anonymous_access | ALL | anon | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609170001_desaing_server_foundation.sql:257 |
| desaing_materials_no_client_access | ALL | anon, authenticated | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609180003_desaing_materials.sql:99 |
| desaing_conversation_reference_read | SELECT | authenticated | permissive | desaing-conversation-references | sí | no | 202609190001_desaing_continuity.sql:185 |
| desaing_conversation_reference_insert | INSERT | authenticated | permissive | desaing-conversation-references | sí | no | 202609190001_desaing_continuity.sql:188 |
| desaing_conversation_reference_read_guard | SELECT | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | sí | no | 202609190001_desaing_continuity.sql:194 |
| desaing_conversation_reference_insert_guard | INSERT | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | sí | no | 202609190001_desaing_continuity.sql:197 |
| desaing_conversation_reference_no_update | UPDATE | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609190001_desaing_continuity.sql:201 |
| desaing_conversation_reference_no_delete | DELETE | authenticated | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609190001_desaing_continuity.sql:203 |
| desaing_conversation_reference_no_anon | ALL | anon | RESTRICTIVE | (guard por bucket_id <> …) | no | no | 202609190001_desaing_continuity.sql:205 |

Notas:

- `design-images` y `brand-assets` exigen que la primera carpeta del path sea un `business_id` del que el usuario sea miembro.
- `useBrandLogos` sube y lista en `design-images/brand-icons/`, fuera de esa regla. Según `.agents/tasks/design-security-isolation/design.md:199`, eso funciona por policies desplegadas que no están en el repo (drift; Q1 de la parte B).
- Las RESTRICTIVE de `desaing-*` usan la forma `bucket_id <> 'x' OR …`, así que no afectan a otros buckets.

Policies de `storage.objects` desplegadas (43 en total): las 16 del repo están desplegadas tal cual. Además hay estas, que no están en el repo de ScoryDesign:

| policy | cmd | roles | bucket | auth.uid() | membership | comentario |
|---|---|---|---|---|---|---|
| Public read access for design images | SELECT | public | design-images | no | no | Lectura anónima (el bucket ya es público) |
| Authenticated users can upload design images | INSERT | authenticated | design-images | no | no | **Cualquier usuario autenticado del proyecto** puede subir en cualquier carpeta. Explica `brand-icons/` (Q1) |
| Authenticated users can delete design images | DELETE | authenticated | design-images | no | no | **Cualquier usuario autenticado puede borrar cualquier objeto** de design-images |
| Authenticated users can upload mockups | INSERT | authenticated | design-mockups | no | no | El bucket `design-mockups` no existe |
| Public can view mockups | SELECT | public | design-mockups | no | no | El bucket `design-mockups` no existe |
| 22 policies de kyc, invoices, pdfs, fiscal-documents y task-files | varios | public | MX | 4 con uid | no | MarketXending; varias (`pdfs`, `task-files`, `invoices`, `fiscal-documents`, parte de `kyc`) no usan `auth.uid()` y van a `public` |

`Brand` no tiene ninguna policy: es público para leer y solo la service role puede escribir.

## 9. Edge Functions (35)

Columnas:

- SR = el código usa la service role.
- getUser = valida al usuario con `auth.getUser`.
- shared = número de módulos de `_shared` alcanzados.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los pone la plataforma.

| función | verify_jwt | SR | getUser | secretos (nombres) | tablas | buckets | proveedor externo | llama a | shared | invocada desde src | clasificación | en alcance |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| adapt-channel | false | sí | no | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, master_prompts | - | openai | - | 3 | -<br>por función: pipeline-orchestrator | ambiguous | **pendiente** |
| analyze-brand-assets | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | user_business_memberships | - | openai | - | 1 | src/components/onboarding/useConversationalOnboarding.ts:111 | scory_owned | sí |
| analyze-image-reference | true (default) | sí | no | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, master_prompts | - | openai | - | 2 | - | scory_owned | **pendiente** |
| brand-onboarding | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | brand_onboarding_sessions, business_tenants, user_business_memberships | - | openai | - | 6 | src/components/brand-onboarding/BrandOnboardingWizard.tsx:213<br>src/components/brand-onboarding/BrandOnboardingWizard.tsx:264 | scory_owned | sí |
| compliance-wizard | true | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | 8 tablas | - | openai | - | 2 | src/store/complianceWizardStore.ts:76<br>src/store/complianceWizardStore.ts:198 | scory_owned | sí |
| desaing-pilot | false | sí | no | DESAING_PILOT_ACTOR_ID, DESAING_PILOT_BUSINESS_ID, DESAING_PILOT_ENABLED, DESAING_PILOT_EXPIRES_AT_MS, DESAING_PILOT_POLICY_ID, DESAING_PILOT_SUPABASE_ORIGIN, DESAING_PILOT_TOKEN, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | - | desaing-assets | openai | - | 29 | - | scory_owned | sí |
| desaing-server | true | sí | sí | DESAING_ALLOWED_ORIGINS, DESAING_EXPLORATION_ENABLED, DESAING_PILOT_SUPABASE_ORIGIN, DESAING_PROMPT_ADMIN_ENABLED, DESAING_SERVER_ENABLED, DESAING_UI_EXECUTOR, DESAING_UI_GENERATION_ENABLED, OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | design_feedback | desaing-assets, desaing-materials, design-images | openai | - | 63 | src/components/presentations/PresentationDesignContext.tsx:36<br>src/lib/desaing/sharedImageGeneration.ts:12 (+1)<br>por función: generate-design-image | scory_owned | sí |
| desaing-state | true | sí | sí | DESAING_ALLOWED_ORIGINS, DESAING_PILOT_SUPABASE_ORIGIN, DESAING_SERVER_ENABLED, DESAING_UI_EXECUTOR, DESAING_UI_GENERATION_ENABLED, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | - | - | - | - | 19 | src/components/presentations/PresentationDesignContext.tsx:37<br>src/lib/desaing/sharedImageGeneration.ts:13 (+1) | scory_owned | sí |
| evolution-summary | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | creative_profiles, learning_deltas, user_business_memberships | - | openai | - | 1 | src/hooks/useEvolutionSummary.ts:41 | scory_owned | sí |
| generate-carousel-plan | true (default) | sí | sí | COPY_KIT_SOURCE, OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | 7 tablas | - | openai | - | 32 | src/hooks/useCarouselPlan.ts:94 | scory_owned | sí |
| generate-carousel-script | true | sí | sí | COPY_KIT_SOURCE, OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | 8 tablas | - | openai | - | 26 | src/hooks/useCarouselQueue.ts:668 | scory_owned | sí |
| generate-copy-v2 | true (default) | sí | no | COPY_KIT_SOURCE, COPY_V2_MODEL, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | copy_bank_items, copy_kits | - | openai | - | 14 | - | scory_owned | **pendiente** |
| generate-design-copy | false | no | no | OPENAI_API_KEY | - | - | openai | - | 1 | src/hooks/useGenerateCopy.ts:25 | ambiguous | **pendiente** |
| generate-design-html | false | sí | sí | OPENAI_API_KEY, SLIDE_FIX_MODEL, SLIDE_MODEL, SLIDE_REVIEW_MODEL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, creative_profiles, master_prompts | Brand | openai | - | 14 | src/hooks/useGenerateDesignHtml.ts:45<br>src/hooks/useGenerateDesignHtmlFromMockup.ts:21 (+2) | ambiguous | **pendiente** |
| generate-design-image | false | sí | sí | MASTER_IMAGE_PROMPT_SOURCE, MASTER_IMAGE_PROMPT_VERSION, OPENAI_API_KEY, PHOTO_STYLE, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | 9 tablas | desaing-assets | openai | desaing-server | 34 | src/hooks/useCarouselQueue.ts:1036<br>src/hooks/useCarouselQueue.ts:1190 (+3)<br>por función: pipeline-orchestrator | ambiguous | **pendiente** |
| generate-design-mockups | false | no | sí | SUPABASE_ANON_KEY, SUPABASE_URL | business_tenants, design_feedback | - | openai | - | 2 | - | scory_owned | **pendiente** |
| generate-fx-daily | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | user_business_memberships | - | banxico, openai | - | 9 | src/hooks/useFxDaily.ts:78 | scory_owned | sí |
| generate-ideas | false | sí | no | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | 8 tablas | - | openai | - | 6 | src/hooks/useGenerateIdeas.ts:53<br>src/components/CopyWorkstation.tsx:612<br>por función: pipeline-orchestrator | ambiguous | **pendiente** |
| generate-news-plan | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | user_business_memberships | - | openai | - | 5 | src/hooks/useNewsEdition.ts:369 | scory_owned | sí |
| generate-news-visuals | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | user_business_memberships | - | banxico, openai | - | 7 | src/hooks/useNewsEdition.ts:405 | scory_owned | sí |
| generate-strategy | false | sí | no | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, campaign_categories, master_prompts | - | openai | - | 2 | src/hooks/useGenerateStrategy.ts:32<br>por función: pipeline-orchestrator | ambiguous | **pendiente** |
| generate-variants | false | sí | no | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, master_prompts | - | openai | - | 4 | src/hooks/useGenerateVariants.ts:64 | ambiguous | **pendiente** |
| hydrate-templates | true (default) | sí | no | SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | 6 tablas | templates | - | - | 3 | -<br>por función: pipeline-orchestrator, render-multichannel | scory_owned | sí |
| interpret-feedback | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | creative_profiles, learning_deltas, user_business_memberships | - | openai | - | 1 | src/components/design-studio/MockupIterationChat.tsx:94<br>src/hooks/useDesignFeedback.ts:223 | scory_owned | sí |
| pipeline-orchestrator | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | 10 tablas | - | openai | dinámico | 5 | src/store/pipelineStore.ts:193<br>src/store/pipelineStore.ts:212 (+2)<br>por función: quick-fire | scory_owned | sí |
| quick-fire | true (default) | sí | sí | SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | 10 tablas | - | banxico | pipeline-orchestrator | 2 | src/components/pipeline/QuickFirePanel.tsx:197 | scory_owned | sí |
| refine-branch | false | sí | no | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, master_prompts | - | openai | - | 2 | src/hooks/useRefineBranch.ts:12 | ambiguous | **pendiente** |
| refine-image-prompt | true (default) | no | no | OPENAI_API_KEY | - | - | openai | - | 1 | - | scory_owned | **pendiente** |
| render-design-png | false | sí | no | RENDER_SERVICE_TOKEN, RENDER_SERVICE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | pipeline_pieces | pipeline-renders | render_service | - | 0 | -<br>por función: pipeline-orchestrator, render-multichannel | ambiguous | **pendiente** |
| render-multichannel | true (default) | sí | sí | SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | pipeline_runs, user_business_memberships | - | - | hydrate-templates, render-design-png | 0 | src/hooks/useRenderMultichannel.ts:71 | scory_owned | sí |
| scrape-brand-presence | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | user_business_memberships | - | openai, scory.design | - | 1 | src/components/onboarding/useConversationalOnboarding.ts:128 | scory_owned | sí |
| suggest-copy | true (default) | sí | no | COPY_MODEL, OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, master_prompts | - | openai | - | 2 | src/hooks/useSuggestCopy.ts:33 | scory_owned | sí |
| suggest-image-ideas | true (default) | sí | no | OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, master_prompts | - | openai | - | 2 | - | scory_owned | **pendiente** |
| translate-text | true (default) | no | no | OPENAI_API_KEY, TRANSLATE_MODEL | - | - | openai | - | 1 | src/pages/PresentationsPage.tsx:211 | scory_owned | sí |
| validate-claim | true (default) | no | sí | OPENAI_API_KEY, SUPABASE_ANON_KEY, SUPABASE_URL | business_angles, business_channels, business_tenants, master_prompts, user_business_memberships | - | openai | - | 3 | -<br>por función: pipeline-orchestrator | scory_owned | sí |

Otras observaciones:

- `config.toml` no tiene entradas sin carpeta. Las 20 carpetas sin entrada usan `verify_jwt=true` por defecto.
- `src/hooks/useBranchChat.ts:49` invoca `branch-chat`, que solo existe en `E:\MarketXending\supabase\functions` (marketxending_owned usada por ScoryDesign).
- Nombres de secretos (unión): COPY_KIT_SOURCE, COPY_MODEL, COPY_V2_MODEL, DESAING_ALLOWED_ORIGINS, DESAING_EXPLORATION_ENABLED, DESAING_PILOT_ACTOR_ID, DESAING_PILOT_BUSINESS_ID, DESAING_PILOT_ENABLED, DESAING_PILOT_EXPIRES_AT_MS, DESAING_PILOT_POLICY_ID, DESAING_PILOT_SUPABASE_ORIGIN, DESAING_PILOT_TOKEN, DESAING_PROMPT_ADMIN_ENABLED, DESAING_SERVER_ENABLED, DESAING_UI_EXECUTOR, DESAING_UI_GENERATION_ENABLED, MASTER_IMAGE_PROMPT_SOURCE, MASTER_IMAGE_PROMPT_VERSION, OPENAI_API_KEY, PHOTO_STYLE, RENDER_SERVICE_TOKEN, RENDER_SERVICE_URL, SLIDE_FIX_MODEL, SLIDE_MODEL, SLIDE_REVIEW_MODEL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, TRANSLATE_MODEL.
- `pipeline-orchestrator` llama por HTTP a `${SUPABASE_URL}/functions/v1/${functionName}` (`lib/executeStep.ts:155`) con los pasos de `lib/runPipeline.ts:159-213`.
- `render-multichannel` llama a `hydrate-templates` y `render-design-png`. `quick-fire` llama a `pipeline-orchestrator`.
- `generate-design-image` llama a `desaing-server` (`_shared/desaing/pipelineImageBridge.ts:117`).
- `desaing-server` y `desaing-state` comparan `DESAING_PILOT_SUPABASE_ORIGIN` con `SUPABASE_URL`. En local, `SUPABASE_URL` dentro del edge runtime es la URL interna, así que hay que ajustarlo en la Fase 6.

## 10. Veredicto de las 9 funciones duplicadas

Se buscó cada nombre como literal (`functions.invoke`, `invokeWithRetry`, `/functions/v1/<nombre>`, tablas de pasos del orquestador y `config.toml`) en `src`, `supabase/functions`, `scripts`, `renderer`, `artifacts`, `experiments` y `supabase/tests`. Todas tienen llamador en el repo, así que **ninguna se puede declarar "no usada"**.

| función | veredicto | evidencia | alcanzable desde rutas de `App.tsx` |
|---|---|---|---|
| generate-design-image | **usada** | `src/pages/DesignStudioPage.tsx:556`, `src/hooks/useCarouselQueue.ts:1036/1190`, `src/hooks/useGenerateImage.ts:98`, `src/lib/desaing/sharedImageGeneration.ts:30`; `pipeline-orchestrator/lib/runPipeline.ts:183/191` | sí (`/design-studio` → CarouselPanel) |
| generate-design-html | **usada** | `src/hooks/useGenerateDesignHtmlFromMockup.ts:21` (← DesignStudioPage), `src/hooks/useGenerateSlide.ts:55` (← SlideGeneratorPanel ← PresentationsPage), `src/hooks/useGenerateDesignHtml.ts:45` | sí (`/design-studio`, `/presentations`) |
| generate-ideas | indeterminable | `src/components/CopyWorkstation.tsx:612`, `src/hooks/useGenerateIdeas.ts:53`; `runPipeline.ts:167` | no: CopyWorkstation ← CampaignWizardPage, que se desruteó (`App.tsx:58-76`). `useGenerateIdeas` no tiene importador |
| generate-strategy | indeterminable | `src/hooks/useGenerateStrategy.ts:32` (← StrategyPlanner ← CampaignWizardPage); `runPipeline.ts:159` | no |
| generate-design-copy | indeterminable | `src/hooks/useGenerateCopy.ts:25` (← CopyProposalList, sin importador) | no |
| generate-variants | indeterminable | `src/hooks/useGenerateVariants.ts:64` (hook sin importador) | no |
| refine-branch | indeterminable | `src/hooks/useRefineBranch.ts:12` (← BranchRefiner, sin importador) | no |
| adapt-channel | indeterminable | `supabase/functions/pipeline-orchestrator/lib/runPipeline.ts:199` vía `executeStep.ts:155` (← `src/store/pipelineStore.ts:193`) | no: pipelineStore solo se importa desde componentes desruteados o huérfanos |
| render-design-png | indeterminable | `runPipeline.ts:213`, `supabase/functions/render-multichannel/index.ts:353` (← `src/hooks/useRenderMultichannel.ts:71` ← CopyWorkstation) | no |

Además:

- `scripts/desaing/deploy-prompt-admin.ps1:8` despliega 6 de ellas al compartido (ver §16).
- Recomendación para decidir en la Fase 2: servir en local `generate-design-image` y `generate-design-html`. Las otras 7 se pueden dejar fuera, con el riesgo de que falle el código desruteado si se vuelve a enrutar. La parte B puede confirmar con logs o invocaciones recientes del compartido.

## 11. Auth que usa la app

| Tema | Evidencia |
|---|---|
| Cliente | `src/integrations/supabase/client.ts:14`: `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, { auth: { storage: localStorage, persistSession: true, autoRefreshToken: true } })`. Sin `storageKey` propio: la sesión se guarda por proyecto (`sb-<ref>-auth-token`), así que local y compartido no se pisan |
| Login | email y password (`signInWithPassword`: `AuthGate.tsx:41/89`, `useAuth.ts:107`). Sin OAuth, OTP ni magic link |
| Auto-login | `AuthGate.tsx:37-41` usa `VITE_AUTH_EMAIL` y `VITE_AUTH_PASSWORD` si existen (ver §16) |
| Alta | `useAuth.ts:80` `signUp` con `emailRedirectTo` |
| Reset | `useAuth.ts:150` `resetPasswordForEmail`, `redirectTo: ${origin}/auth?mode=reset`. No hay ruta `/auth` en `App.tsx` |
| Sesión | `getSession` (20 en 17 archivos), `getUser` (7), `onAuthStateChange` (`useAuth.ts:50`), `signOut` (`useAuth.ts:128`) |
| Negocio activo | RPC `set_active_business` (`useActiveBusiness.ts:32`, `useInitActiveBusiness.ts:46`): escribe `auth.users.raw_app_meta_data`. El usuario local necesita esa RPC o un equivalente |
| Edge Functions | 20 validan con `auth.getUser`. Las desaing exigen JWT y membership en el handler |
| Necesario en local | `site_url` y `additional_redirect_urls` con `http://127.0.0.1:3000` (Vite de `dev:local`) y `local_smtp` para alta y reset |

## 12. Resumen de supabase-js en `src/`

- `.from()`: el detalle por tabla está en la columna "usos en src" de §4.
- Nombres dinámicos ya resueltos:
  - `TABLE` es `brand_disclaimers` (`useBrandDisclaimers.ts:27`) o `promoters` (`usePromoters.ts:13`).
  - Los buckets `BUCKET`, `MOCKUP_BUCKET`, `NEWS_IMAGE_BUCKET`, `UPLOAD_BUCKET` y `FX_KIT_BUCKET` valen `design-images`.
  - `bucket` vale `Brand` o `design-images` (`useBrandLogos.ts:25`), `pipeline-renders` (`useMultichannelPieces.ts:78`) o `desaing-conversation-references` (`designConversationRemote.ts:10`).
- Storage por método: upload, getPublicUrl, download, list, createSignedUrl(s) y remove. `getPublicUrl` aparece sobre `brand-assets` (privado) y `pipeline-renders` (desconocido).
- RPC: `set_active_business` (2) y `desaing_read_continuity`, `desaing_commit_continuity` y `desaing_reset_continuity` (`designConversationRemote.ts:47-59`). `usePromptGovernance.ts:20` llama un RPC con nombre casteado.
- `functions.invoke` tiene 19 nombres literales y un call site dinámico (`src/lib/supabase-retry.ts:35`). Este último se resuelve a brand-onboarding, quick-fire, generate-ideas, generate-variants, render-multichannel y pipeline-orchestrator.
- HTTP directo:
  - `${VITE_SUPABASE_URL}/functions/v1/desaing-server|desaing-state` (`PresentationDesignContext.tsx:36-37`, `sharedImageGeneration.ts:12-13`).
  - `compliance-wizard` (`complianceWizardStore.ts:198`).
  - URLs públicas armadas a mano: `/storage/v1/object/public/design-images/` (`useDesignMockups.ts:293/301`, `serverClient.ts:297`, `fxDailyKit.ts:241`).
- Variables `import.meta.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_EMAIL`, `VITE_AUTH_PASSWORD`, `VITE_DEPLOYMENT_MODE`, `VITE_DESAING_SERVER_ENABLED`, `VITE_DESAING_EXPLORATION_ENABLED`, `VITE_DESAING_PROMPT_ADMIN_ENABLED`, `DEV` y `PROD`.

## 13. URLs del Storage compartido

En el repo (host `<PROJECT_REF_COMPARTIDO>.supabase.co`):

| archivo | ocurrencias |
|---|---|
| src/constants/bulletinTemplates.ts:9 | 1 sign/Brand |
| src/constants/designTemplates.ts:27 | 1 sign/Brand |
| src/constants/presentationTemplates.ts:19 | 1 sign/Brand |
| src/constants/presentationTemplates_v2.ts:12, :21, :5991 | 1 sign/Brand, 2 public/design-images |
| src/utils/design-studio/buildFxDailyHtml.ts:32 | 1 sign/Brand |
| src/utils/design-studio/buildNewsSlideHtml.ts:25 | 1 sign/Brand |
| supabase/functions/generate-design-html/index.ts:17 | 1 sign/Brand |

El ref compartido aparece además, sin URL de Storage, en:

- `scripts/desaing/` (8 archivos, incluido `deploy-prompt-admin.ps1` y `supabase-query.ps1`).
- `docs/` (4 archivos).
- `supabase/functions/_shared/desaing/__tests__/liveExecution.test.ts`.

Las migraciones y seeds no traen URLs del Storage compartido.

Columnas que podrían guardar URLs o paths del Storage (candidatas; el conteo real con `LIKE '%<ref>.supabase.co/storage%'` queda para la parte B):

| tabla | columnas |
|---|---|
| asset_snapshots | asset_type:text, asset_id:text, metadata:jsonb |
| brand_assets | filename:text, storage_path:text, extraction_output:jsonb |
| brand_onboarding_sessions | uploaded_files:jsonb |
| business_tenants | logo_url:text |
| compliance_messages | metadata:jsonb |
| compliance_rule_versions | rules_snapshot:jsonb |
| content_library | image_type:text |
| copy_bank_items | image_meta:jsonb |
| creative_profiles | preferences:jsonb |
| custom_templates | html_template:text, thumbnail_url:text, source_mockup_url:text |
| desaing_brand_drafts | snapshot:jsonb |
| desaing_brand_revisions | snapshot:jsonb |
| desaing_continuity | snapshot:jsonb |
| desaing_explorations | result:jsonb |
| desaing_material_collections | snapshot:jsonb |
| desaing_material_revisions | snapshot:jsonb |
| desaing_policies | enabled_image_profiles:text[] |
| desaing_production_snapshots | snapshot:jsonb |
| desaing_prompt_admin_drafts | snapshot:jsonb |
| desaing_prompt_admin_history | snapshot:jsonb |
| desaing_prompt_admin_reviews | snapshot:jsonb |
| desaing_prompt_admin_tests | snapshot:jsonb |
| desaing_state | snapshot:jsonb |
| design_images | storage_path:text |
| design_library | html_content:text, rendered_url:text, promoter_photo:text |
| design_mockups | image_url:text |
| design_pieces | html_content:text, png_url:text |
| design_sessions | reference_image_url:text, reference_description:text, current_html:text, html_history:jsonb |
| image_library | image_url:text, image_base64:text, image_type:text, image_intent:text |
| industry_verticals | visual_context:text |
| interaction_log | metadata:jsonb |
| news_editions | visual_plan:jsonb, slides:jsonb |
| pipeline_pieces | image_intent:text, image_type:text, image_prompt:text, image_storage_path:text, image_iterations:jsonb, visual_tone:text, html_content:text, png_storage_path:text |
| pipeline_runs | strategy_output:jsonb, content_output:jsonb, validation_output:jsonb |
| pipeline_steps | output:jsonb |
| presentations | slides:jsonb |
| promoters | photo_url:text, qr_url:text |
| template_registry | visual_tone:text, html_template:text, preview_url:text |
| trigger_templates | image_strategy:text |
| generated_ideas | piece_v2:jsonb, image_suggestion:text (types.ts) |

Además, `business_tenants.logo_url` y los JSON con `imageUrl` (`copy_bank_items.image_meta`, `generated_ideas.piece_v2`, `desaing_*.snapshot`).

## 14. Drift repo vs desplegado

Confirmado en la parte B (catálogos del compartido; columnas comparadas con un parser de `CREATE TABLE`/`ALTER TABLE` del repo):

| Tipo | Drift |
|---|---|
| Tablas del repo **no desplegadas** | `asset_snapshots`, `custom_templates`, `interaction_log`, `learning_deltas`, `template_registry`, `trigger_templates` (6 scory_owned). El código que las usa (`useMemoryTimeline`, `hydrate-templates`, `quick-fire`, `evolution-summary`, `interpret-feedback`, `pipeline-orchestrator`) falla hoy en el compartido |
| Tablas desplegadas que no están en el repo | Ninguna: las 149 de `public` están en el inventario (62 de ScoryDesign/IdP + 87 MX) |
| Columnas solo desplegadas | `commercial_branches.prompt_kit` (jsonb), `commercial_branches.branch_type` (text, default `'product'`), `design_campaigns.branch_data` (jsonb) |
| `generated_ideas` | Desplegada con 14 columnas, 4 FKs (business_tenants, commercial_branches, industry_verticals, market_moments), RLS activo y 4 policies con `user_is_member_of`. El repo solo tiene un `ALTER` (`piece_v2`) |
| Tipos de columna | Sin diferencias en las 59 tablas comparables |
| Identity, columnas generadas y secuencias | Ninguna en las 62 tablas |
| Policies | Desplegadas 123 de tablas (sin `profiles`, `user_roles` ni `extended_user_roles`). Faltan las 11 de las 6 tablas no desplegadas y `creative_profiles."Users can manage own creative profiles"`. `user_business_memberships` tiene `Users can view their own memberships` (solo `auth.uid()`) en lugar de `Members can view memberships of their businesses` (la recursiva de R5). Las SELECT de `business_tenants`, `business_angles`, `business_channels`, `campaign_categories`, `commercial_branches`, `industry_verticals`, `market_moments`, `master_prompts` y "Business members can view…" de `design_campaigns`, `design_images` y `design_pieces` usan `user_is_member_of()` en vez de la subconsulta del repo |
| Triggers | 20 desplegados. Faltan los 4 de las tablas no desplegadas y `trg_creative_profiles_auto_version` y `trg_creative_profiles_no_update` (con sus funciones `auto_increment_creative_profile_version` y `prevent_creative_profile_update`). `desaing_shared_design_budget` ya no está, como indica 202609260001 |
| Funciones | Las 2 que ningún repo crea existen: `user_is_member_of(p_business_id uuid)` y `set_active_business(business_id uuid)`, ambas SECURITY DEFINER, `search_path=public` y EXECUTE para PUBLIC/anon/authenticated. Las 31 `desaing_*` de `public` y las 11 de `desaing_private` coinciden con el repo en firma, definer, `search_path=""` y EXECUTE |
| Grants de tablas | Las tablas `desaing_*` y `creative_profiles` tienen los REVOKE del repo. Las otras 42 (incluidas IdP) conservan el default de Supabase: ALL para anon, authenticated y service_role. Solo las protege RLS (activo en todas) |
| FKs entrantes | Ninguna tabla de MarketXending tiene FK hacia tablas de ScoryDesign o IdP, y ninguna vista depende de ellas |
| Buckets | `Brand` existe (público, sin migración); `pipeline-renders` y `templates` **no existen** |
| Storage policies | 5 de `design-images`/`design-mockups` sin migración (§8) |
| Ledger | §22 |

## 15. Otros componentes

| Componente | Qué hace | Relación con Supabase |
|---|---|---|
| `renderer/` | Node + Puppeteer (`scripts/render-server.js`, puerto 3333; `HOST=127.0.0.1` en dev y `0.0.0.0` con `NODE_ENV=production`). `Dockerfile` en `node:20-slim` con Chromium, poppler y LibreOffice; usuario no root y healthcheck; sin read_only ni cap_drop | `renderer-access.js:28-40`: en producción valida la sesión con `/auth/v1/user` y `/rest/v1/rpc/desaing_business_role` usando `SUPABASE_URL` o `VITE_SUPABASE_URL` y la anon key. `RENDER_SERVICE_TOKEN` es opcional. `render-design-png` lo llama con `RENDER_SERVICE_URL` y `RENDER_SERVICE_TOKEN` |
| `scripts/dev-local.mjs` | Levanta el renderer en el host (`127.0.0.1:3333`) y Vite en `127.0.0.1:3000` | `local-document-container.js` usa Docker para PPTX (`PPTX_RENDER_IMAGE`, `DOCKER_HOST`) |
| `scripts/desaing/*` | Smokes y releases contra el proyecto compartido | `deploy-prompt-admin.ps1` hace **`functions deploy` de 14 funciones con `--project-ref` fijo al compartido**. `supabase-query.ps1` lee el login de la CLI del Credential Manager y ejecuta SQL (con `-Write`) contra el compartido. `real-*-smoke.mjs` y `real-validation-*.mjs` llaman a auth, rest y functions del compartido |
| `scripts/desaing/preflight.mjs` | Chequeo local de configuración | Lee `.env`, `.env.desaing.local` y `.env.desaing-pilot.local`, y `supabase/.temp/project-ref`. Fija un business y un actor aprobados (`approvedPins`) |
| `supabase/tests/desaing-bootstrap.sql` | Esquema mínimo para PGlite en tests | Dice que las policies "legacy" de memberships tienen recursión |
| `experiments/presentations` | Vite de pruebas con transportes falsos | `envPrefix` `PRESENTATIONS_TEST_PUBLIC_` |

Variables de entorno (solo nombres):

- `.env.example`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, `RENDER_SERVICE_URL`, `RENDER_SERVICE_TOKEN`.
- `.env.desaing-server.example`: `DESAING_SERVER_ENABLED`, `DESAING_ALLOWED_ORIGINS`, `DESAING_UI_GENERATION_ENABLED`, `DESAING_UI_EXECUTOR`, `DESAING_UI_EXPIRES_AT_MS`, `DESAING_EXPLORATION_ENABLED`, `DESAING_EXPLORATION_EXPIRES_AT_MS`, `DESAING_PROMPT_ADMIN_ENABLED`, `DESAING_PILOT_BUSINESS_ID`, `DESAING_PILOT_ACTOR_ID`, `DESAING_PILOT_POLICY_ID`, `DESAING_PILOT_SUPABASE_ORIGIN`.
- `.env.desaing.example`: `DESAING_SERVER_ENABLED`, `DESAING_LIVE_EXECUTION_ENABLED`, `DESAING_TARGET_SUPABASE_URL`, `DESAING_TARGET_SUPABASE_ANON_KEY`, `DESAING_TARGET_SUPABASE_SERVICE_ROLE_KEY`, `DESAING_ALLOWED_ORIGINS`, `OPENAI_API_KEY`, `DESAING_RESPONSES_MODEL`, `DESAING_RESPONSES_MAX_OUTPUT_TOKENS`, `DESAING_PILOT_*`, `DESAING_APPROVED_BUDGET_MICRO_USD`, `DESAING_RESERVATION_PER_OUTPUT_MICRO_USD`, `DESAING_PILOT_MAX_IMAGE_OUTPUTS`, `DESAING_PILOT_EXPIRES_AT`.
- Renderer (`process.env`): `PORT`, `HOST`, `NODE_ENV`, `RENDER_SERVICE_TOKEN`, `MAX_CONCURRENT`, `PUPPETEER_EXECUTABLE_PATH`, `PDFINFO_BIN`, `PDFTOPPM_BIN`, `LIBREOFFICE_BIN`, `PPTX_RENDER_IMAGE`, `DOCKER_HOST`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Edge Functions: ver §9.

`DESAING_TARGET_SUPABASE_SERVICE_ROLE_KEY`:

- Solo la lee `scripts/desaing/preflight.mjs:106-107`, que comprueba que exista en `.env.desaing.local`.
- En `.env.desaing.example:7` va **vacía** (sin valor real).
- No llega al bundle: el `vite.config.ts` principal usa el prefijo por defecto `VITE_`, y los demás configs usan `DESAING_LAB_PUBLIC_` o `PRESENTATIONS_TEST_PUBLIC_`.
- Por diseño apunta a un proyecto **aislado distinto** del de la app (check `separate_https_target` de `preflight.mjs`), no al compartido.

## 16. Riesgos y hallazgos

| # | Hallazgo | Evidencia | Impacto en la separación |
|---|---|---|---|
| R1 | `supabase\.temp` está vinculado al compartido: `project-ref`, `linked-project.json` y `pooler-url`. La carpeta está ignorada por git (`.gitignore:22`) | `Get-ChildItem supabase\.temp` (solo nombres) | Cualquier `db push` o `functions deploy` pega en el compartido. Respaldar y hacer `unlink` antes del primer comando de Supabase (requiere OK) |
| R2 | Hay scripts que despliegan o escriben en el compartido | `scripts/desaing/deploy-prompt-admin.ps1:4,15` y `supabase-query.ps1:6` (`-Write`) | No ejecutarlos. El validador de la Fase 4 debe bloquear el ref compartido en scripts nuevos |
| R3 | URLs firmadas del bucket `Brand` del compartido, con token vigente hasta 2027-04-25, en código trackeado y en el bundle | 7 archivos (§13) | Se pueden leer esos objetos con el token. En local hay que copiar `Brand` y reescribir las URLs; rotar es decisión del dueño |
| R4 | Auto-login con `VITE_AUTH_EMAIL` y `VITE_AUTH_PASSWORD` | `src/components/AuthGate.tsx:37-38` | Si el `.env` los define, la contraseña del dueño queda en el JS compilado. No abrí el `.env` para confirmarlo |
| R5 | Policies tautológicas o rotas en las tablas del IdP | `20260501_create_business_tenants.sql:77,99,114` (`ubm.business_id = id` se resuelve contra `ubm.id`) y `:134,148,163,178` (`x.business_id = business_id` es una tautología y además recursiva) | No replicarlas tal cual en local: con un solo usuario no fugan datos, pero las SELECT recursivas fallan. Decidir en la Fase 2 |
| R6 | 11 funciones con `verify_jwt=false` | `config.toml` | 6 usan la service role sin `getUser` (adapt-channel, generate-ideas, generate-strategy, generate-variants, refine-branch, render-design-png) y `generate-design-copy` no tiene validación de usuario detectada: quien tenga la URL puede invocarlas y generar costo de OpenAI. En local quedan detrás de 127.0.0.1 |
| R7 | Funciones con el default `verify_jwt=true`, service role y sin `getUser` | analyze-image-reference, generate-copy-v2, hydrate-templates, suggest-copy, suggest-image-ideas | La anon key pasa la verificación de JWT y el handler no valida al usuario; usan la service role (no verifiqué de dónde toman `business_id`) |
| R8 | Las migraciones no se pueden aplicar limpias en local | `20260502:231` lee `generated_ideas` (no se crea); policies con `user_is_member_of` (no definida); 9 versiones repetidas (20260424 ×3, 20260501 ×3, 20260523 ×3, 20260524 ×5, 20260526 ×3, 20260530, 20260822, 20260901 y 20260908 ×2); formatos `YYYYMMDD_` (45) y `YYYYMMDDNNNN_` (11) mezclados; 16 `seed_*` dentro de `migrations/` (la CLI los ignora por nombre) | Afecta a la estrategia (b) de la Fase 2 |
| R9 | Hay DML de datos dentro de migraciones de schema | UPDATE en 20260523_add_content_ingredients (6), 20260704, 20260809, 20260811, 20260816 (design_sessions, design_mockups y design_feedback), 20260904 y 20260908_retire_draft_branches; INSERT en 20260502 y 20260702 | Aplicarlas después de cargar el histórico transformaría datos. Con la estrategia (a) no se reaplican |
| R10 | Las tablas del IdP están en el repo: `business_tenants` (con columnas agregadas en 20260502, idéntico a MX, y en 20260510_compliance_wizard, solo ScoryDesign; datos cambiados en 20260809) y `user_business_memberships`. Las seeds insertan tenants y `seed_20260908` inserta memberships | §4 | El snapshot local debe incluir las columnas extra de `business_tenants` |
| R11 | Riesgo de datos de más de un usuario | Tablas con `user_id`, `created_by`, `actor_id`, `used_by` o `reviewed_by` (§4). La policy de `design_images` es `USING (true)`. Hay 3 tenants sembrados (Xending, Xending Capital y Xending USA) | Con un solo usuario local, las FKs a `auth.users` de filas de otros usuarios fallan. La parte B debe contar los `user_id` distintos por tabla y decidir: crear usuarios placeholder, `SET NULL` o filtrar |
| R12 | `branch-chat` solo existe en MarketXending y ScoryDesign la invoca | `src/hooks/useBranchChat.ts:49` | Fuera de alcance salvo decisión. En local va a fallar |
| R13 | `getPublicUrl` sobre buckets privados o desconocidos | `brand-assets`, `pipeline-renders` | Verificar en la parte B si hay URLs guardadas en esas columnas |
| R14 | Faltan herramientas: no hay `psql` ni `pg_dump` en PATH (la carpeta de PostgreSQL 18 solo tiene `data/`), el daemon de Docker no corre y C: tiene 8.6 GB libres | §17 | La parte B necesita un cliente PG 17+ para los dumps (instalación con OK) o usar el contenedor de la CLI. Las imágenes de Supabase usan C: (Docker Desktop) |

## 17. Checklist de la parte B (read-only)

1. `pg_class.reltuples` y `relrowsecurity` de las tablas de §4. `count(*)` exacto solo en las tablas que se van a copiar.
2. `pg_policies` de `public` y de `storage.objects` completo, para comparar con §4 y §8 y detectar policies que no están en el repo (`design-images`, `Brand`).
3. `pg_proc` en `public` y `desaing_private`: firma, `prosecdef`, `proacl` y `proconfig`. Confirmar `user_is_member_of` y `set_active_business`.
4. `information_schema.role_table_grants` de las tablas de §4.
5. FKs (`pg_constraint`) hacia `auth.users` e IdP. DDL de solo schema de `generated_ideas` y de las tablas ambiguous.
6. Triggers desplegados, `pg_extension`, `cron.job` (sin `command`) y `pg_publication_tables`.
7. `storage.buckets` (public, límite, MIME) y objetos y bytes por bucket. Prioridad: los 8 buckets de §8.
8. Ledger `supabase_migrations.schema_migrations` frente a los 56 archivos.
9. `functions list` y `secrets list` (solo nombres) con la Management API. Las versiones y el `verify_jwt` desplegados de las 35 funciones y de `branch-chat`.
10. Por tabla con columnas de usuario: número de `user_id` distintos y si son del dueño (R11).
11. Por columna candidata de §13: filas con `<ref>.supabase.co/storage`, por bucket.
12. ¿MarketXending o el Plan B leen las tablas ambiguous y `news_editions`?
13. Auth: `site_url`, redirect URLs y proveedores habilitados. El usuario dueño: UUID, `raw_app_meta_data` y `raw_user_meta_data`.

Estado: los puntos 1 a 11 están resueltos (§4, §7, §8, §14 y §18 a §23). El 12 es parcial: no hay FKs ni vistas de MarketXending sobre esas tablas, pero no se leyeron cuerpos de funciones ni código de MX. El 13 queda como no verificado (§24).

## 18. Tablas desplegadas por clasificación

| clasificación | desplegadas | con filas | filas (count exacto) | tamaño total |
|---|---|---|---|---|
| scory_owned | 39 de 45 (faltan 6, §14) | 19 | 2,174 | 18.1 MB |
| ambiguous | 18 de 18 | 16 | 1,249 | 756.6 MB (image_library 401.6 MB, design_pieces 268.5 MB, design_library 82.7 MB) |
| idp_shared | 5 de 5 | 5 | 25 | 0.2 MB |
| marketxending_owned | 87 | no contado | no contado | 12.3 MB |
| **Total `public`** | **149** | | | |

Reclasificación: las 18 ambiguous pasan a **scory_owned para la copia**. Todas sus filas son del único usuario (§19), ninguna tabla de MarketXending tiene FK hacia ellas y ninguna vista depende de ellas. Riesgo residual: no se leyeron cuerpos de funciones ni Edge Functions de MarketXending, que podrían leerlas. Los buckets `design-images` y `Brand` también pasan a scory_owned.

## 19. Usuarios y negocios (decisión de un solo usuario)

Columnas de usuario contadas (desplegado): `created_by` (compliance_rule_versions, copy_bank_items, copy_kits, design_feedback, design_mockups, news_editions, validation_disputes), `reviewed_by` y `used_by` (copy_bank_items), `user_id` (design_campaigns, design_sessions) y `actor_id` (15 tablas `desaing_*`). Columna de negocio: `business_id` en 50 tablas.

| Medida | Resultado |
|---|---|
| UUID distintos en la unión de columnas de usuario | **1** |
| …que existen en `auth.users` | **1** |
| Filas con usuario / filas de otros usuarios | 1,567 / **0** |
| Tablas con usuario distinto por tabla | todas con 0 o 1 |
| `business_id` distintos en la unión | 3, los 3 en `business_tenants` |
| Filas por negocio | 2,742 / 308 / 30. Hay 338 filas fuera del negocio más frecuente: copy_bank_items 270, commercial_branches 10, business_channels 14, business_angles 12, industry_verticals 8, market_moments 7, design_mockups 7, campaign_categories 4, master_prompts 3, desaing_policies 2, brand_disclaimers 1 |
| `user_business_memberships` | 3 filas: 1 usuario (el mismo) × 3 negocios, rol `owner` en los 3 |
| `business_tenants` | 3 filas, todas referenciadas |
| `profiles` | 7 en total, 1 del dueño |
| `user_roles` / `extended_user_roles` | 7 / 5 en total, 1 / 1 del dueño |
| `auth.users` | 7 usuarios, todos confirmados; 0 anónimos, 0 SSO, 0 MFA |
| `auth.identities` | 7, todas `email` |
| `storage.objects.owner` en buckets de ScoryDesign | 1 owner distinto (el dueño). 1,303 objetos del dueño y 279 sin owner (service role); 0 de otros |

**Conclusión: la condición de un solo usuario se cumple.** Todas las filas con usuario y todos los objetos con owner son del dueño, que además es owner de los 3 negocios. Con el usuario local creado con el mismo UUID no queda ninguna fila ni objeto fuera. Hay que copiar los 3 negocios, no solo uno. El snapshot de IdP es: 3 filas de `business_tenants`, 3 de `user_business_memberships`, 1 de `profiles`, y opcionalmente 1 de `user_roles` y 1 de `extended_user_roles`. Las otras 6 filas de `profiles`, 6 de `user_roles`, 4 de `extended_user_roles` y los 6 usuarios restantes de `auth.users` son de MarketXending y no se copian.

## 20. URLs del Storage compartido guardadas en la base

Se contaron coincidencias de `<PROJECT_REF_COMPARTIDO>.supabase.co/storage/v1/` en 282 columnas text/varchar/jsonb/text[] de 57 tablas (scory_owned, ambiguous y `business_tenants`). No hubo timeouts. No hay URLs a `/render/image/` ni a `/functions/v1/` del compartido.

| tabla.columna | tipo de URL | bucket | filas | ocurrencias |
|---|---|---|---|---|
| business_tenants.logo_url | object/public | Brand | 2 | 2 |
| copy_bank_items.image_meta | object/public | design-images | 9 | 45 |
| desaing_continuity.snapshot | object/public | Brand / design-images | 7 / 4 | 25 / 29 |
| desaing_explorations.request | object/public | Brand | 92 | 92 |
| desaing_production_receipts.receipt | object/public | design-images | 5 | 5 |
| desaing_production_snapshots.snapshot | object/public | design-images | 1 | 1 |
| design_campaigns.branch_data | object/public | design-images | 6 | 92 |
| design_images.storage_path | object/public | design-images | 120 | 120 |
| design_library.html_content | object/public · **object/sign** | design-images · Brand | 83 · 83 | 120 · 83 |
| design_mockups.image_url | object/public | design-images | 806 | 806 |
| design_mockups.selections | object/public | design-images | 126 | 126 |
| design_pieces.html_content | object/public · **object/sign** | design-images · Brand | 197 · 194 | 304 · 195 |
| image_library.image_url | object/public | design-images | 154 | 154 |
| news_editions.slides | object/public | design-images | 17 | 230 |
| presentations.slides | object/public · object/public · **object/sign** | design-images · Brand · Brand | 8 · 2 · 8 | 264 · 4 · 15 |

Por bucket: design-images 2,296 ocurrencias; Brand 416 (123 públicas y 293 firmadas). En total hay 2,712 ocurrencias, y 1,511 filas de 14 tablas mencionan el ref compartido. La Fase 5 tiene que reescribir el host (y `sign/` → `public/` o volver a firmar) en esas 14 tablas, incluso dentro de HTML y JSON.

## 21. Edge Functions desplegadas y secretos

`supabase functions list`: 56 funciones desplegadas, todas `ACTIVE`.

| Comparación | Resultado |
|---|---|
| Del repo y desplegadas | 34 de 35 |
| Del repo y **no desplegada** | `quick-fire` (`QuickFirePanel.tsx:197` falla también en el compartido) |
| Desplegadas sin carpeta en el repo, probablemente de ScoryDesign | `import-design-reference` (v2) y `render-design-preview` (v2), ambas actualizadas el 2026-10-08 con `verify_jwt=true`. No aparecen en ninguna rama del repo (`git log --all -S`). **Sin código fuente**: no se pueden servir en local sin recuperarlo |
| `branch-chat` | Desplegada (v19, 2026-05-01, `verify_jwt=true`). Solo existe en MarketXending |
| Desplegadas de MarketXending | 19 (`ai-*`, `batch-processor`, `chat-agent`, `crm-alert-checker`, `fx-agent`, `monex-*`, `send-*`, `task-alerts-checker`, `analyze-scenarios`) |
| `verify_jwt` desplegado vs `config.toml` | Coinciden, salvo `render-design-png`: **true desplegado** y false en el repo (desplegada por última vez el 2026-04-25, antes de la entrada de `config.toml`) |

Las 9 duplicadas y las funciones relacionadas (una sola copia desplegada, compartida con MX):

| función | versión | creada | actualizada | verify_jwt |
|---|---|---|---|---|
| generate-design-image | v118 | 2026-04-25 | 2026-09-19 | false |
| generate-design-html | v75 | 2026-04-25 | 2026-10-13 | false |
| generate-ideas | v63 | 2026-04-26 | 2026-09-18 | false |
| generate-strategy | v22 | 2026-04-25 | 2026-09-18 | false |
| generate-design-copy | v21 | 2026-04-25 | 2026-07-03 | false |
| generate-variants | v22 | 2026-05-02 | 2026-09-18 | false |
| refine-branch | v20 | 2026-07-03 | 2026-09-18 | false |
| adapt-channel | v21 | 2026-05-02 | 2026-09-18 | false |
| render-design-png | v19 | 2026-04-25 | 2026-04-25 | true |
| branch-chat | v19 | 2026-05-01 | 2026-05-01 | true |
| pipeline-orchestrator | v21 | 2026-07-03 | 2026-09-19 | true |
| render-multichannel | v21 | 2026-06-01 | 2026-06-03 | true |

Las fechas de 2026-09-18 coinciden con `deploy-prompt-admin.ps1` (R2): la versión desplegada de esas duplicadas es la de ScoryDesign, no la de MarketXending.

Secretos (`supabase secrets list`, solo nombres; 31):

| Grupo | Nombres |
|---|---|
| Usados por el repo y **no definidos** (la función usa su default o falla) | COPY_KIT_SOURCE, COPY_MODEL, COPY_V2_MODEL, MASTER_IMAGE_PROMPT_SOURCE, MASTER_IMAGE_PROMPT_VERSION, **RENDER_SERVICE_TOKEN**, **RENDER_SERVICE_URL**, SLIDE_MODEL, SLIDE_REVIEW_MODEL, TRANSLATE_MODEL |
| Definidos y usados por ScoryDesign | DESAING_ALLOWED_ORIGINS, DESAING_EXPLORATION_ENABLED, DESAING_PILOT_ACTOR_ID, DESAING_PILOT_BUSINESS_ID, DESAING_PILOT_ENABLED, DESAING_PILOT_EXPIRES_AT_MS, DESAING_PILOT_POLICY_ID, DESAING_PILOT_SUPABASE_ORIGIN, DESAING_PILOT_TOKEN, DESAING_PROMPT_ADMIN_ENABLED, DESAING_SERVER_ENABLED, DESAING_UI_EXECUTOR, DESAING_UI_GENERATION_ENABLED, OPENAI_API_KEY, PHOTO_STYLE, SLIDE_FIX_MODEL |
| Definidos, no leídos por el código de ScoryDesign | DESAING_EXPLORATION_EXPIRES_AT_MS, DESAING_UI_EXPIRES_AT_MS (están en `.env.desaing-server.example`), ANTHROPIC_API_KEY, OPENAI_API_KEY_BACKUP, MONEX_API_URL, MONEX_PUBLIC_KEY, MONEX_SECRET_KEY, RESEND_API_KEY |
| De la plataforma | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL, SUPABASE_JWKS, SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS |

Sin `RENDER_SERVICE_URL` ni el bucket `pipeline-renders`, `render-design-png` no puede funcionar hoy en el compartido.

## 22. Ledger de migraciones

`supabase_migrations.schema_migrations` tiene 56 filas: 47 versiones de 2025 sin nombre (MarketXending) y 9 con nombre (ScoryDesign).

| Grupo | Versiones |
|---|---|
| Archivos del repo registrados | 7 de 56: 202609170001, 202609170002, 202609180003, 202609180004, 202609180005, 202609180006, 202609190001 |
| Registradas sin archivo en el repo (ni en otras ramas) | `202609180007` (desaing_manual_generation) y `202609180008` (desaing_image_choices). Drift: no sabemos qué crearon |
| Archivos del repo no registrados | 49: los 45 `YYYYMMDD_` (2026-04 a 2026-09) y 202609190002, 202609230001, 202609260001 y 202610080001. Sus efectos sí están desplegados (tablas, columnas, `desaing_reset_continuity`, el guard de continuity, las firmas con `p_session_id` y la eliminación de `guard_shared_design_budget`), así que se aplicaron fuera del ledger (SQL editor o `supabase-query.ps1`) |
| Otras tablas del schema | `supabase_migrations.seed_files` (existe, no se leyó) |

Consecuencia para la Fase 2: el ledger del compartido no sirve como baseline. El schema local debe salir del catálogo desplegado (dump de solo schema hecho en local o DDL reconstruido), no de reaplicar `supabase/migrations`.

## 23. Riesgos nuevos (parte B)

| # | Hallazgo | Impacto |
|---|---|---|
| N1 | Policies `Authenticated users can upload design images` (INSERT) y `Authenticated users can delete design images` (DELETE) en `storage.objects`, solo con filtro de bucket | Cualquiera de los 7 usuarios del compartido (incluidos los de MarketXending) puede subir o borrar cualquier objeto de `design-images`. No replicarlas en local |
| N2 | `design-images` y `Brand` son públicos y no tienen límite de tamaño ni MIME. `Brand` no tiene policies | Las URLs firmadas de `Brand` (R3, §20) no protegen nada: el bucket es público. En local, decidir si siguen públicos |
| N3 | `user_is_member_of` y `set_active_business`: SECURITY DEFINER, `search_path=public` (no vacío) y EXECUTE para PUBLIC y anon | Sin el REVOKE que sí tienen las `desaing_*`. `set_active_business` escribe `auth.users.raw_app_meta_data`. En local, crear las dos con `search_path=''` y EXECUTE solo para authenticated |
| N4 | 42 tablas (ScoryDesign e IdP) con ALL para anon | Dependen solo de RLS. `generated_ideas` sí tiene RLS (el repo decía que no) |
| N5 | 46 funciones SECURITY DEFINER de `public` con EXECUTE para PUBLIC; 18 sin `search_path` | Todas de MarketXending salvo N3. No se copian; se informa al dueño de MX |
| N6 | `quick-fire`, las 6 tablas no desplegadas y los buckets `pipeline-renders` y `templates` no existen | Esas rutas ya fallan en el compartido. Decidir en la Fase 2 si se crean en local o se dejan fuera |
| N7 | `import-design-reference`, `render-design-preview` y las migraciones 202609180007 y 202609180008 solo existen desplegadas | Sin fuente en el repo: hay que recuperarla (otra ventana o worktree) antes de la Fase 6, o dejarlas fuera |
| N8 | Signed URLs con token guardadas en la base (293 ocurrencias en design_library, design_pieces y presentations) | Igual que R3, pero en datos: la Fase 5 debe reescribirlas |
| N9 | Policy `Users can view own profile and admins can view all` y `user_roles` usan `is_admin()` (MX) | Si se copia `profiles` o `user_roles` a local, hay que traer `is_admin()` o simplificar las policies |
| N10 | pg_net y unaccent instalados en `public` | Son de MarketXending; no se necesitan en local |

R14 queda resuelto para la parte B: Docker corre y se usó la imagen `postgres:17` como cliente.

## 24. No verificado

| Tema | Motivo / dónde revisarlo |
|---|---|
| Auth remota: `site_url`, redirect URLs, SMTP, proveedores habilitados, rate limits | Sin acceso a la Management API para config de Auth. Revisar en el dashboard. Lo que se deduce: solo email/password (`src`, §11) y 7 identidades `email` (§19) |
| Si MarketXending (funciones SQL, Edge Functions o su frontend) lee las tablas ambiguous | No se leyeron cuerpos (`prosrc`) ni código de MX. Solo se descartaron FKs y vistas |
| Contenido de `202609180007` y `202609180008`, y de `import-design-reference` y `render-design-preview` | No hay fuente en el repo, no se leyeron `statements` y está prohibido `functions download` |
| Uso real reciente de las 7 duplicadas indeterminables | No se consultaron logs de Edge Functions |
| `supabase_migrations.seed_files` | No se leyó |
| Policies cuyas expresiones no se copiaron | Solo se marcó si usan `auth.uid()`, `true`, membership o helper |
| Raíz de `desaing-conversation-references` | Es un UUID que no es tenant; no se comprobó contra el usuario |

## Anexo A. Policies de tablas (repo)

| tabla | policy | cmd | roles | auth.uid() | membership / helper | true | archivo |
|---|---|---|---|---|---|---|---|
| asset_snapshots | Users can manage own business asset snapshots | ALL | public | sí | sí |  | 20260524_create_asset_snapshots.sql:44 |
| brand_assets | Users can manage own business assets | ALL | authenticated | sí | sí |  | 20260521_brand_onboarding_tables.sql:114 |
| brand_disclaimers | Users can manage own business brand disclaimers | ALL | authenticated | sí | sí |  | 20260801_brand_layer_tables.sql:90 |
| brand_onboarding_sessions | Users can manage own business onboarding | ALL | authenticated | sí | sí |  | 20260521_brand_onboarding_tables.sql:89 |
| business_angles | Members can view business angles | SELECT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:580 |
| business_angles | Owners and admins can insert business angles | INSERT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:593 |
| business_angles | Owners and admins can update business angles | UPDATE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:607 |
| business_angles | Owners can delete business angles | DELETE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:621 |
| business_channels | Members can view business channels | SELECT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:520 |
| business_channels | Owners and admins can insert business channels | INSERT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:533 |
| business_channels | Owners and admins can update business channels | UPDATE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:547 |
| business_channels | Owners can delete business channels | DELETE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:561 |
| business_tenants | Members can view their business tenants | SELECT | authenticated | sí | sí |  | 20260501_create_business_tenants.sql:70 |
| business_tenants | Authenticated users can create business tenants | INSERT | authenticated | no | no |  CHECK(true) | 20260501_create_business_tenants.sql:84 |
| business_tenants | Owners and admins can update business tenants | UPDATE | authenticated | sí | sí |  | 20260501_create_business_tenants.sql:92 |
| business_tenants | Owners can delete business tenants | DELETE | authenticated | sí | sí |  | 20260501_create_business_tenants.sql:107 |
| campaign_categories | Members can view campaign categories | SELECT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:187 |
| campaign_categories | Owners and admins can insert campaign categories | INSERT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:200 |
| campaign_categories | Owners and admins can update campaign categories | UPDATE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:214 |
| campaign_categories | Owners can delete campaign categories | DELETE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:228 |
| commercial_branches | Members can view commercial branches | SELECT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:247 |
| commercial_branches | Owners and admins can insert commercial branches | INSERT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:260 |
| commercial_branches | Owners and admins can update commercial branches | UPDATE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:274 |
| commercial_branches | Owners can delete commercial branches | DELETE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:288 |
| compliance_messages | Members can manage compliance messages | ALL | authenticated | sí | sí |  | 20260510_compliance_wizard.sql:72 |
| compliance_rejected_suggestions | Members can manage rejected suggestions | ALL | authenticated | sí | sí |  | 20260510_compliance_wizard.sql:144 |
| compliance_rule_versions | Members can view compliance rule versions | SELECT | authenticated | sí | sí |  | 20260510_compliance_wizard.sql:106 |
| compliance_rule_versions | Admins can insert compliance rule versions | INSERT | authenticated | sí | sí |  | 20260510_compliance_wizard.sql:118 |
| compliance_sessions | Members can manage compliance sessions | ALL | authenticated | sí | sí |  | 20260510_compliance_wizard.sql:42 |
| content_calendar | Members can view calendar | SELECT | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:293 |
| content_calendar | Members can create calendar slots | INSERT | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:297 |
| content_calendar | Members can update calendar slots | UPDATE | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:301 |
| content_library | Members can view content | SELECT | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:278 |
| content_library | Members can create content | INSERT | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:282 |
| content_library | Members can update content | UPDATE | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:286 |
| copy_bank_items | copy_bank_items_member_select | SELECT | public | sí | sí |  | 20260806_copy_bank_v2.sql:149 |
| copy_bank_items | copy_bank_items_member_insert | INSERT | public | sí | sí |  | 20260806_copy_bank_v2.sql:160 |
| copy_bank_items | copy_bank_items_member_update | UPDATE | public | sí | sí |  | 20260806_copy_bank_v2.sql:171 |
| copy_bank_items | copy_bank_items_member_delete | DELETE | public | sí | sí |  | 20260806_copy_bank_v2.sql:182 |
| copy_kits | copy_kits_member_select | SELECT | public | sí | sí |  | 20260806_copy_bank_v2.sql:193 |
| copy_kits | copy_kits_member_write | ALL | public | sí | sí |  | 20260806_copy_bank_v2.sql:204 |
| creative_profiles | Users can manage own creative profiles | ALL | authenticated | sí | sí |  | 20260524_create_creative_profiles.sql:82 |
| creative_profiles | desaing_creative_profiles_read | SELECT | authenticated | no | desaing_business_role |  | 202609180004_desaing_onboarding.sql:15 |
| custom_templates | Users can manage own business templates | ALL | public | sí | sí |  | 20260523_create_custom_templates.sql:43 |
| desaing_audit | desaing_audit_member_read | SELECT | authenticated | no | desaing_business_role |  | 202609170001_desaing_server_foundation.sql:77 |
| desaing_continuity | desaing_continuity_owner_read | SELECT | authenticated | sí | desaing_business_role |  | 202609190001_desaing_continuity.sql:19 |
| desaing_policies | desaing_policies_member_read | SELECT | authenticated | no | desaing_business_role |  | 202609170001_desaing_server_foundation.sql:73 |
| desaing_state | desaing_state_member_read | SELECT | authenticated | no | desaing_business_role |  | 202609170001_desaing_server_foundation.sql:75 |
| design_campaigns | Users can view own design campaigns | SELECT | authenticated | sí | no |  | 20260424_create_design_campaigns.sql:25 |
| design_campaigns | Users can create own design campaigns | INSERT | authenticated | sí | no |  | 20260424_create_design_campaigns.sql:32 |
| design_campaigns | Users can update own design campaigns | UPDATE | authenticated | sí | no |  | 20260424_create_design_campaigns.sql:39 |
| design_campaigns | Users can delete own design campaigns | DELETE | authenticated | sí | no |  | 20260424_create_design_campaigns.sql:46 |
| design_campaigns | Business members can view business design campaigns | SELECT | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:80 |
| design_campaigns | Business members can create business design campaigns | INSERT | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:95 |
| design_campaigns | Business editors can update business design campaigns | UPDATE | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:110 |
| design_feedback | Members can view feedback | SELECT | authenticated | sí | sí |  | 20260524_create_design_feedback.sql:52 |
| design_feedback | Members can insert feedback | INSERT | authenticated | sí | sí |  | 20260524_create_design_feedback.sql:65 |
| design_feedback | Members can delete own feedback | DELETE | authenticated | sí | no |  | 20260524_create_design_feedback.sql:78 |
| design_images | Authenticated users can view all design images | SELECT | authenticated | no | no | USING(true) | 20260424_create_design_images.sql:30 |
| design_images | Users can create design images | INSERT | authenticated | sí | no |  | 20260424_create_design_images.sql:37 |
| design_images | Users can update own design images | UPDATE | authenticated | sí | no |  | 20260424_create_design_images.sql:51 |
| design_images | Users can delete own design images | DELETE | authenticated | sí | no |  | 20260424_create_design_images.sql:65 |
| design_images | Business members can view business design images | SELECT | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:182 |
| design_images | Business members can create business design images | INSERT | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:197 |
| design_images | Business editors can update business design images | UPDATE | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:212 |
| design_library | Members can view designs | SELECT | authenticated | no | user_is_member_of |  | 20260506_create_design_library.sql:80 |
| design_library | Members can create designs | INSERT | authenticated | no | user_is_member_of |  | 20260506_create_design_library.sql:84 |
| design_library | Members can update designs | UPDATE | authenticated | no | user_is_member_of |  | 20260506_create_design_library.sql:88 |
| design_library | Members can delete designs | DELETE | authenticated | no | user_is_member_of |  | 20260506_create_design_library.sql:92 |
| design_mockups | Members can view mockups | SELECT | authenticated | sí | sí |  | 20260523_create_design_mockups.sql:27 |
| design_mockups | Members can insert mockups | INSERT | authenticated | sí | sí |  | 20260523_create_design_mockups.sql:40 |
| design_mockups | Members can update own mockups | UPDATE | authenticated | sí | no |  | 20260523_create_design_mockups.sql:53 |
| design_mockups | Members can delete own mockups | DELETE | authenticated | sí | no |  | 20260523_create_design_mockups.sql:60 |
| design_pieces | Users can view own design pieces | SELECT | authenticated | sí | no |  | 20260424_create_design_pieces.sql:27 |
| design_pieces | Users can create own design pieces | INSERT | authenticated | sí | no |  | 20260424_create_design_pieces.sql:40 |
| design_pieces | Users can update own design pieces | UPDATE | authenticated | sí | no |  | 20260424_create_design_pieces.sql:53 |
| design_pieces | Users can delete own design pieces | DELETE | authenticated | sí | no |  | 20260424_create_design_pieces.sql:66 |
| design_pieces | Business members can view business design pieces | SELECT | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:131 |
| design_pieces | Business members can create business design pieces | INSERT | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:146 |
| design_pieces | Business editors can update business design pieces | UPDATE | authenticated | sí | sí |  | 20260501_extend_design_tables.sql:161 |
| design_sessions | Users can manage own design sessions | ALL | authenticated | sí | sí |  | 20260522_create_design_sessions.sql:63 |
| image_library | Members can view images | SELECT | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:263 |
| image_library | Members can create images | INSERT | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:267 |
| image_library | Members can update images | UPDATE | authenticated | no | user_is_member_of |  | 20260502_pipeline_v2_tables.sql:271 |
| industry_verticals | Members can view industry verticals | SELECT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:307 |
| industry_verticals | Owners and admins can insert industry verticals | INSERT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:320 |
| industry_verticals | Owners and admins can update industry verticals | UPDATE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:334 |
| industry_verticals | Owners can delete industry verticals | DELETE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:348 |
| interaction_log | Users can manage own business interaction logs | ALL | public | sí | sí |  | 20260524_create_interaction_log.sql:40 |
| learning_deltas | Users can manage own learning deltas | ALL | authenticated | sí | sí |  | 20260524_create_learning_deltas.sql:48 |
| market_moments | Members can view market moments | SELECT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:367 |
| market_moments | Owners and admins can insert market moments | INSERT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:380 |
| market_moments | Owners and admins can update market moments | UPDATE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:394 |
| market_moments | Owners can delete market moments | DELETE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:408 |
| master_prompts | Members can view master prompts | SELECT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:427 |
| master_prompts | Owners and admins can insert master prompts | INSERT | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:440 |
| master_prompts | Owners and admins can update master prompts | UPDATE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:454 |
| master_prompts | Owners can delete master prompts | DELETE | authenticated | sí | sí |  | 20260501_create_campaign_architecture.sql:468 |
| master_prompts | desaing_governed_prompt_insert | INSERT | authenticated (R) | no | desaing_prompt_governed |  | 202609180006_desaing_prompt_admin.sql:48 |
| master_prompts | desaing_governed_prompt_update | UPDATE | authenticated (R) | no | desaing_prompt_governed/desaing_prompt_governed |  | 202609180006_desaing_prompt_admin.sql:50 |
| master_prompts | desaing_governed_prompt_delete | DELETE | authenticated (R) | no | desaing_prompt_governed |  | 202609180006_desaing_prompt_admin.sql:52 |
| narrative_angles | Authenticated users can read narrative_angles | SELECT | authenticated | no | no | USING(true) | 20260502_pipeline_v2_tables.sql:254 |
| news_editions | Members can manage business news editions | ALL | authenticated | sí | sí |  | 20260822_create_news_editions.sql:64 |
| pipeline_pieces | Users can manage own business pieces | ALL | public | sí | sí |  | 20260520_pipeline_orchestrator_tables.sql:170 |
| pipeline_runs | Users can manage own business pipeline runs | ALL | public | sí | sí |  | 20260520_pipeline_orchestrator_tables.sql:53 |
| pipeline_steps | Users can view own pipeline steps | ALL | public | sí | sí |  | 20260520_pipeline_orchestrator_tables.sql:103 |
| presentations | Users can manage own business presentations | ALL | authenticated | sí | sí |  | 20260626_presentations_tables.sql:50 |
| promoters | Users can manage own business promoters | ALL | authenticated | sí | sí |  | 20260801_brand_layer_tables.sql:112 |
| schema_versions | Authenticated users can view schema versions | SELECT | authenticated | no | no | USING(true) | 20260501_create_campaign_architecture.sql:487 |
| schema_versions | Only service role can insert schema versions | INSERT | service_role | no | no |  CHECK(true) | 20260501_create_campaign_architecture.sql:494 |
| schema_versions | Only service role can update schema versions | UPDATE | service_role | no | no | USING(true) | 20260501_create_campaign_architecture.sql:501 |
| schema_versions | Only service role can delete schema versions | DELETE | service_role | no | no | USING(true) | 20260501_create_campaign_architecture.sql:508 |
| template_registry | Authenticated users can read global templates | SELECT | authenticated | no | no |  | 20260525_create_template_registry.sql:91 |
| template_registry | Members can read own business templates | SELECT | authenticated | sí | sí |  | 20260525_create_template_registry.sql:98 |
| template_registry | Owners and admins can insert business templates | INSERT | authenticated | sí | sí |  | 20260525_create_template_registry.sql:111 |
| template_registry | Owners and admins can update business templates | UPDATE | authenticated | sí | sí |  | 20260525_create_template_registry.sql:125 |
| template_registry | Owners can delete business templates | DELETE | authenticated | sí | sí |  | 20260525_create_template_registry.sql:139 |
| trigger_templates | Users can manage own trigger templates | ALL | authenticated | sí | sí |  | 20260526_create_trigger_templates.sql:66 |
| user_business_memberships | Members can view memberships of their businesses | SELECT | authenticated | sí | sí |  | 20260501_create_business_tenants.sql:127 |
| user_business_memberships | Owners and admins can add business members | INSERT | authenticated | sí | sí |  | 20260501_create_business_tenants.sql:141 |
| user_business_memberships | Owners can update business memberships | UPDATE | authenticated | sí | sí |  | 20260501_create_business_tenants.sql:156 |
| user_business_memberships | Owners can delete business memberships | DELETE | authenticated | sí | sí |  | 20260501_create_business_tenants.sql:171 |
| validation_disputes | Members can manage validation disputes | ALL | authenticated | sí | sí |  | 20260511_validation_disputes.sql:23 |
| validation_history | Members can view validation history | SELECT | authenticated | sí | sí |  | 20260510_compliance_wizard.sql:174 |

## Anexo B. Grants y revokes explícitos de tablas

| tabla | grant/revoke |
|---|---|
| creative_profiles | + SELECT TO authenticated, service_role @202609180004_desaing_onboarding.sql:14 |
| creative_profiles | - ALL FROM PUBLIC, anon, authenticated, service_role @202609180004_desaing_onboarding.sql:13 |
| desaing_audit | + SELECT TO authenticated, service_role @202609170001_desaing_server_foundation.sql:45 |
| desaing_audit | - ALL FROM PUBLIC, anon, authenticated, service_role @202609170001_desaing_server_foundation.sql:43 |
| desaing_brand_drafts | - ALL FROM PUBLIC,anon,authenticated,service_role @202609180004_desaing_onboarding.sql:56 |
| desaing_brand_publications | - ALL FROM PUBLIC,anon,authenticated,service_role @202609180004_desaing_onboarding.sql:56 |
| desaing_brand_revisions | - ALL FROM PUBLIC,anon,authenticated,service_role @202609180004_desaing_onboarding.sql:56 |
| desaing_continuity | + SELECT TO authenticated @202609190001_desaing_continuity.sql:17 |
| desaing_continuity | - ALL FROM PUBLIC, anon, authenticated, service_role @202609190001_desaing_continuity.sql:16 |
| desaing_explorations | - ALL FROM PUBLIC, anon, authenticated, service_role @202609170002_desaing_exploration_journal.sql:31 |
| desaing_material_collections | - ALL FROM PUBLIC, anon, authenticated, service_role @202609180003_desaing_materials.sql:14 |
| desaing_material_revisions | - ALL FROM PUBLIC, anon, authenticated, service_role @202609180003_desaing_materials.sql:24 |
| desaing_policies | + SELECT TO authenticated, service_role @202609170001_desaing_server_foundation.sql:45 |
| desaing_policies | + ALL TO service_role @202609170001_desaing_server_foundation.sql:46 |
| desaing_policies | - ALL FROM PUBLIC, anon, authenticated, service_role @202609170001_desaing_server_foundation.sql:43 |
| desaing_production_receipts | - ALL FROM PUBLIC,anon,authenticated,service_role @202609180005_desaing_production.sql:18 |
| desaing_production_snapshots | - ALL FROM PUBLIC,anon,authenticated,service_role @202609180005_desaing_production.sql:18 |
| desaing_state | + SELECT TO authenticated, service_role @202609170001_desaing_server_foundation.sql:45 |
| desaing_state | - ALL FROM PUBLIC, anon, authenticated, service_role @202609170001_desaing_server_foundation.sql:43 |
| desaing_prompt_admin_* (7) | - ALL FROM PUBLIC,anon,authenticated,service_role (DO dinámico) @202609180006_desaing_prompt_admin.sql:33 |

## Anexo C. Archivos con el mismo nombre en MarketXending

| archivo | mismo hash |
|---|---|
| 20260424_create_design_campaigns.sql | sí |
| 20260424_create_design_images.sql | sí |
| 20260424_create_design_pieces.sql | sí |
| 20260501_create_business_tenants.sql | sí |
| 20260501_create_campaign_architecture.sql | sí |
| 20260501_extend_design_tables.sql | sí |
| 20260502_pipeline_v2_tables.sql | sí |
| 20260506_create_design_library.sql | sí |
| seed_20260501_xending_capital_tenant.sql | no |
| seed_20260501_xending_tenant.sql | no |

Las 10 carpetas de `supabase/functions` en común con MarketXending son `_shared` y las 9 duplicadas.

## Anexo D. Herramientas y entorno

| Herramienta | Estado |
|---|---|
| Supabase CLI | presente (scoop shim); versión no consultada porque la tarea prohibía ejecutarla |
| psql / pg_dump | no están en PATH; `C:\Program Files\PostgreSQL\18` solo tiene `data/` |
| Docker | CLI presente; daemon apagado (`dockerDesktopLinuxEngine` no responde) |
| Node / Deno | Node v22.16.0; Deno presente |
| package.json | `lint` (eslint), `type-check` (`tsc -b`), `test` (`vitest --run`); `supabase` no está en devDependencies |
| Disco | C: 8.6 GB libres; F: 1,402.8 GB libres |
| `supabase\.temp` | cli-latest, gotrue-version, linked-project.json, pooler-url, postgres-version, project-ref, rest-version, storage-migration, storage-version; ignorada por git |
| Archivos `.env` | `.env`, `.env.*.local` (6) ignorados y no trackeados; `supabase/functions/.env` cubierto por `.gitignore:8` |
