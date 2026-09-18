# DAI-13/14 — Exploración textual compartida, primera integración

Fecha: 17 de septiembre de 2026. Rama: `experimental/desaing`.

**Continuación:** este documento conserva el alcance de la primera integración simulada. La etapa posterior ya añadió journal SQL autenticado, presupuesto compartido y activación en desarrollo; su estado y límites están en [exploración desde el servidor](./DESAING_DAI13_SERVER_EXPLORATION.md) y en la sección 15.24 del plan maestro. La prueba positiva con la sesión real del usuario continúa pendiente.

Fai autorizó continuar el desarrollo mientras deja para el día siguiente la prueba de generación con su sesión real. Esta entrega añade exploración textual reutilizable y la conecta a Presentaciones en un preview aislado. La prueba manual anterior sigue pendiente y no bloquea este desarrollo.

## Comportamiento implementado

- **Ejecutar cambio / Explorar diseño** conserva encargo, región, captura PNG, documento, revisión y selección. Una generación concreta mantiene el modo de exploración.
- **Proponer cinco ideas** prepara cinco direcciones textuales mediante una solicitud Responses estructurada. Una misma sesión y contexto recupera el grupo existente. No equivale a cinco imágenes ni reserva cinco renders.
- Cada idea separa objeto, composición, estilo y paleta. Seleccionar y guardar ajustes crea historia local; combinar aspectos de al menos dos ideas conserva sus originales y añade otra idea con procedencia por versión.
- La conversación recibe el encargo y las ideas pertinentes, incluidos ajustes y selección. Responde con texto y no incorpora herramientas de imagen.
- **Usar esta idea** prepara un encargo editable. **Generar borrador** sigue siendo una acción explícita del recorrido existente, con captura real y contexto de colocación. Elegir una idea textual no aprueba dirección visual, versión medium ni publicación.
- La sesión y la captura se conservan juntas en IndexedDB, separadas por actor, negocio y sesión. Las escrituras comprueban la revisión guardada; otra pestaña no puede sobrescribirla silenciosamente. Una respuesta de planificación incierta se recupera por su clave original, sin volver a enviar la solicitud.

## Archivos y responsabilidades

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Contratos compartidos | `supabase/functions/_shared/desaing/explorationContracts.ts` | Ideas textuales, versiones, selección, conversación y vínculo explícito con operación de imagen. |
| Dominio compartido | `supabase/functions/_shared/desaing/exploration.ts` | Validación, cambios puros, idempotencia, procedencia y rechazo de contexto obsoleto. |
| Adaptador de texto | `supabase/functions/_shared/desaing/explorationProvider.ts` | Responses con JSON Schema estricto, límites, timeout y transporte obligatorio inyectado. |
| Persistencia local | `src/lib/desaing/explorationStore.ts` | Transacción de sesión, brief, región y bytes PNG; comparación atómica de revisión. |
| Coordinación de Presentaciones | `src/lib/presentations/usePresentationExploration.ts` | Restauración, modos, planificación y preparación de una idea para generar. |
| Interfaz reutilizable | `src/components/desaing/DesignExplorationPanel.tsx` | Ideas, aspectos, versiones, selección, comentarios y recuperación sin dependencias del proveedor. |
| Integración | `src/components/presentations/ServerDesignPanel.tsx` | Dos modos y puente al botón existente de generación. |
| Preview y recorrido | `vite.exploration-test.config.ts`, `scripts/desaing/exploration-smoke.mjs` | UI real con Auth, almacenamiento de servidor y transportes de proveedores simulados. |

El adaptador prepara `gpt-5.4-mini` en `/v1/responses`, `store: false`, salida estructurada, sin herramientas y con una sola ejecución por solicitud. El modelo se verificó documentalmente; **no se comprobó disponibilidad ni calidad mediante una llamada real en esta entrega**. Los metadatos de referencias no se presentan como una inspección de píxeles: esta fase planifica con texto. La captura local se conserva para el paso de generación de imagen.

## Aislamiento y prueba

Para abrir el preview:

```powershell
node node_modules/vite/bin/vite.js --config vite.exploration-test.config.ts
```

Dirección: `http://127.0.0.1:3014/experiments/presentations/`.

La interfaz indica **Prueba simulada**. Tanto planificación como imágenes usan adaptadores reales con `fetch` de prueba inyectado; no hay conexión pagada. La cache del servidor de preview está en memoria y se pierde al reiniciarlo: no es un journal durable de producción. IndexedDB sí conserva el estado del navegador. Una solicitud incierta sin resultado recuperable permanece bloqueada y no se reenvía automáticamente.

En este primer hito, la app de desarrollo en el puerto 3000 conservó el recorrido de generación autenticada anterior sin inyectar el planificador experimental. Esta entrega inicial no activó conversación pagada, cambió políticas, desplegó funciones ni consumió la salida restante del piloto. La conexión posterior del planificador en esa app se registra por separado en [la etapa de servidor](./DESAING_DAI13_SERVER_EXPLORATION.md).

Los resultados concretos de validación quedan registrados al cerrar el hito en la sección 15.23 del [plan maestro](./DESAING_EXPERIMENTAL_PLAN.md). Evidencia del navegador: `artifacts/desaing-lab/exploration-smoke-result.json`.

## Continuación y pendientes de esta capacidad

1. **Implementado en la etapa posterior:** journal autenticado y durable para planificación; admisión y conciliación del consumo de texto dentro del presupuesto compartido, incluidos resultados inválidos o inciertos. El historial SQL guarda solicitudes y resultados del planificador; captura, selección, ajustes y combinaciones siguen en IndexedDB y no constituyen sincronización completa entre dispositivos.
2. Prueba real de Responses, calidad de las cinco ideas y uso de materiales comprendidos; lectura de imágenes/PDFs requiere la ingesta y visión correspondientes.
3. Cinco propuestas visuales low, elección de dirección y promoción explícita a medium; las cinco ideas textuales son un paso previo y no dan por terminadas esas propuestas visuales.
4. Integrar el mismo dominio y componente en onboarding y diseño libre con sus destinos y materiales. El contrato admite esos contextos, pero sus pantallas todavía no están conectadas.
5. Diseños completos previos al HTML, portadas/páginas, sugerencia de modo y referencias múltiples. Este primer puente de Presentaciones está acotado a una pieza para una región.

Referencias técnicas: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) y [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
