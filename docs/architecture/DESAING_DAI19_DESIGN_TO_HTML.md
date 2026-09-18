# DAI-19 — Diseño visual completo → HTML editable

Fecha: 18 de septiembre de 2026. Rama prevista del experimento: `experimental/desaing`. Al cierre, el checkout observado es `feat/xending-usa`, sobre el mismo commit `7829a2f`; el reflog registra el cambio de rama a las 08:16:50 CDMX durante el trabajo. Se conservó ese checkout y los cambios permanecen sin commit.

Presentaciones permite preparar un diseño completo, revisarlo y convertirlo en texto, formas y piezas editables. También puede partir de un diseño elegido que el usuario suba directamente. Continúa la entrega de [referencias, recreación y extracción](./DESAING_DAI18_REFERENCES_AND_PIECES.md).

## Recorrido disponible

1. En el panel experimental de una diapositiva, elegir **Diseño completo**. Se conservan por separado las instrucciones de **Pieza en región** y las de diseño completo, junto con referencias y contenido aprobado.
2. Ejecutar un encargo definido o usar **Explorar diseño** y la galería compartida. Seleccionar ideas no genera imágenes; cada borrador requiere una acción explícita y cupo disponible.
3. Generar `low`, aprobar dirección, solicitar `medium` y revisar el resultado final. La versión media conserva el padre exacto, referencias, texto y formato; constituye una nueva ejecución.
4. Elegir **Usar diseño para HTML** sobre la versión aprobada. Sólo transfiere la referencia y el contenido: todavía no solicita la conversión ni modifica el slide.
5. Como entrada alternativa, abrir **Usar diseño para HTML** y subir un diseño elegido. PNG, JPEG o WebP se normalizan proporcionalmente a PNG para este flujo.
6. Revisar **Texto aprobado**: hasta doce bloques, una línea por bloque en la interfaz y la primera como título. Marcar la revisión y pulsar **Crear HTML editable** autoriza una solicitud de visión.
7. Comparar **Diseño de referencia** y **Composición editable**. La interfaz muestra cuántos textos, formas y espacios para piezas contiene el resultado.
8. Resolver cada espacio: reutilizar una pieza de la biblioteca, subirla, **Extraer del diseño** con revisión manual o **Omitir esta pieza** explícitamente. Los espacios pendientes impiden aplicar.
9. Pulsar **Aplicar HTML revisado**. Sólo cambia la diapositiva seleccionada si conserva su revisión; después el editor visual permite ajustar texto, tipografía y geometría independientemente de las imágenes.

**Dejar como imagen** continúa siendo una alternativa explícita para montar el diseño completo como un bitmap. En ese resultado, los textos dibujados dentro de la imagen no son editables como texto HTML.

## Visión, composición e imágenes

| Trabajo | Implementación y límites de esta entrega |
| --- | --- |
| Diseño visual completo | Flare `low` y `medium`, mediante Image API o la herramienta de imagen de Responses; un ejecutor por operación. |
| Formatos de diseño completo | Horizontal 1536×864, vertical 1088×1408 o cuadrado 1024×1024, según orientación del lienzo. Son formatos discretos; no representan todas las proporciones posibles. |
| Lectura del diseño para HTML | `gpt-5.4-mini` mediante Responses, con el PNG real como `input_image`, detalle `high` y salida JSON con esquema estricto. |
| Límites de conversión | 8192 tokens de salida; referencia de hasta 1536 px por lado y 8 MiB; request de metadatos de hasta 98304 bytes. |
| Piezas tras convertir | Compilación, asignación, recorte manual, reutilización y montaje locales; estas acciones no invocan generación de imágenes. |

El servidor de conversión envía únicamente los píxeles de `design_reference`; otras referencias del contexto son metadatos. Recupera esa versión exacta de Storage privado, comprueba el PNG completo, dimensiones, longitud y SHA-256. Admite una imagen subida explícitamente o un resultado de generación con aprobación final; aprobar sólo la dirección no basta.

La conversión usa `tools: []`, `tool_choice: none`, `store: false` y una llamada sin reintento automático. Las APIs de imagen continúan produciendo archivos raster; el modelo de visión propone la estructura editable. OpenAI documenta la entrada de imágenes y las salidas estructuradas de [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), y distingue análisis visual de generación en [Images and vision](https://developers.openai.com/api/docs/guides/images-vision).

Las cinco ideas iniciales siguen siendo planificación textual con roles y huellas de referencias. No se atribuye lectura de sus píxeles a esa fase ni se generan cinco imágenes automáticamente.

## Texto aprobado y compilador

El [contrato compartido](../../supabase/functions/_shared/desaing/composition.ts) fija un hash SHA-256 sobre los bloques aprobados, su orden, identificadores, roles y texto literal. El contexto lleva la misma versión de contenido. La solicitud se copia antes de verificaciones asíncronas para que una edición concurrente no cambie lo autorizado.

El modelo devuelve geometría y estilos, con un `copy_id` por bloque exactamente una vez. El compilador inserta el texto aprobado escapado; nunca sustituye ese contenido por transcripción de la imagen ni acepta HTML arbitrario del modelo.

El esquema admite hasta doce textos, doce formas y seis espacios para imágenes. Valida cajas dentro del lienzo, colores, fuentes, tamaños y estilos acotados. El [compilador HTML](../../src/lib/presentations/presentationComposition.ts) genera elementos nativos, imágenes PNG incrustadas e identidades de assets; la previsualización usa un iframe aislado.

La aplicación vuelve a verificar referencia, contenido, actor, piezas autorizadas y revisión de destino antes de aplicar. Un resultado antiguo no sobrescribe ediciones posteriores. La comparación humana sigue siendo necesaria para valorar composición, ajuste de textos y fidelidad visual.

## Persistencia, recuperación y presupuesto

La frontera autenticada añade `/html/plan`, `/html/recover`, `/html/history`, `/html/capabilities` y `/html/import` a `desaing-server`. Conserva JWT, comprobación real de sesión, membresía y los mismos pins de actor, negocio, política, origen y vencimiento.

El [servidor HTML](../../supabase/functions/_shared/desaing/serverHtml.ts) y su [repositorio](../../supabase/functions/_shared/desaing/htmlRepository.ts) reutilizan la migración SQL002 instalada. Antes del proveedor guardan solicitud exacta, clave y reserva durable. La sesión usa `html:tipo:documento:slide/página/canvas`; los lectores de exploración y composición separan sus contratos.

Una respuesta perdida se recupera mediante la misma clave. Recargar, comparar o consultar no reenvía al modelo. Un resultado incierto conserva la reserva y bloquea otra solicitud de esa sesión hasta conciliarlo; no existe fallback automático de API o modelo.

Texto exploratorio y conversión comparten **US$1 dentro de los US$5 totales**, reserva de US$0.25 por solicitud y máximo de veinte intentos combinados. Se liquida el uso textual verificable; la evidencia desconocida conserva la reserva. El límite de cuatro salidas de imagen y la reserva de US$1 por salida siguen iguales.

`/html/import` permite cargar el diseño aunque se haya agotado el cupo de imágenes. No genera ni reserva una imagen; la conversión posterior requiere su propia admisión textual y que la ventana autorizada siga abierta.

El [almacén local de composición](../../src/lib/presentations/compositionStore.ts) conserva fuente, texto, request, resultado y asignaciones de piezas en IndexedDB por actor, negocio y sesión, con control de revisión entre pestañas. Las piezas extraídas y subidas a la biblioteca local permanecen en ese navegador.

El journal del servidor conserva resultados y solicitudes; las asignaciones locales y recortes no están sincronizados entre dispositivos. Recuperar un resultado remoto no implica recuperar automáticamente todos los archivos y decisiones locales de montaje.

## Evidencia verificada

La suite acumulada aprobó **1085 pruebas en 44 suites**, según el [log de pruebas](../../artifacts/desaing-lab/composition-unit-tests.log). Las pruebas incluyen contratos, hash de texto, aislamiento de sesión, recuperación sin duplicados, proveedores inyectados y persistencia mediante SQL002 real sobre PGlite local.

Las comprobaciones finales incluyen ambos proyectos TypeScript estrictos, [Deno](../../artifacts/desaing-lab/composition-deno-check.log) y [build completo](../../artifacts/desaing-lab/composition-build.log). El build conserva las advertencias previas de bundle e importaciones de Supabase.

Chrome aprobó **57 comprobaciones** en seis recorridos; son el total de esta entrega, no pruebas adicionales a las cifras históricas:

| Recorrido | Comprobaciones | Evidencia |
| --- | ---: | --- |
| Diseño completo antes del HTML | 7 | [Resultado](../../artifacts/desaing-lab/full-design-smoke-result.json) |
| Composición editable | 6 | [Resultado](../../artifacts/desaing-lab/composition-smoke-result.json) |
| Generación por ambas APIs | 8 | [Resultado](../../artifacts/desaing-lab/generation-smoke-result.json) |
| Exploración con journal | 8 | [Resultado](../../artifacts/desaing-lab/exploration-server-smoke-result.json) |
| Galería con referencias | 9 | [Resultado](../../artifacts/desaing-lab/proposals-references-smoke-result.json) |
| Presentaciones y editor | 19 | [Resultado](../../artifacts/desaing-lab/presentations-smoke-result.json) |

Se verificaron pérdida de acuse, recarga, reutilización de piezas, omisión explícita, conflicto de revisión y edición de texto con píxeles preservados. Artefactos: [comparación pendiente](../../artifacts/desaing-lab/composition-comparison-pending.png), [revisión en tablet](../../artifacts/desaing-lab/composition-tablet-reviewed.png) y [registro de cierre](../../artifacts/desaing-lab/composition-release.json).

## Estado desplegado y límites de la validación

La [metadata posterior](../../artifacts/desaing-lab/composition-deployment-after.json) confirma `desaing-server` **ACTIVE, versión 8, `verify_jwt: true`**. No requiere otra migración ni secretos nuevos: comparte la habilitación y vencimiento de exploración. El frontend de producción no forma parte de este despliegue.

Pasaron [veinte comprobaciones remotas de acceso y CORS/JWT](../../artifacts/desaing-lab/composition-endpoint-checks.json): cinco preflights permitidos y quince rechazos de origen o sesión. No se usó una sesión real del usuario ni se llamó al proveedor en esas comprobaciones.

La [lectura remota posterior](../../artifacts/desaing-lab/composition-remote-after.json) conserva revisión 11, **tres imágenes, US$3 reservados, cero intentos textuales y una salida de imagen disponible**. El presupuesto total continúa en US$5 y el vencimiento en **18 de septiembre de 2026, 22:48:03 CDMX**.

**Esta etapa no produjo llamadas reales de texto o imagen.** Los recorridos locales usan transportes simulados y PNG reales de prueba; no acreditan calidad visual del modelo, latencia, costo real ni concurrencia entre servicios remotos. Sigue pendiente el recorrido positivo con la sesión de Fai, la revisión de B medium y la conciliación histórica del costo de imagen de Responses.

## Próximos seis bloques

1. Diseño libre y presentaciones completas, reutilizando este motor para portadas, páginas y diseños especiales.
2. Ingesta durable de PDFs, imágenes, ideas, texto y documentación.
3. Onboarding de primera vez conectado a esos materiales y propuestas compartidas.
4. Imágenes y carruseles con continuidad de referencias, revisiones y reutilización.
5. Propuestas administrativas de mejora del prompt maestro, con aprobación y publicación separadas.
6. Validación real de calidad, costo, recuperación, concurrencia y continuidad entre dispositivos.

Esta agrupación describe entregas de producto; no reemplaza los identificadores DAI del plan. El flujo actual de imagen más feedback y las pantallas aún no conectadas conservan su comportamiento.
