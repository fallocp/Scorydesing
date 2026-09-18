# DesAIng — Base de servidor DAI-06/09

Fecha: 2026-09-17. Rama: `experimental/desaing`.

Esta entrega prepara persistencia y permisos del experimento. Incluye una función Edge separada, migración SQL, adaptadores de Supabase y pruebas locales. No se ha aplicado la migración a Supabase, desplegado la función, conectado las pantallas al servidor ni ejecutado proveedores de imagen. La integración local de Presentaciones sigue disponible como antes.

## Contrato y responsabilidades

`supabase/functions/desaing-server/index.ts` inicia con `DESAING_SERVER_ENABLED` apagado si no vale exactamente `true`. El gateway exige JWT y la función llama `auth.getUser(token)` antes de consultar datos. El actor procede de Auth; enviar otro actor en una operación se rechaza. Los orígenes de navegador deben figurar en `DESAING_ALLOWED_ORIGINS`, separados por comas. Las claves de servicio permanecen dentro de la función.

La entrada JSON admite leer, encolar, cancelar, recuperar trabajos, aprobar dirección y revisar resultados. Rechaza comandos de worker, importaciones de metadatos arbitrarias, cuotas, costos, autorizaciones o políticas suministrados por el navegador. Limita el cuerpo a 256 KiB y verifica su tamaño real durante la lectura.

Cada negocio dispone de una política administrativa, un snapshot con trabajos/catálogo y auditoría de cambios. `owner`, `admin` y `editor` pueden modificar ese estado; `viewer` sólo puede leerlo. Ser administrador de un negocio no otorga acceso al prompt maestro ni permite configurar cuotas desde el navegador.

Los destinos de una operación incluyen documento, slide/página y revisión. Esta entrega no accede ni modifica esos documentos: antes de aplicar resultados, la futura integración deberá comprobar permisos y revisión del documento real. Tampoco sincroniza automáticamente IndexedDB con Supabase.

## Consistencia y consumo

El coordinador lee un estado y calcula una transición con los módulos compartidos. La RPC guarda snapshot, reserva y evento de auditoría en una misma transacción, únicamente si la revisión leída sigue vigente. Revalida membresía, negocio activo y política bajo locks de PostgreSQL. Dos operaciones que compiten no pueden confirmar ambas contra la misma revisión.

- La misma `operation_key` y el mismo encargo recuperan el trabajo existente. Cambiar el encargo conservando esa clave produce conflicto.
- Sólo un rechazo explícito por revisión obsoleta permite recalcular y reintentar, hasta seis veces. Una excepción de comunicación puede esconder una escritura confirmada: no se repite automáticamente.
- Los intentos de ejecución se registran antes de cualquier futuro envío. Una llamada vencida queda `uncertain`, conserva su reserva y no vuelve a la cola como un intento nuevo.
- Cambiar límites, perfiles o estimación exige un `policy_id` nuevo. El rebase conserva trabajos y catálogo. Reducir cuotas bloquea altas nuevas; permite cancelar, recuperar, revisar y conciliar trabajos existentes.
- `desaing_policies.enabled = false` bloquea trabajo nuevo y permite recuperación/revisión. El flag global de la función apaga toda la entrada HTTP, por lo que para conciliar debe mantenerse encendido con la política del negocio deshabilitada.
- Una respuesta posterior no puede borrar evidencia previa de uso, identificador de request o resultados ya recibidos. Se rechaza evidencia contradictoria.

Las reservas se calculan con `reservation_per_output_micro_usd`, configurado por servidor, y con la cantidad de salidas del plan. **Es una estimación, no una tarifa comprobada ni una garantía del importe facturado.** La conciliación registra el consumo observado; si supera lo reservado, reduce o agota la capacidad de los siguientes trabajos. Las cuotas son acumuladas por política/negocio; esta entrega no implementa periodos mensuales o renovación automática.

El estado usa un snapshot JSON con máximo 5 MiB. Este diseño permite verificar juntas las relaciones entre resultados, versiones y revisiones. No se presenta como una cola de alto volumen: requiere partición/paginación y conservación de auditoría antes de escalar. No incluye scheduler, transporte al proveedor ni permisos para ejecutar los planes de dry-run.

## Archivos privados e importación

La migración crea `desaing-assets`, separado de `design-images`. Las políticas restrictivas protegen el nuevo bucket incluso si existe una política permisiva general. Un usuario sólo puede leer un objeto cuando pertenece al negocio activo y su ruta exacta está registrada en el catálogo. El navegador no puede escribir, reemplazar ni borrar objetos del bucket.

La ruta `POST /desaing-server/assets/upload` recibe bytes `image/png` y los parámetros `business_id`, `upload_id` (UUID estable del intento), `brand_id` y `project_id`. El servidor deriva dimensiones, tamaño y SHA-256; nunca acepta esos datos como prueba aportada por el cliente. La versión se identifica con el hash y su ruta se fija al negocio y `upload_id`.

El codec inicial admite PNG estático de 8 bits, gris/RGB/gris con alfa/RGBA, sin entrelazado y **sólo chunks IHDR/IDAT/IEND**. Comprueba firma, estructura, CRC de cada chunk, flujo zlib completo, longitud y filtros de scanlines; limita archivo a 8 MiB, lado a 4096, área a 4.194.304 píxeles y chunks a 4096. PNG con metadatos adicionales, paleta, animación, JPEG y WebP requieren ampliar el codec del servidor. La biblioteca local de Presentaciones conserva PNG/JPEG/WebP; no se ha sustituido su importador.

Primero se guarda el objeto con `upsert:false`; después se confirma su versión en SQL. Ante un duplicado explícito, se comparan todos los bytes; una colisión se rechaza. Repetir la misma carga y alcance recupera la misma versión y no duplica la auditoría. PostgreSQL y Storage no comparten transacción: si falla el registro, el objeto queda privado y sin registrar. Repetir la carga original permite completarlo; la limpieza administrativa de huérfanos queda pendiente.

`POST /desaing-server/assets/url` recibe `business_id`, `asset_id` y `version_id`; verifica la versión y devuelve una URL de 60 segundos. Las URL firmadas no entran en los metadatos durables. Una URL ya emitida sigue siendo un enlace de acceso hasta que expire; revocar la membresía impide emitir otras.

## Migración y aislamiento

- Migración preparada: `supabase/migrations/202609170001_desaing_server_foundation.sql`.
- Tablas nuevas: `desaing_policies`, `desaing_state`, `desaing_audit`.
- RPC de servicio: `desaing_read_state` y `desaing_commit_state`. No son ejecutables por `anon` ni `authenticated`.
- Las tablas de estado/auditoría no aceptan escrituras directas del cliente ni del rol de servicio; éste utiliza las RPC. La política administrativa sólo puede modificarse con privilegios de servicio.
- El helper privado comprueba membresía mediante nombres calificados y `search_path` vacío, sin depender de las políticas recursivas antiguas de membresía.
- No se insertaron políticas para negocios reales. Los valores predeterminados son deshabilitado y cuota cero.
- `supabase/tests/desaing-bootstrap.sql` crea un esquema mínimo **exclusivo para pruebas**. No debe ejecutarse sobre una instancia Supabase.

## Verificación

Las pruebas del estado comprueban relaciones entre trabajos/resultados/catálogo, aprobación por etapas, cuotas, rebase y conservación de evidencia. Las de la entrada HTTP usan Auth y Storage simulados para comprobar contratos, orden de verificación, denegaciones, tamaños, reintentos y archivos PNG reales.

La suite SQL ejecuta la migración real en PostgreSQL WASM mediante PGlite, incluyendo roles, RLS, RPC, trigger de política y auditoría. Usa un bootstrap mínimo de Supabase. PGlite trabaja con una sola conexión: demuestra CAS y serialización de solicitudes lógicas, **no contención física entre conexiones ni comportamiento del gateway/Auth/Storage desplegados**. La validación de esos servicios queda para el entorno aislado.

Comandos reproducibles desde la raíz:

```powershell
npm test -- supabase/functions/_shared/desaing src/lib/desaing src/lib/presentations
npx tsc -p tsconfig.desaing.json --noEmit
deno check --no-lock supabase/functions/desaing-server/index.ts
npm run build
```

**Resultado: 15 suites y 376 pruebas aprobadas**, incluyendo 43 pruebas SQL y los consumidores locales de DesAIng/Presentaciones. Las pruebas integradas del coordinador contra las RPC de PostgreSQL confirman una sola reserva/auditoría para envíos duplicados y un único ganador cuando dos solicitudes compiten por la última cuota. TypeScript estricto y la comprobación Deno de la función también pasaron. No se repitieron las pruebas visuales del navegador: este bloque no modifica las pantallas.

`npm run build` también pasó; conserva los avisos existentes de tamaño del bundle e importación dinámica/estática del cliente Supabase. El documento base y el `deno.lock` previo conservan sus hashes, sin cambios de esta entrega.

## Siguiente integración

Conectar el cliente experimental con estos contratos y preparar el worker con transporte simulado, validando el destino HTML y manteniendo una sola ejecución por operación. Antes de usar proveedores reales hacen falta destino Supabase aislado verificado, pruebas de concurrencia en varias conexiones, codec de resultados compatible, autorización de presupuesto y prueba del transporte real. Los dos ejecutores de imagen del plan conservan sus contratos; esta entrega no activa ninguno.

Referencias técnicas: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [funciones de PostgreSQL en Supabase](https://supabase.com/docs/guides/database/functions), [verificación getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [locks de PostgreSQL](https://www.postgresql.org/docs/17/explicit-locking.html), [API de PGlite](https://pglite.dev/docs/api).
