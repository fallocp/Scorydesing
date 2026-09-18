# DesAIng DAI-02 — Adaptador de imágenes, preparación local y respuestas

**Fecha:** 17 de septiembre de 2026.  
**Estado:** construcción de requests y normalización implementadas y probadas localmente.  
**Plan:** [DesAIng 2.2](./DESAING_EXPERIMENTAL_PLAN.md).  
**Base:** [contratos y mapa DAI-01](./DESAING_DAI01_CONTRACT_MAP.md).

## 1. Entrega y alcance

El adaptador convierte operaciones autorizadas del contrato DAI-01 en solicitudes revisables de Images API. Generación textual produce JSON; referencias y edición de una base producen multipart con archivos reales. Se conserva la diferencia entre crear un asset nuevo con referencias y crear una versión hija de una imagen existente.

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/_shared/desaing/imageRequest.ts` | Construcción de JSON/FormData, resolución de archivos por identidad/version, validación de entrada, manifiesto y prompt efectivo. |
| `supabase/functions/_shared/desaing/imageResponse.ts` | Normalización de imágenes, consumo, request ID, duración y errores; resultados inciertos sin reintento automático. |
| `supabase/functions/_shared/desaing/__tests__/imageRequest.test.ts` | 23 casos de bytes, MIME, orden, paridad, contexto y alcance. |
| `supabase/functions/_shared/desaing/__tests__/imageResponse.test.ts` | 21 casos de respuestas completas/parciales, errores y métricas. |

No hay `fetch`, secretos, endpoint desplegado, almacenamiento ni ejecutor real en estos módulos. `prepareImageRequests` devuelve `execution: 'dry_run'` y `live_execution_allowed: false`. DAI-01 continúa sin ejecutar proveedores. Los consumidores productivos actuales permanecen intactos.

## 2. Construcción y referencias

- `buildImageWireRequest` recibe perfil del catálogo, prompt efectivo, cantidad, calidad y tamaño explícitos. No admite un modelo arbitrario ni lo sustituye ante errores.
- Los campos opcionales `output_format` y `background` solo se agregan cuando se piden. Su omisión conserva el request baseline de cinco campos: modelo, prompt, cantidad, tamaño y calidad.
- Una imagen entra como `image`; varias, como `image[]`, manteniendo orden. El cliente HTTP deberá dejar que FormData establezca el boundary, sin fijar manualmente Content-Type.
- El resolver recibe negocio, asset y versión. Su respuesta debe corresponder a esa misma identidad; se rechaza un archivo de otro negocio, asset o versión. Esto comprueba coherencia del contrato, no sustituye autorización real de Storage/RLS.
- Se validan archivo no vacío, límite local de menos de 50 MB, MIME admitido y firma PNG/JPEG/WebP. No se convierte JPEG en PNG por cambiar la etiqueta. La validación es de cabecera: no acredita decodificación completa, dimensiones ni alfa.
- El manifiesto guarda posición, identidad, propósito, roles e IDs de referencia/candidato. El prompt describe esos vínculos; combinar candidatos 1 y 3 no los renumera silenciosamente como si fueran candidatos 1 y 2.
- La imagen base va primero en edición, recreación y versión medium. La combinación adjunta los candidatos seleccionados antes de referencias adicionales.
- La captura y región del HTML viajan juntas. Un candidato que omite la captura necesaria se rechaza; el prompt solicita un asset independiente para esa región.
- Cada conjunto de cinco produce cinco solicitudes con `n=1`, prompt y clave propios. Una caché limitada a esa preparación resuelve cada asset/version una sola vez; no cruza operaciones ni empresas.
- El snapshot se toma antes de esperar archivos: cambiar después la selección, el target o la referencia no reasigna el resultado preparado.
- HTML, montaje y aprobaciones no preparan solicitudes de imagen ni leen sus archivos. Un executor Responses no se transforma silenciosamente en Image API: necesita su adaptador posterior.

**Prompt efectivo:** multipart normaliza los saltos de línea a CRLF. La preparación registra esa misma representación para que coincida con el campo serializado. JSON conserva el texto recibido.

## 3. Paridad y diferencias deliberadas

Las pruebas de paridad comparan el request al proveedor, no declaran migrados los consumidores legacy. Se mantienen campos, prompts, cantidades y tamaños entregados al serializador, incluso presets históricos pendientes de corregir en DAI-03. El baseline PNG conserva el campo singular `image` y nombre `reference.png`.

La ruta experimental transmite varias referencias con sus MIME correctos y agrega formato/fondo cuando fueron autorizados. Esto no modifica todavía `generate-design-mockups`: su flujo productivo de referencia sigue requiriendo la corrección e integración posterior. El experimento tampoco cambia el modelo, calidad o request de Image Stock.

No se incorporó el retry de red de la integración vigente. La política de repetición y reconciliación debe depender de trabajos durables e idempotencia, pendientes en DAI-06/09.

## 4. Normalización de resultados

Se conservan imágenes base64, índice original, `revised_prompt`, consumo válido, request ID y duración. También se admite el alias histórico `b64`. Consumo ausente queda desconocido; no se inventan ceros ni importes.

| Resultado | Tratamiento |
|---|---|
| Respuesta 2xx con todos los outputs esperados | `succeeded`; conserva datos y métricas disponibles. |
| Outputs parciales, vacíos, malformados o cantidad inesperada | `uncertain`; retiene imágenes válidas y consumo para revisión. |
| Respuesta con URL sin bytes | `uncertain`; no descarga automáticamente una URL ni expone su contenido en errores. |
| HTTP 408, 5xx o interrupción después de iniciar envío | `uncertain`; requiere reconciliación. |
| Otros 4xx | `failed`; distingue límite, autenticación, política conocida y solicitud inválida. |
| Fallo previo a enviar | `failed`, sin inventar consumo. |

Los mensajes de error son fijos. No se copia el cuerpo del error del proveedor, que puede contener instrucciones, tokens o URLs. Todos los errores indican `automatic_retry: false`; un timeout no autoriza otro render. El estado del resultado tampoco aprueba una imagen para publicar.

## 5. Evidencia de verificación

**4 suites y 100 pruebas aprobadas:** 56 anteriores de DAI-01 más 44 nuevas de DAI-02.

```powershell
npm test -- supabase/functions/_shared/desaing/__tests__
```

Las pruebas serializan y vuelven a leer multipart con `Request`/`FormData` locales, verificando bytes y campos. Incluyen un PNG completo pequeño; los fixtures JPEG/WebP comprueban firma y transporte, y no se presentan como pruebas de decodificación visual. Las respuestas del proveedor se simulan. No hay llamadas de pago.

El primer arranque de Vitest fue bloqueado por `spawn EPERM` del sandbox. Con ejecución local autorizada fuera del sandbox, la primera corrida detectó la diferencia LF/CRLF del prompt; se corrigió en el adaptador y la segunda corrida pasó las 100 pruebas.

TypeScript estricto del módulo compartido, reexport y las cuatro suites pasó usando el compilador local, `--noEmit`, ES2020 y resolución bundler. El build global no se repitió: esta entrega no cambia sus consumidores y continúa pendiente la línea base de 85 diagnósticos de aplicación documentada en DAI-01.

## 6. Trabajo pendiente antes de conectar proveedores

- DAI-03: catálogo completo de tamaños, transformaciones y formatos; el serializador actual valida sintaxis y conserva tamaños baseline, no garantiza compatibilidad de todos los presets con un modelo.
- DAI-06/09: persistencia, versiones, cuotas, idempotencia y recuperación. Las claves preparadas no implementan deduplicación durable.
- DAI-18: resolver autenticado, archivos privados y referencias preparadas a partir de documentos. El resolver de esta entrega es inyectado y se prueba con archivos locales.
- Integración HTTP con timeout/cancelación, autorización efectiva y reconciliación del job; adaptador de herramientas de imagen en Responses cuando se implemente ese flujo.
- Máscaras con validación de dimensiones/alfa, decodificación completa, comprobación de output y metadatos reales. No hay máscara en el request de esta entrega.
- Cuenta/modelos, entorno aislado y presupuesto antes de pruebas reales. El catálogo sigue marcando los perfiles candidatos como no verificados en la cuenta.
- Conectar la UI y comprobar guardado, exportación y resultado visual. Todavía no hay cambios visibles en las pantallas.

## 7. Fuentes contrastadas

El formato de entradas múltiples, campos de calidad/formato y respuesta se contrastó con la [referencia oficial de edición de imágenes](https://developers.openai.com/api/reference/python/resources/images/methods/edit), la [respuesta de Images API](https://developers.openai.com/api/reference/resources/images/methods/edit) y la [guía oficial de generación](https://developers.openai.com/api/docs/guides/image-generation). La comprobación local no acredita disponibilidad de una cuenta ni fidelidad visual del proveedor.

La paridad se contrastó con `supabase/functions/generate-design-image/index.ts` y `supabase/functions/generate-design-mockups/index.ts`, sin modificar esas funciones.
