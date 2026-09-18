# DesAIng — Presentaciones conectadas al servidor, con ejecución simulada

Fecha: 2026-09-17. Rama: `experimental/desaing`.

Continuación implementada: [dirección, versión media y preparación de proveedores](./DESAING_DAI19_MEDIUM_AND_PROVIDERS.md). Este documento conserva la evidencia de la primera integración; su límite low→medium quedó ampliado en esa entrega posterior.

Esta entrega conecta la pantalla real de Presentaciones con el contrato HTTP de DAI-06/09 y un worker de prueba. El recorrido se ejecutó en Chrome contra PostgreSQL local: captura y zona → solicitud → resultado pendiente de revisión → aprobación → montaje → reutilización → exportación del HTML activo. No se desplegó nada ni se usaron modelos de IA de pago.

## Lo que puede hacer el usuario

El panel **Crear pieza de prueba** conserva el contexto de negocio, proyecto, slide y revisión. Permite describir una pieza, adjuntar una captura de la diapositiva y definir su zona. La referencia se decodifica en el navegador y se convierte en PNG compatible antes de subirla; el servidor vuelve a validar los bytes. La captura se adjunta manualmente en esta etapa: no existe aún un capturador automático de HTML integrado en el producto.

El resultado aparece sobre el HTML para revisarlo. **Aprobar pieza** registra la revisión; **Montar pieza aprobada** cambia la composición. El montaje conserva texto editable y comprueba de nuevo aprobación, negocio, identidad y revisión del destino. Si el slide cambió, se conserva el resultado y se impide escribir sobre la versión nueva. Elegirlo explícitamente desde la biblioteca permite reutilizarlo en otro destino.

Las piezas aprobadas del negocio aparecen en la biblioteca del panel. Reutilizar, colocar y exportar no ejecuta el worker de nuevo. Las imágenes se embeben en el HTML exportado; sus URL firmadas temporales no se guardan en el documento. La biblioteca local de «Añadir imágenes montadas» sigue disponible por separado; no se realizó una migración masiva de IndexedDB al servidor.

El recorrido actual crea **una pieza low mediante el contrato Image API**. Los contratos de Responses y de propuestas múltiples permanecen disponibles en el motor, pero este panel no implementa todavía conversación, cinco propuestas, combinación ni low→medium. El flujo vigente de imagen + feedback → HTML permanece conectado a sus servicios existentes.

## Recuperación y permisos

- El cliente usa la sesión actual y descarta respuestas si cambia la cuenta durante la operación. Los permisos efectivos siguen comprobándose en servidor y SQL.
- Guarda la clave y el encargo antes de encolar. Ante un acuse perdido conserva esa misma solicitud. Reabrir recupera el trabajo guardado; no solicita una pieza nueva.
- La carga de la captura conserva una clave estable por hash y revisión. Un reintento con los mismos píxeles no duplica la referencia, incluso si se perdió la confirmación anterior.
- Un rechazo definitivo de validación, autenticación o cuota desbloquea el formulario. Las respuestas inciertas conservan su clave; no se tratan como rechazo confirmado.
- El worker confirma un claim por CAS antes de invocar el proveedor simulado. Dos workers que compiten no generan dos veces. Una excepción de comunicación no autoriza reintentar el envío.
- Verifica los archivos de referencia, su orden y dimensiones. Comprueba CRC, contenido PNG y dimensiones exactas de la salida. Guarda bytes inmutables antes de registrar resultado, revisión pendiente y costo simulado cero juntos.
- Un fallo posterior al envío queda `uncertain`, mantiene la reserva y no se reenvía al recuperar. La conciliación administrativa de esos casos sigue pendiente; el panel no permite ocultarlos iniciando otra pieza desde ese mismo encargo.
- Las imágenes privadas se descargan sin compartir el bearer con una URL firmada. El cliente comprueba origen, límites, PNG y SHA-256 cuando la versión utiliza ese identificador.

## Entorno de prueba y conexión preparada

`experiments/presentations/serverPlugin.ts` inicia PGlite y aplica el bootstrap de pruebas y la migración del servidor. Reutiliza el handler HTTP, las RPC de PostgreSQL, el coordinador y las transiciones del proyecto. Auth se sustituye por una identidad de prueba; Storage por un mapa privado con enlaces temporales; el proveedor por un dibujo PNG determinista de 1024 × 1024. **El dibujo no responde semánticamente al brief ni demuestra calidad de IA.** El worker sí recibe los bytes reales de la referencia y el contexto de la operación.

El harness sólo escucha en `127.0.0.1:3012`, verifica Host/Origin, usa identificadores de prueba y no carga el `.env` de la aplicación. Sus controles de fallos y cuota existen exclusivamente en ese entry de desarrollo; no se importan desde la función desplegable. La base y los objetos de prueba viven durante el proceso y se reinician al detenerlo. La recarga del navegador conserva los trabajos mientras ese servidor sigue abierto.

Para abrirlo manualmente:

```powershell
npm run dev:presentations-test
```

Visitar `http://127.0.0.1:3012/experiments/presentations/`. La aplicación normal mantiene esta entrada desactivada salvo `VITE_DESAING_SERVER_ENABLED=true`; cuando se configure, utilizará su sesión y la función `desaing-server` del Supabase configurado. **No se activó esa variable ni se conectó un worker real.** No habilitarla contra producción como sustituto de preparar el entorno aislado.

## Pruebas y evidencia

**18 suites, 465 pruebas aprobadas.** Incluyen contratos existentes, cliente HTTP, worker, catálogo, PostgreSQL, estado local y montaje de Presentaciones. TypeScript estricto del experimento, comprobación Deno del worker y `npm run build` pasaron. El build mantiene los avisos existentes de tamaño e importación mixta del cliente Supabase.

La prueba de Chrome cubre también el flujo local anterior, edición real de texto y exportación. En el nuevo recorrido verifica:

1. Carga con confirmación perdida, reintento y una sola referencia registrada.
2. Doble clic, confirmación perdida del enqueue, recarga y un solo trabajo/reserva.
3. Bytes reales de referencia recibidos por el worker y aprobación separada del montaje.
4. Cambio exclusivo del slide capturado, conservación de texto y montaje de la versión exacta.
5. Reutilización en otro slide y exportación del deck activo sin otra ejecución.
6. Rechazo por cuota SQL, desbloqueo del formulario y reenvío explícito posterior.
7. Fallo simulado posterior al envío, reserva conservada y ninguna regeneración automática.
8. Cero tráfico HTTP externo, llamadas a modelos reales, escrituras remotas o excepciones sin manejar.

Se revisaron capturas de escritorio y tablet. La zona inicial se ajustó tras detectar que tapaba parte del subtítulo de la plantilla de prueba; el usuario puede cambiarla antes de enviar o al reutilizar. El preview responde a cambios de ancho y usa el mismo compositor que el montaje.

Comandos:

```powershell
npm test -- supabase/functions/_shared/desaing src/lib/desaing src/lib/presentations
npx tsc -p tsconfig.desaing.json --noEmit
deno check --no-lock --no-remote supabase/functions/_shared/desaing/serverWorker.ts
npm run build
node scripts/desaing/presentation-smoke.mjs
```

Evidencia local excluida de Git: `artifacts/desaing-lab/presentations-smoke-result.json`, `presentations-server-review-desktop.png`, `presentations-server-reuse-tablet.png` y `presentations-server-export.html`.

## Límites y continuidad

PGlite permite probar CAS con solicitudes lógicas concurrentes; sigue siendo una sola conexión. Auth, Storage, scheduler y proveedor reales, contención entre varias conexiones, disponibilidad/modelos y calidad/costo de IA necesitan validación en el entorno aislado. El montaje comprueba revisión del deck que está abierto; no reemplaza control transaccional multiusuario del documento completo en Supabase.

La aprobación de esta etapa autoriza desarrollo y simulación local. Antes de ejecutar modelos reales faltan destino aislado verificado, presupuesto concreto, transporte real y codecs compatibles con sus formatos. La base implementada permite continuar con esos adaptadores y ampliar la interfaz reutilizando los mismos contratos.

Referencias del proyecto: [base de servidor](./DESAING_DAI06_SERVER_FOUNDATION.md), [montaje local de Presentaciones](./DESAING_DAI16_PRESENTATIONS.md), [plan maestro](./DESAING_EXPERIMENTAL_PLAN.md).
