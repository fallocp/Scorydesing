-- ---------------------------------------------------------------------------
-- image_library: liga al mockup que la originó
-- ---------------------------------------------------------------------------
-- Cuando se genera una imagen del Design Studio quedan DOS copias de los mismos
-- bytes: `image_library.image_base64`, que inserta la edge function, y el archivo
-- en el bucket `design-images` que sube el cliente al guardar el mockup. Y no hay
-- nada que las relacione, así que borrar el mockup dejaba la copia de la
-- biblioteca viva y la imagen seguía apareciendo en el catálogo de assets.
--
-- La liga se agrega en image_library y no al revés porque la fila de la
-- biblioteca nace ANTES que el mockup: la función la inserta al generar la imagen
-- y el cliente crea el mockup después, con el base64 que recibe de vuelta.
--
-- ON DELETE CASCADE es el punto: con la liga puesta, borrar el mockup se lleva su
-- copia de la biblioteca sin que el cliente tenga que acordarse de hacerlo. Un
-- borrado que depende de que alguien escriba la segunda mitad es un borrado que
-- tarde o temprano deja basura.
--
-- Nullable a propósito: el pipeline también genera imágenes por esta vía y no
-- produce mockups. Esas filas viven sin liga, que es lo correcto — no hay nada de
-- lo que colgarlas.
-- ---------------------------------------------------------------------------

alter table public.image_library
  add column if not exists mockup_id uuid
    references public.design_mockups (id) on delete cascade;

comment on column public.image_library.mockup_id is
  'Mockup que originó esta imagen, cuando viene del Design Studio. Al borrar el mockup se borra esta fila (CASCADE). Null para imágenes del pipeline, que no generan mockup.';

-- El borrado en cascada busca por esta columna, y el catálogo filtra por ella
-- para no mostrar dos veces la misma imagen.
create index if not exists idx_image_library_mockup
  on public.image_library (mockup_id)
  where mockup_id is not null;

-- Nota sobre las filas anteriores a esta migración: se quedan con mockup_id null,
-- así que sus duplicados siguen ahí. No se intenta un backfill porque la única
-- forma de emparejarlas sería por business_id y cercanía de created_at, y una
-- coincidencia equivocada borraría la imagen equivocada al borrar un mockup. Si
-- hay que limpiarlas, va aparte y a mano.
