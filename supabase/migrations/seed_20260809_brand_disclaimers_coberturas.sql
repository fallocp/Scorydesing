-- ---------------------------------------------------------------------------
-- Seed: coberturas / forwards legal texts as brand_disclaimers presets
-- ---------------------------------------------------------------------------
-- These are the three notes defined in section 11 of
-- docs/prompts/copy-banks/_contexto-maestro.coberturas.md. They land in
-- `brand_disclaimers` so they show up in the same picker as the existing FX
-- texts when the brand layer is composited onto a piece (BrandLayerDialog →
-- useBrandDisclaimers), instead of being retyped by hand for every carousel.
--
-- Why three and not one: the note has to match the claim it qualifies.
--   general          → any piece that names a forward or a defined-in-advance rate
--   educativo        → explainer pieces about how a hedge works
--   ejemplo numérico → the only case where a figure appears
--
-- The copy-level equivalent lives in copy_bank_items.legal_note, set from the
-- kit's legal_note for the 17 forward copies. This table is the piece-level
-- layer: what actually gets painted at the foot of the image.
--
-- Idempotent: guarded by NOT EXISTS on (business_id, brand_key, label), since
-- the table has no unique constraint on that triple.
--
-- sort_order starts at 50 so these sit after whatever presets already exist
-- without renumbering them.
--
-- Depends on: 20260801_brand_layer_tables.sql, business_tenants.
-- ---------------------------------------------------------------------------

insert into public.brand_disclaimers (
  business_id, brand_key, label, body, is_default, is_active, sort_order
)
select
  b.id, v.brand_key, v.label, v.body, false, true, v.sort_order
from (values
  (
    'xending',
    'Coberturas — general',
    'Productos sujetos a disponibilidad, condiciones de mercado, documentación, aprobación y términos de contratación.',
    50
  ),
  (
    'xending',
    'Coberturas — educativo',
    'Información con fines ilustrativos. Las condiciones dependen del producto y de la operación contratada.',
    51
  ),
  (
    'xending',
    'Coberturas — ejemplo numérico',
    'Ejemplo ilustrativo. No representa una cotización.',
    52
  )
) as v(brand_key, label, body, sort_order)
cross join (select id from public.business_tenants where slug = 'xending') b
where not exists (
  select 1
  from public.brand_disclaimers d
  where d.business_id = b.id
    and d.brand_key = v.brand_key
    and d.label = v.label
);

-- Verificación
select brand_key, label, sort_order, is_active
from public.brand_disclaimers
where label like 'Coberturas%'
order by sort_order;
