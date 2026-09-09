-- ---------------------------------------------------------------------------
-- copy_bank_items: texto EN-US y el ID original de los MD
-- ---------------------------------------------------------------------------
-- Prepara la tabla para el ingest de los 263 copys de Xending USA. Debe correr
-- ANTES del seed del banco: los `seed_*.sql` se ordenan después de las
-- migraciones con prefijo numérico.
--
-- No toca ninguna fila existente. Las cuatro columnas son nullable y sin default,
-- así que los copys de México quedan igual: `legacy_id` y el bloque en inglés en
-- NULL, que es la verdad — no tienen ninguno de los dos.
-- ---------------------------------------------------------------------------

alter table public.copy_bank_items
  add column if not exists headline_en text,
  add column if not exists subcopy_en text,
  add column if not exists cta_en text,
  add column if not exists legacy_id text;


-- ---------------------------------------------------------------------------
-- EN-US: columnas en la misma fila, y sin columna de estado
-- ---------------------------------------------------------------------------
-- POR QUÉ COLUMNAS Y NO FILAS
--
-- El §11 de los MD trata la pieza como una sola con dos estados editoriales
-- independientes, no como dos piezas. Filas separadas con un eje `language`
-- duplicarían `copy_bank_items_headline_unique_idx` y obligarían a emparejar
-- filas para saber que son la misma pieza. El precedente es
-- 20260901_add_copy_bank_business_side.sql, que agregó un eje así.
--
-- POR QUÉ NO HAY `editorial_en_status`
--
-- Porque hoy no distinguiría nada. Los cinco MD reportan `approved_en_us: 0`, así
-- que el estado del inglés es el mismo en las 263 filas: pendiente. Una columna
-- con un solo valor es una columna que hay que mantener sin que nadie la consulte.
--
-- Cuando empiece la revisión del inglés, agregarla es un `add column` con default
-- y no rompe nada. Ese es el momento de crearla, no ahora.
--
-- EL INGLÉS GUARDADO ES DATO INERTE
--
-- Nada del pipeline de generación lee estas tres columnas, y no por omisión:
-- `analyzeCopyBank` selecciona columnas explícitas
-- (`headline, cta, angle_tag, corridor, status, created_at`), así que agregar
-- columnas a la tabla no las mete al prompt. El único `select('*')` sobre esta
-- tabla es `useCopyBankV2`, un hook de UI que alimenta la tabla en pantalla.
--
-- O sea: el inglés viaja pegado a su pieza y no puede salir publicado por
-- accidente. Es exactamente el estado que queremos mientras no esté aprobado.
--
-- SIN ÍNDICE ÚNICO SOBRE `headline_en`
--
-- El único que existe protege el banco aprobado en español. En inglés no hay
-- banco aprobado que proteger, y un único sobre `headline_en` rechazaría filas a
-- media carga por duplicados de un texto que de todas formas se va a reescribir.
-- ---------------------------------------------------------------------------

comment on column public.copy_bank_items.headline_en is
  'Titular EN-US. Propuesta sin aprobar: los cinco MD de Xending USA reportan approved_en_us = 0. No hay columna de estado porque hoy el estado es uniforme. NULL en los copys de México.';

comment on column public.copy_bank_items.subcopy_en is
  'Apoyo EN-US. Mismo estado que headline_en: propuesta, nunca aprobada.';

comment on column public.copy_bank_items.cta_en is
  'CTA EN-US. Se escribe desde el significado aprobado, no traduciendo. Ver §5 de los MD para las equivalencias por intención y las dos prohibiciones explícitas: "Protect your costs" y "lock today''s spot rate".';


-- ---------------------------------------------------------------------------
-- legacy_id: el ID con el que la pieza vive en los MD
-- ---------------------------------------------------------------------------
-- VEL-01, FX-03, OPC-13. Hasta ahora no tenían dónde vivir, y hacen falta porque
-- los cinco MD se referencian entre sí por ID cuando documentan un reacomodo.
--
-- EL PREFIJO NO INDICA RAMA
--
-- Esto es lo único de esta migración que se puede malinterpretar en silencio. El
-- usuario reubicó piezas conservando su ID, así que `VEL-32`, `VEL-34`, `VEL-38`,
-- `VEL-39` y `VEL-45` viven en Masivos, y `VEL-37`, `VEL-42` y `VEL-43` en
-- Plataforma. La rama de una pieza es el MD donde está su registro, nunca su
-- prefijo. El parser del ingest deriva `branch_slug` del archivo, no del ID.
--
-- SIN CONSTRAINT ÚNICO, A PROPÓSITO
--
-- No está verificado si algún ID se repite entre los cinco MD. Un único que
-- rechace filas a media carga es peor que un duplicado visible en pantalla: el
-- primero deja el ingest a medias y sin decir cuáles faltaron, el segundo se
-- corrige editando dos filas.
--
-- El parser corre una pasada de detección y reporta los repetidos. Si al final
-- resultan únicos, se puede agregar el constraint entonces, con los datos ya
-- cargados y sabiendo que pasa.
-- ---------------------------------------------------------------------------

comment on column public.copy_bank_items.legacy_id is
  'ID de la pieza en los MD fuente (VEL-01, FX-03, OPC-13). El prefijo NO indica rama: hay piezas reubicadas que conservaron su ID, así que la rama sale del MD donde está el registro. Sin constraint único porque no está verificado si se repiten entre archivos. NULL en los copys de México.';

-- Búsqueda por ID, que es como el usuario se refiere a las piezas al revisar.
-- Parcial porque las 222 filas de México lo tienen en NULL.
create index if not exists copy_bank_items_legacy_id_idx
  on public.copy_bank_items (business_id, legacy_id)
  where legacy_id is not null;


-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
-- Las cuatro columnas presentes y nullable:
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'copy_bank_items'
--     and column_name in ('headline_en', 'subcopy_en', 'cta_en', 'legacy_id')
--   order by column_name;
--
-- Ninguna fila existente tocada. Debe devolver 0:
--
--   select count(*) from public.copy_bank_items
--   where headline_en is not null
--      or subcopy_en is not null
--      or cta_en is not null
--      or legacy_id is not null;
--
-- Después del ingest de USA, esa misma query debe devolver el número de copys
-- cargados con inglés, y esta debe seguir en 0:
--
--   select count(*) from public.copy_bank_items
--   where business_id = 'a0000000-0000-0000-0000-000000000001'
--     and legacy_id is not null;
--
-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- Destructivo si el ingest ya corrió: se pierde el inglés y los IDs originales.
-- Los IDs se pueden reconstruir desde los MD; el inglés también, pero perdiendo
-- cualquier edición hecha en la aplicación.
--
--   drop index if exists public.copy_bank_items_legacy_id_idx;
--   alter table public.copy_bank_items
--     drop column if exists headline_en,
--     drop column if exists subcopy_en,
--     drop column if exists cta_en,
--     drop column if exists legacy_id;
-- ---------------------------------------------------------------------------
