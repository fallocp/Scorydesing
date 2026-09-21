# Tarea acotada: desbloquear «Generar esta idea»

Contexto al 19 de septiembre de 2026. Trabajar en `F:\ScoryDesign`; conservar todos los cambios locales y de otras tareas. No hace falta leer la conversación histórica ni todo el plan.

## Objetivo y reproducción

En Diseño libre → Diseñar con IA → «Diseñar portada», Fai quiere una portada Xending 1280×720: **texto literal y composición de la primera referencia + mundo de la segunda**, conservando su marca. Las instrucciones nunca deben dibujarse como copy.

La captura más reciente muestra:
- Modelo **2.5 Flare**, calidad **Medium**, modo **Ejecutar cambio** y **dos referencias**.
- El asistente ya respondió y hay ideas como «Portada hero con globo a la derecha».
- Todos los botones **«Generar esta idea» están deshabilitados**, sin explicación visible de ese bloqueo.
- El aviso dice **«Guardado en Supabase. Puedes continuar en otro dispositivo.»**. El lienzo sigue sin versiones generadas.

Captura: `F:\ScoryDesign\artifacts\desaing-lab\blocked-generate-idea.png`.

## Pista verificada en código; causa aún sin confirmar

En `src/components/presentations/UnifiedDesignWorkspace.tsx`, el botón usa:

```ts
disabled={blocked || pending || state.copy.status === 'pending'}
// blocked = busy || fileBusy || !work.ready || (work.syncStatus && work.syncStatus !== 'synced')
// pending = !!state.pending
```

Inspeccionar qué condición concreta se cumple y la respuesta/estado persistido del planificador: `copy.status`, texto extraído, `pending_questions`, `state.pending`, readiness y capacidades. **No asumir que es copy pendiente sólo por esta pista.** El aviso de sincronización de la captura ya indica `synced`.

Archivos iniciales: `src/components/presentations/UnifiedDesignWorkspace.tsx`, `src/lib/presentations/useDesignConversation.ts` (`startIdea`, interpretación, ejecución), `supabase/functions/_shared/desaing/conversationActions.ts` y `explorationProvider.ts`. Persistencia si hace falta: `designConversationRemote.ts`, `designConversationStore.ts` y `src/lib/desaing/continuityStore.ts`.

## Ya resuelto: evitar repetir despliegues sin evidencia

- `desaing-server` verificado ACTIVE v24 con JWT; conversación y generación habilitadas. Ventanas renovadas hasta **26/09/2026 23:59:59 CDMX**, timestamp `1790488799000`. Política `xending-image-choices-2026-09-18`; modelos y presupuestos conservados. Proyecto Supabase `gdfhytvjnzdovjfovqfv`.
- Migración **202609190001** instalada con tabla, RPC autenticados, RLS y bucket privado de continuidad; historial registrado y esquema REST recargado. El bloqueo anterior de guardado provenía de esa migración ausente.
- La tarea paralela A añadió ajustes en **202609190002_desaing_continuity_guards.sql**, declarados pendientes de despliegue al último resumen. No atribuirles este síntoma sin comprobarlo. No reaplicar 001, que no es idempotente.
- Evidencia: `artifacts/desaing-lab/conversation-rollout-status.json`, `continuity-rollout-status.json`, `continuity-endpoint-checks.json`. Las correcciones de despliegue no llamaron a modelos. No certifican la fidelidad del diseño ni toda la sesión real.

## Resultado esperado de esta tarea

Diagnosticar y corregir la causa concreta. Si falta resolver texto de las referencias, completar ese recorrido o mostrar claramente qué falta y cómo resolverlo. Si el estado quedó atascado, recuperarlo conservando referencias, conversación, versiones e identidad de solicitudes. No quitar la validación de texto ni las protecciones de sincronización sólo para habilitar el botón; no repetir renders al recuperar.

Validar el caso bloqueado y su desbloqueo con pruebas dirigidas y navegador cuando corresponda. Conservar los tres modelos, Low/Medium/High, ambos adaptadores y el editor existente. No rediseñar toda la aplicación ni ejecutar otras etapas. Actualizar este archivo con la causa demostrada y el resultado. Para contexto adicional puntual, consultar `DESAING_CONTINUIDAD.md`; el plan registra 15.41–15.44.

## Resolución verificada — 19/09/2026

Consulta de sólo lectura a `public.desaing_continuity`, conversación de Xending, revisión 4, guardada a las `2026-09-19 15:53:31.548681+00`. Coincide con el mensaje y los títulos de la captura:

- `copy = { status: "pending", text: "", source_reference_ids: [] }`; `understanding.copy` coincide.
- `understanding.pending_questions = []`, `pending = null`, dos referencias, cinco ideas y cero versiones.
- `next_action = explore_ideas / requested`; el turno del planificador ya figura en `completed_action_ids`.
- La condición suficiente que deshabilita las ideas es **`state.copy.status === 'pending'`**. El planificador describió la mezcla de referencias sin transcribir el texto y sin devolver una pregunta; la interfaz no mostraba ese dato faltante. La captura indica sincronización confirmada. No había una solicitud pendiente que recuperar.

Corrección acotada en `UnifiedDesignWorkspace.tsx` y `useDesignConversation.ts`:

- Aviso visible de texto pendiente, incluso cuando el planificador no devuelve preguntas; las preguntas estructuradas también se muestran. Los botones respetan tanto el texto pendiente como las preguntas sin resolver, en concordancia con la validación de ejecución existente.
- **Resolver texto** pide transcribir la referencia indicada. El usuario puede escribir una aclaración o el texto literal en el mensaje y pulsar ese mismo botón.
- Este turno usa exclusivamente `available_actions: ['discuss']`. La restricción queda dentro de la solicitud persistida y funciona también al recuperarla en otro dispositivo; no permite generar imagen/HTML. Se conservan las ideas, referencias, mensajes previos, versiones e identidades. Sólo un clic explícito posterior genera la idea cuando el texto está resuelto y no quedan preguntas.
- Se mantienen las validaciones de texto y sincronización, los modelos/calidades, ambos adaptadores y los editores. No se modificó el estado remoto, ni se desplegaron funciones o migraciones.

Validación:

- **57 pruebas** aprobadas: `useDesignConversation`, `designConversationStore`, `designConversationRemote`, `designConversationImages` y `conversationActions`. Incluyen texto pendiente con cero preguntas, aclaración, persistencia de ideas, texto dudoso, preguntas pendientes, conexión perdida y recuperación de la misma solicitud en otro dispositivo.
- `tsc -p tsconfig.presentations-test.json --noEmit`: aprobado.
- `node scripts/desaing/generate-idea-smoke.mjs`: Chrome real, dos contextos aislados y referencias/respuestas simuladas. Reproduce guardado confirmado + cinco ideas bloqueadas; resuelve el texto con dos imágenes de entrada y cero renders; genera una vez con Flare/Medium y recupera la respuesta perdida en un iPad simulado sin repetir el render. Cero llamadas pagadas y cero peticiones externas.
- Evidencia en `artifacts/desaing-lab/generate-idea-diagnosis.json`, `generate-idea-smoke-result.json`, `generate-idea-blocked-explained.png`, `generate-idea-unblocked.png` y `generate-idea-recovered-ipad.png`.

La conversación real conserva su texto pendiente hasta usar **Resolver texto** en la interfaz actualizada. La prueba de navegador valida el recorrido y la conservación del estado; no certifica OCR ni fidelidad visual de las referencias reales.
