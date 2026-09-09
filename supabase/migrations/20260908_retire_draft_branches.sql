-- ---------------------------------------------------------------------------
-- Retiro de las dos ramas sin copy kit
-- ---------------------------------------------------------------------------
-- `control-operativo-pagos` y `banco-vs-xending` son las únicas ramas de Xending
-- que no resuelven a un copy kit (`_shared/branchSlug.ts` → `resolveKitSlug`
-- devuelve null para las dos). Su único contexto editorial es
-- `commercial_branches.prompt_kit`, la columna JSONB anterior a los kits.
--
-- Ese contexto no está desactualizado respecto a los kits: está en contra. En la
-- rama de costos el `prompt_kit` instruye revelar "los costos ocultos que los
-- bancos tradicionales esconden", frase que el copy kit lista primero en
-- `banned_phrases` (ver docs/architecture/CAROUSEL_PROMPT_STACK_AS_IS.md §15.5).
-- Mientras estas dos ramas sean seleccionables, ese contexto sigue siendo
-- alcanzable desde el Home.
--
-- POR QUÉ DESACTIVAR Y NO BORRAR
-- ---------------------------------------------------------------------------
-- El efecto visible es idéntico. `useCommercialBranches` y
-- `useDesignStudioBranches` filtran los dos por `is_active = true`, así que una
-- rama inactiva desaparece de las tarjetas del Home y del selector del Design
-- Studio.
--
-- La diferencia está en lo que no se ve. Los FK que apuntan a
-- `commercial_branches.id` son todos `ON DELETE SET NULL`:
--
--   design_images.commercial_branch_id      (20260506_create_design_library.sql)
--   pipeline_images.commercial_branch_id    (20260502_pipeline_v2_tables.sql)
--   pipeline_pieces.commercial_branch_id    (20260502_pipeline_v2_tables.sql)
--   design_campaigns.commercial_branch_id   (20260501_extend_design_tables.sql)
--
-- Un DELETE no borraría esas filas, pero les pondría la rama en null: el
-- contenido sobrevive y su trazabilidad no. Desactivar conserva las dos cosas, y
-- el rollback es una línea.
--
-- Idempotente: filtra por slug y por `is_active = true`.
-- ---------------------------------------------------------------------------

update public.commercial_branches
set
  is_active = false,
  updated_at = now()
where business_id = 'a0000000-0000-0000-0000-000000000001'
  and slug in ('control-operativo-pagos', 'banco-vs-xending')
  and is_active = true;

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Antes de aplicar, ver qué se va a tocar y confirmar que son las dos esperadas:
--
--   select slug, name, is_active, display_order
--   from public.commercial_branches
--   where business_id = 'a0000000-0000-0000-0000-000000000001'
--   order by display_order;
--
-- Después, las cuatro que quedan activas deben ser exactamente las que tienen
-- copy kit:
--
--   velocidad-mismo-dia   → kit velocidad
--   costos-ahorro         → kit costos-ahorro
--   cuenta-multidivisa    → kit cuenta-multidivisa
--   coberturas            → kit coberturas
--
-- REVISAR ANTES DE APLICAR, y esto no se puede resolver desde la migración:
-- si el banco de copys tiene filas bajo esos dos slugs, quedan sin rama
-- seleccionable. `copy_bank_items.branch_slug` es texto sin FK, así que nada
-- avisa.
--
--   select branch_slug, status, count(*)
--   from public.copy_bank_items
--   where branch_slug in ('control-operativo-pagos', 'banco-vs-xending')
--   group by 1, 2;
--
-- Y lo mismo para las ideas y las imágenes ya generadas, que no se borran pero
-- dejan de tener una rama activa a la que volver:
--
--   select cb.slug, count(*) as imagenes
--   from public.design_images di
--   join public.commercial_branches cb on cb.id = di.commercial_branch_id
--   where cb.slug in ('control-operativo-pagos', 'banco-vs-xending')
--   group by 1;
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
--   update public.commercial_branches
--   set is_active = true, updated_at = now()
--   where business_id = 'a0000000-0000-0000-0000-000000000001'
--     and slug in ('control-operativo-pagos', 'banco-vs-xending');
