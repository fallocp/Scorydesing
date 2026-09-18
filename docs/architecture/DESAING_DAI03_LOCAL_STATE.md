# DesAIng — Formatos, versiones y trabajos locales

Fecha: 17 de septiembre de 2026. Rama: `experimental/desaing`.

> Entrega histórica anterior al laboratorio. La comprobación real de DAI-04 detectó una carrera entre pestañas y reemplazó localStorage + Web Locks por transacciones de IndexedDB. El estado vigente y la evidencia están en [DAI-04](./DESAING_DAI04_VISUAL_LAB.md).

Entrega: DAI-03 como catálogo compartido experimental y base local de DAI-06/09. El laboratorio puede conservar metadatos de versiones, registrar una operación antes de simular su ejecución, reservar capacidad, recuperar estados y distinguir cada candidato. Todavía no hay pantalla conectada, proveedor real, almacenamiento binario ni cola de servidor.

## Archivos y alcance

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/_shared/desaing/formats.ts` | 14 presets; tamaño final separado de generación; validación; geometría contain/cover sin deformar. |
| `supabase/functions/_shared/desaing/planner.ts` | Valida el tamaño experimental antes de preparar archivos o requests. |
| `supabase/functions/_shared/desaing/assets.ts` | Catálogo por negocio, versiones y objetos independientes, padres/referencias/candidatos, dirección, revisión final y colocaciones. |
| `supabase/functions/_shared/desaing/jobLedger.ts` | Registro, deduplicación, reserva, estados por llamada/candidato, recuperación, revisión y conciliación de costo simulado. |
| `src/lib/desaing/localDesignStore.ts` | Persistencia de metadatos mediante un valor de localStorage por negocio y Web Locks para transacciones entre pestañas del mismo origen. |

No se conectaron consumidores productivos ni se cambiaron sus requests/defaults. Los formatos existentes en `design-studio.ts` y `hydrateTemplate.ts` siguen pendientes de migración al catálogo cuando sus flujos entren al experimento. Se detectó una diferencia previa de LinkedIn horizontal: 1200×628 en tipos de UI y 1200×627 en hydrateTemplate.

## Formatos

- 1080×1350 es un lienzo final; su preset de generación usa 1088×1360. Presentación y portada 1920×1080 usan 2048×1152 cuando se pide una imagen completa.
- Página vertical, diseños especiales y assets independientes tienen contratos distintos. Los presets custom admiten composición sin ninguna generación.
- Portada de página LinkedIn 1512×256 se compone con assets. El preset de portada personal permanece bloqueado por falta de dimensiones confirmadas.
- Las dimensiones sociales proceden del plan y conservan `pending_platform_verification`; no se presentan como especificaciones oficiales ni se inventan safe areas.
- `contain` y `cover` calculan posición, escala uniforme y región de recorte; el plan declara si el recorte requiere aprobación. No realiza el recorte ni concede aprobación.
- Restricciones de generación verificadas en la [guía oficial de imágenes](https://developers.openai.com/api/docs/guides/image-generation): múltiplos de 16, lado máximo 3840, proporción máxima 3:1 y área entre 655360 y 8294400 píxeles. La validación documental no demuestra acceso de la cuenta ni resultado real.

El builder de bajo nivel DAI-02 mantiene su comportamiento de paridad legacy; el planner experimental exige las dimensiones válidas. Así se evita alterar el flujo anterior al introducir el catálogo.

## Versiones y revisión

Cada versión registra negocio, marca, proyecto, identidad exacta, ruta privada, MIME, dimensiones y tamaño. Las generaciones añaden operación, modelo, calidad, prompt efectivo, referencias, salida y procedencia. No se guardan base64 ni URLs firmadas en el catálogo. La metadata no sustituye comprobar/subir los bytes reales.

Una edición crea una hija de la base exacta. Una imagen nueva con referencias crea otro asset. Una combinación conserva los candidatos seleccionados y su orden; no se convierte en una edición de uno de ellos por accidente. No se permite sobrescribir una versión ni reutilizar su ruta como otro archivo.

Aprobar dirección registra candidato y restricciones sin generar otra imagen. La promoción a medium requiere esa aprobación y crea una versión pendiente de revisión. Generar directamente en medium en un encargo definido sigue siendo posible. La aprobación final es distinta y se conserva como decisión separada.

El montaje registra una colocación por versión aprobada, documento/revisión y región. Permite reutilizar la misma imagen en presentación y portada sin copiarla ni generar otra. Este bloque guarda el manifiesto: todavía no modifica HTML, exporta ni comprueba visualmente el montaje.

## Trabajos y persistencia

1. `enqueueImageJob` vuelve a validar alcance/autorización simulada, congela el plan y reserva todo el lote. La misma clave y alcance recuperan el trabajo; una clave usada con parámetros distintos produce conflicto.
2. `beginJobCall` registra un único intento y plazo antes de cualquier simulación. No autoriza enviar un request real. Todas las operaciones mantienen `dry_run` y cero llamadas reales.
3. La respuesta normalizada se registra junto con las versiones guardadas. El store coteja negocio, operación, candidato, modelo, calidad, padre, referencias, restricciones y revisión. Registrar sólo el resultado o atribuirle un asset ajeno falla sin escritura parcial.
4. Se conservan `pending`, `running`, `result_received`, `validating`, `needs_review`, `approved`, `rejected`, `failed`, `cancelled` y `uncertain` por llamada. Un lote de cinco puede tener resultados válidos, fallidos y pendientes simultáneamente.
5. Al recuperar, un intento cuyo plazo venció queda incierto; uno aún vigente se conserva. Se admite el resultado tardío del mismo intento. No hay reintento automático ni reinicio de un trabajo incierto.
6. Cancelar pendientes libera su reserva. Cancelar una llamada iniciada conserva el costo estimado y marca incertidumbre; no promete cancelar al proveedor.
7. Se usan enteros en microdólares para estimaciones explícitas del laboratorio y límites de outputs. Un consumo desconocido conserva su reserva. La conciliación con evidencia registra el costo real incluso si supera lo estimado y bloquea capacidad nueva. No hay tarifas inventadas ni presupuesto real autorizado.
8. Las transiciones guardan su fecha más reciente y rechazan escrituras anteriores. Al reabrir se validan relaciones y estados; corrupción, cambio de esquema o cambio de política de cuota detienen la recuperación sin vaciar la cola.

`LocalDesignStore.transact` aplica cambios puros sin I/O externo dentro del bloqueo. La validación, reserva y escritura comparten una transacción local. Un fallo de validación o de cuota de almacenamiento conserva el valor anterior. Si Web Locks o almacenamiento no están disponibles, el adaptador falla de forma visible; no degrada silenciosamente a memoria.

## Evidencia

Comando ejecutado:

```powershell
npm test -- supabase/functions/_shared/desaing/__tests__ src/lib/desaing/__tests__
```

Resultado: **8 suites y 187 pruebas aprobadas**. Incluyen 100 pruebas previas y 87 nuevas de formatos, assets, trabajos y persistencia. TypeScript estricto de los módulos y pruebas también pasó.

Se comprobaron doble clic, carrera de dos clientes por la última reserva, reapertura serializada, cancelación, timeout, conciliación tardía, fallo parcial entre cinco candidatos, límites de geometría, linaje y medium, aprobación final conjunta, corrupción y errores de almacenamiento. Los tests de persistencia inyectan implementaciones de Storage y del bloqueo compartido; no equivalen a una prueba visual ni a una prueba real de Web Locks/localStorage en navegador.

La revisión adicional reprodujo y corrigió estados recibidos disfrazados de pendientes, cambios silenciosos de política, cronología inconsistente, padres equivocados y divergencia entre aprobación del job y del asset.

El build global no se repitió: siguen pendientes los **85 diagnósticos previos**, reproducidos independientemente en DAI-01 excluyendo los módulos nuevos. Esta entrega no declara verde la aplicación completa.

## Lo que falta antes de llamadas reales

- Conectar el laboratorio y comprobar en navegador guardado, reapertura y bloqueo entre pestañas; el modo local puede perderse si el usuario borra datos o el navegador los elimina.
- Completar binarios, decodificación de imágenes, validación de MIME/dimensiones, transporte/resolución de referencias y persistencia de outputs reales.
- Fijar el request efectivo y su revisión antes de envío, con autorización autenticada y comprobación del estado actual del target.
- Llevar el registro previo, idempotencia y cuotas a una transacción del servidor con worker/cola según el entorno. localStorage es editable por el usuario y no autentica ni coordina otros dispositivos o empresas.
- Definir tenant/namespace experimental, presupuesto, tarifas verificadas y conciliación del proveedor; no habilitar pagos sólo porque estos tests pasen.
- Resolver el build previo y preparar IDs/revisiones, HTML seguro y exportación para el recorrido “un avión que encaje aquí”.

DAI-06/09 quedan entregados como **fundación local**, no como persistencia durable de servidor ni flujo de producción completo. La siguiente integración es laboratorio con proveedores simulados, referencias y montaje sobre el HTML estable.
