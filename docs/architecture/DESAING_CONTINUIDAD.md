# ScoryDesign: contexto breve para continuar

Actualizado: 19 de septiembre de 2026. Este archivo resume el estado y propone encargos separados; la petición vigente de Fai determina qué tarea ejecutar.

## Proyecto y acuerdos

- Workspace: `F:\ScoryDesign`. Rama observada: `experimental/desaing`, con numerosos cambios locales. Revisar el estado y conservarlos; una tarea nueva no debe descartar ni reconstruir el trabajo existente.
- Fai quiere conversar naturalmente para crear diseños desde texto, añadir imágenes de referencia, corregir resultados y producir HTML editable con el editor completo existente.
- Caso principal: Xending, composición y texto de la primera imagen + mundo de la segunda. Leer los archivos reales; una indicación como «lo que viene en las referencias» nunca es copy literal para dibujar.
- Mantener marca del negocio, texto literal o ausencia explícita de texto, referencias y versión seleccionada. Las cinco ideas son opcionales, reutilizables y no autorizan cinco renders.
- Conservar los tres modelos configurados (GPT Image 2, 2.5 Flare y Sunburst), Low/Medium/High y ambos adaptadores. Modelo/calidad arriba; preferencia inicial Flare/Medium. Usar el motor común y evitar generaciones repetidas al recuperar.
- Reutilizar editor, biblioteca y piezas en presentaciones, portadas y páginas. Image Stock fue retirado; las imágenes y biblioteca permanecen. Los cambios de una pieza no publican modificaciones del prompt maestro.

## Estado verificado

- Plan vigente: `docs/architecture/DESAING_EXPERIMENTAL_PLAN.md`, implementación conversacional en 15.41, correcciones de activación en 15.42–15.43 y cierre de código de A en 15.44. Leer esas secciones y 14.1; consultar otras sólo según la tarea. Algunas secciones anteriores contienen pendientes y cifras históricos ya superados.
- 15.38–15.39: consumidores de imágenes conectados localmente al núcleo compartido. 15.40: editor completo, creación/conversión HTML y piezas reutilizables. 15.41: una conversación para imágenes y HTML en Presentaciones y Diseño libre.
- El nuevo recorrido conversa, propone cinco ideas, genera/edita imágenes y crea/refina/convierte HTML. Usa servicios existentes; no construir otro generador ni otro editor.
- Validación de 15.41: pruebas dirigidas, TypeScript, Deno check, build y 12 verificaciones de navegador aprobadas. Proveedores simulados; cero llamadas externas o de pago. Evidencia: `artifacts/desaing-lab/unified-design-smoke-result.json`.
- Activación posterior a 15.41, el 19 de septiembre: `desaing-server` desplegado y verificado ACTIVE v24, con JWT habilitado. Se renovaron sólo las fechas `DESAING_EXPLORATION_EXPIRES_AT_MS` y `DESAING_UI_EXPIRES_AT_MS` hasta el 26 de septiembre de 2026 a las 23:59:59 CDMX (`1790488799000`); el vencimiento anterior bloqueaba el chat y producía un aviso engañoso de actualización. Política, modelos, permisos y límites conservados. Pasaron 16 comprobaciones remotas de CORS/acceso; no se usó una sesión real ni se llamó a proveedores. Frontend y otras funciones no se desplegaron en esta corrección. La comparación real Xending sigue pendiente. Evidencia: `artifacts/desaing-lab/conversation-rollout-status.json` y `exploration-server-endpoint-checks.json`.

- Guardado remoto activado el 19 de septiembre (15.43): el frontend de continuidad ya estaba integrado, pero faltaba `202609190001_desaing_continuity.sql`. Se instaló sólo esa migración, con historial y recarga de esquema en una transacción. Tabla/RPC/bucket privado y permisos verificados remotamente; 26 pruebas dirigidas de SQL y continuidad aprobadas. La API reconoce ambos RPC y rechaza acceso anónimo. Pendiente pulsar «Sincronizar» con la sesión real para incorporar su copia local y comprobar PC–iPad; cero llamadas a modelos en esta activación.

## Tarea A — código y migraciones preparados (15.44)

- `desaing_continuity` guarda conversación y contexto de Diseño libre por usuario/negocio/documento/slide: mensajes, marca, copy literal/sin texto, referencias con sus bytes y roles, ideas, selección, versiones con sus padres, solicitudes exactas de imagen/exploración y pendiente. RPC autenticados con revisión comparada; PNG en bucket privado e inmutable. Diseño libre conserva los IDs de documento/lienzo para encontrar el mismo trabajo en otro dispositivo; Presentaciones reutiliza sus proyectos remotos existentes.
- `continuityStore.ts` conserva cada intento local antes de escribir en Supabase. Reabrir/«Sincronizar» confirma o reintenta exclusivamente ese guardado con su identidad y revisión base, sin ejecutar proveedores. Ante otra revisión, carga lo vigente y conserva el intento aparte. Las bases IndexedDB previas quedan intactas; la conversación unificada actual sólo se copia automáticamente si todavía no hay una remota en ese ámbito. «Descargar copia local» incluye estado, intentos y copia anterior; no se fusionan historias automáticamente.
- Sin confirmar el guardado remoto se consulta la copia local y se bloquean nuevas ejecuciones. Recuperar una acción usa los journals e identidades existentes, sin duplicar renders. Una revisión antigua del documento no rebaja la conversación; aprobar/aplicar comprueba lo guardado. El HTML completo de la última composición se puede retomar en el editor completo existente aunque falte su editor local de piezas; editarlo conserva el padre como otra versión.
- Validación de cierre: 272 pruebas en 25 suites; TypeScript global y ambos proyectos estrictos; build; 18 comprobaciones de navegador (6 nuevas con dos contextos aislados PC/iPad + 12 del recorrido anterior). SQL/RLS ejecutados en PGlite, IndexedDB real en Chrome, Storage/transporte y proveedores simulados; cero llamadas externas/de pago. Evidencia: `artifacts/desaing-lab/continuity-smoke-result.json`, `continuity-desktop.png`, `continuity-ipad.png` y `unified-design-smoke-result.json`. No equivale a Safari/iPad físico ni a validación con la sesión real.
- **Estado de despliegue:** esta tarea no ejecutó despliegues. Otra tarea instaló `202609190001` durante el trabajo (15.43); se conservó la migración exactamente como figura en `continuity-install.sql`. Los ajustes finales se prepararon en **`202609190002_desaing_continuity_guards.sql`**, pendiente de aplicar en C: evita retroceder la revisión del lienzo y valida UUID completos en las políticas de Storage. Verificar también la versión final del frontend en C. No cambia modelos, cuotas ni presupuestos.

## Límites actuales

- El nuevo historial y sus referencias ya tienen persistencia remota y copia IndexedDB por usuario/negocio/documento/slide. La migración está instalada; falta completar la prueba real entre PC–iPad y verificar la migración del trabajo previo desde el dispositivo de origen.
- El HTML directo carece de journal remoto. Una respuesta incierta conserva su bloqueo y no se regenera automáticamente.
- Los historiales anteriores no se importan automáticamente. Algunas composiciones antiguas se muestran sólo para comparar. Límite local: 20 versiones y 200 mensajes/acciones.
- No se sincroniza toda la biblioteca local ni el estado interno de extracción/piezas de paneles anteriores. Una composición incompleta conserva su HTML y pendientes, y se completa en el editor de origen. Los respaldos se conservan/exportan; su importación/fusión corresponde a D. Snapshot remoto: hasta 64 MiB; hasta tres referencias PNG de 8 MiB, verificadas por hash. No se eliminan automáticamente objetos privados huérfanos.
- Para retomar Presentaciones debe existir el mismo proyecto y slide en la nube. El borrador sin proyecto y las historias asociadas a otro ID no se convierten automáticamente en proyectos remotos: guardar el proyecto antes de iniciar trabajo que se continuará en otro dispositivo.
- La interfaz conversacional nueva cubre diseño completo en Presentaciones y Diseño libre. Studio, onboarding y piezas por región conservan otras interfaces.
- Hallazgo de uso posterior a 15.41: en Diseño libre, «Materiales de referencia» incorpora los hallazgos revisados al encargo como texto, pero no transfiere los archivos de imagen al chat unificado. Por ahora se adjuntan en «Referencias» dentro de «Diseñar con IA». Falta conectar las fuentes visuales existentes sin pedir otra carga. El campo de texto literal tampoco debe recibir instrucciones de extracción; la detección actual sólo cubre algunas frases y no reconoce todas sus variantes. Corregir este recorrido de entrada antes de acreditar el caso real Xending desde Materiales.

## Encargos propuestos, una tarea por resultado

| ID | Resultado | Alcance y cierre |
|---|---|---|
| A — Continuidad en Supabase | Código y migraciones preparados (15.44) | Persistencia, aislamiento, conflictos y recuperación local validados en SQL y dos sesiones, sin renders duplicados. Otra tarea activó la base (15.43); migración incremental `202609190002` y validación real pendientes de C. |
| B — HTML recuperable | Recuperar una respuesta sin volver a generar | Registrar la solicitud y resultado de HTML directo en servidor con identidad estable y estados explícitos. Reutilizar autenticación, almacenamiento y patrones de journal existentes. Validar pérdida de respuesta/reapertura sin otra llamada al modelo. |
| C — Activación y caso Xending | Usar y evaluar el recorrido real | Inventariar cambios remotos pendientes, desplegar versiones compatibles según el encargo autorizado y comprobar capacidades. Probar referencias → imagen → feedback → HTML → reutilización; registrar fidelidad, tiempos y consumo, con comparación de modelos/calidades seleccionados. |
| D — Historial y versiones | Continuar trabajo anterior | Importar historiales de forma explícita y segura; retomar una composición antigua como nueva rama editable. Resolver archivo/paginación de versiones sin borrar trabajo. |
| E — Otros módulos | Adaptar la conversación a cada flujo | Crear un encargo separado por módulo: Studio, onboarding o edición de piezas. Conservar sus opciones y propósito; compartir capacidades y evitar duplicar motores/historias. |

Siguiente encargo propuesto: B → C; después D y encargos individuales de E según la prueba de uso. A está preparada localmente. No ejecutar toda la tabla porque se haya pedido sólo una tarea.

## Mapa mínimo para A y B

- Conversación y persistencia: `src/lib/presentations/useDesignConversation.ts`, `designConversationStore.ts`.
- Sincronización A: `src/lib/desaing/continuityStore.ts`, `src/lib/presentations/designConversationRemote.ts`; conexión en `PresentationDesignContext.tsx`, `UnifiedDesignWorkspace.tsx` y `FreeDesignPage.tsx`.
- Pruebas A: `src/lib/presentations/__tests__/designConversationRemote.test.ts`, `useDesignConversation.test.ts`, `scripts/desaing/continuity-smoke.mjs`.
- UI: `src/components/presentations/UnifiedDesignWorkspace.tsx`.
- Imagen, fuentes y contexto HTML: `src/lib/presentations/designConversationImages.ts`, `designConversationHtml.ts`.
- Controladores existentes: `src/components/presentations/SlideGeneratorPanel.tsx`, `DesignToHtmlPanel.tsx`.
- Borrador HTML local: `src/lib/presentations/htmlDesignDraft.ts`.
- Contrato del planificador: `supabase/functions/_shared/desaing/conversationActions.ts`.
- Entradas de servidor: `supabase/functions/desaing-server/index.ts`, `supabase/functions/generate-design-html/index.ts`; revisar módulos compartidos y migraciones relacionados según necesidad.

## Al cerrar cada tarea

Actualizar este resumen y el plan con resultado, archivos principales, validaciones, estado local/desplegado y siguiente pendiente. Ejecutar pruebas dirigidas y checks afectados; ampliar cuando haya fallos o riesgos concretos. Conservar las decisiones que aún aplican y retirar del resumen los pendientes ya resueltos. No copiar la conversación completa ni releer todo el proyecto como sustituto de un alcance claro.
