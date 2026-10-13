-- ---------------------------------------------------------------------------
-- Identidad de rama: un solo slug por línea comercial
-- ---------------------------------------------------------------------------
-- Hoy una rama de Xending tiene cuatro identificadores distintos:
--
--   commercial_branches.slug        'ahorro-costos-ocultos'
--   commercial_branches.name        'Ahorro / Costos Ocultos'
--   slug del copy kit (código)      'costos-ahorro'
--   prompt_kit.branch_id (JSONB)    'ahorro_costos_ocultos'
--
-- Y `copy_bank_items.branch_slug` ya usa el slug del kit, así que la misma rama
-- se nombra de dos formas según la tabla. Eso obligó a mantener DOS capas de
-- traducción en direcciones opuestas: `ALIASES` + regex en copyKitRegistry.ts
-- (rama -> kit) y `resolveBranchForKitSlug` en src/types/copy-bank.ts (kit ->
-- rama).
--
-- Esta migración alinea las dos ramas donde el slug difiere. Las otras cuatro
-- (velocidad-mismo-dia, cuenta-multidivisa, control-operativo-pagos,
-- banco-vs-xending) ya coinciden con su slug canónico y no se tocan.
--
-- El nombre visible de la rama de costos cambia además por una razón editorial:
-- "Costos Ocultos" es una frase prohibida por el copy kit v2, y el nombre viaja
-- al prompt como parámetro de `buildBranchContextBlock`.
--
-- NO cambia el contenido editorial de prompt_kit ni de strategic_config: solo
-- los campos de identidad. El contenido legacy deja de inyectarse por código
-- (ver docs/architecture/XENDING_DESIGN_STUDIO_FINAL_TO_BE.md, §6.5), no por
-- reescritura de datos.
--
-- La llave entre tablas es commercial_branches.id (UUID), no el slug, así que
-- ninguna relación se rompe. `copy_bank_items.branch_slug` ya contiene los
-- valores destino y queda alineado sin tocarlo.
--
-- Idempotente: filtra por el slug de origen, así que una segunda corrida no
-- encuentra filas y no hace nada.
-- ---------------------------------------------------------------------------

-- --- 1. Ahorro / Costos Ocultos -> Costos y Ahorro -------------------------

update public.commercial_branches
set
  slug = 'costos-ahorro',
  name = 'Costos y Ahorro',
  prompt_kit = prompt_kit || '{
    "branch_id": "costos_ahorro",
    "branch_name": "Costos y Ahorro"
  }'::jsonb,
  updated_at = now()
where slug = 'ahorro-costos-ocultos'
  and business_id = 'a0000000-0000-0000-0000-000000000001';

-- --- 2. cobertura-cambiaria -> coberturas ----------------------------------
-- El nombre visible se conserva: "Cobertura Cambiaria" es correcto y no
-- contiene frases prohibidas. Solo cambia el slug para que coincida con el kit.

update public.commercial_branches
set
  slug = 'coberturas',
  prompt_kit = prompt_kit || '{
    "branch_id": "coberturas"
  }'::jsonb,
  updated_at = now()
where slug = 'cobertura-cambiaria'
  and business_id = 'a0000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 3. Selecciones persistidas que guardan el slug como texto
-- ---------------------------------------------------------------------------
-- `VisualSelections.commercialBranchSlug` se guarda dentro de la columna JSONB
-- `selections` de tres tablas.
--
-- Solo una importa funcionalmente: `design_sessions`, porque el store hidrata
-- de ahí y `DesignStudioPage` resuelve la rama con comparación EXACTA
-- (`branches.find(b => b.slug === store.selections.commercialBranchSlug)`), así
-- que un slug viejo dejaría la sesión sin rama y el banco de copys sin filas.
-- Al momento de escribir esta migración, `design_sessions` tiene CERO filas con
-- los slugs viejos; el update queda igual por si se crea una sesión antes de
-- aplicarla.
--
-- En `design_mockups` (17 filas) y `design_feedback` (2 filas) el slug es
-- registro de escritura: nada lo lee de vuelta. `fetchLearnedPreferences` filtra
-- por `selections->>background` y evita a propósito aprender los selectores
-- explícitos. Se actualizan por consistencia del histórico, no para arreglar un
-- comportamiento.
--
-- Se actualiza solo la clave del slug; el resto del JSON queda intacto.
-- ---------------------------------------------------------------------------

update public.design_sessions
set selections = jsonb_set(selections, '{commercialBranchSlug}', '"costos-ahorro"')
where selections ->> 'commercialBranchSlug' = 'ahorro-costos-ocultos';

update public.design_sessions
set selections = jsonb_set(selections, '{commercialBranchSlug}', '"coberturas"')
where selections ->> 'commercialBranchSlug' = 'cobertura-cambiaria';

update public.design_mockups
set selections = jsonb_set(selections, '{commercialBranchSlug}', '"costos-ahorro"')
where selections ->> 'commercialBranchSlug' = 'ahorro-costos-ocultos';

update public.design_mockups
set selections = jsonb_set(selections, '{commercialBranchSlug}', '"coberturas"')
where selections ->> 'commercialBranchSlug' = 'cobertura-cambiaria';

update public.design_feedback
set selections = jsonb_set(selections, '{commercialBranchSlug}', '"costos-ahorro"')
where selections ->> 'commercialBranchSlug' = 'ahorro-costos-ocultos';

update public.design_feedback
set selections = jsonb_set(selections, '{commercialBranchSlug}', '"coberturas"')
where selections ->> 'commercialBranchSlug' = 'cobertura-cambiaria';

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Antes de aplicar, conviene saber cuántas filas se van a tocar:
--
--   select 'design_sessions' as t, selections ->> 'commercialBranchSlug' as slug,
--          count(*) as n
--   from public.design_sessions
--   where selections ->> 'commercialBranchSlug'
--         in ('ahorro-costos-ocultos', 'cobertura-cambiaria')
--   group by 1, 2
--   union all
--   select 'design_mockups', selections ->> 'commercialBranchSlug', count(*)
--   from public.design_mockups
--   where selections ->> 'commercialBranchSlug'
--         in ('ahorro-costos-ocultos', 'cobertura-cambiaria')
--   group by 1, 2
--   union all
--   select 'design_feedback', selections ->> 'commercialBranchSlug', count(*)
--   from public.design_feedback
--   where selections ->> 'commercialBranchSlug'
--         in ('ahorro-costos-ocultos', 'cobertura-cambiaria')
--   group by 1, 2;
--
-- Después de aplicar, las seis ramas deben quedar así:
--
--   velocidad-mismo-dia      Velocidad - Mismo Día        kit: velocidad
--   costos-ahorro            Costos y Ahorro              kit: costos-ahorro
--   cuenta-multidivisa       Cuenta Multidivisa           kit: (draft)
--   coberturas               Cobertura Cambiaria          kit: coberturas
--   control-operativo-pagos  Control Operativo de Pagos   kit: (draft)
--   banco-vs-xending         Banco vs Xending             kit: (draft)
--
--   select slug, name, display_order
--   from public.commercial_branches
--   where business_id = 'a0000000-0000-0000-0000-000000000001'
--   order by display_order;
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   update public.commercial_branches
--   set slug = 'ahorro-costos-ocultos',
--       name = 'Ahorro / Costos Ocultos',
--       prompt_kit = prompt_kit || '{"branch_id":"ahorro_costos_ocultos","branch_name":"Ahorro / Costos Ocultos"}'::jsonb
--   where slug = 'costos-ahorro'
--     and business_id = 'a0000000-0000-0000-0000-000000000001';
--
--   update public.commercial_branches
--   set slug = 'cobertura-cambiaria',
--       prompt_kit = prompt_kit || '{"branch_id":"cobertura_cambiaria"}'::jsonb
--   where slug = 'coberturas'
--     and business_id = 'a0000000-0000-0000-0000-000000000001';
