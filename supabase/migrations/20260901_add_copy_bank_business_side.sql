-- ---------------------------------------------------------------------------
-- copy_bank_items.business_side
-- ---------------------------------------------------------------------------
-- Lado de la operación para los copys de coberturas verticalizados:
--   importador -> compra / paga en moneda extranjera (costo en pesos variable)
--   exportador -> vende / cobra en moneda extranjera (ingreso en pesos variable)
--
-- Null para los copys no segmentados por lado (banco maestro general/industria,
-- velocidad, costos-ahorro, cuenta-multidivisa). Permite separar en el panel los
-- verticales de importador vs exportador, que comparten branch='coberturas' y
-- corridor='industria' y por eso no se distinguen por esos ejes.
--
-- Debe correr ANTES de los seeds que insertan business_side (los seed_*.sql se
-- ordenan después de las migraciones con prefijo numérico).
-- ---------------------------------------------------------------------------

alter table public.copy_bank_items
  add column if not exists business_side text
    check (business_side in ('importador', 'exportador'));

comment on column public.copy_bank_items.business_side is
  'Lado de la operación para copys de coberturas verticales: importador (compra/paga en USD) o exportador (vende/cobra en USD). Null para copys no segmentados por lado.';

create index if not exists copy_bank_items_business_side_idx
  on public.copy_bank_items (business_id, branch_slug, business_side)
  where business_side is not null;
