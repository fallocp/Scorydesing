# DAI-21 — Aprendizaje administrativo del prompt maestro

## Alcance

La pestaña Prompt maestro de `/admin/business` reutiliza el editor administrativo existente. El aprendizaje se convierte en una propuesta que Fai revisa; no cambia el maestro automáticamente al recibir feedback ni al aprobar una imagen.

La capacidad explícita `prompt_master.manage` se concede únicamente al actor Fai (`0274bd51-1858-4893-8561-a9c99000feb7`) en el negocio autorizado (`a0000000-0000-0000-0000-000000000001`). Ser owner o admin no concede por sí solo esta capacidad. Cada propuesta pertenece a ese negocio y a un `prompt_type` existente: general, image, channel_adapter o un estilo. No se introduce un maestro global.

## Recorrido

1. Elegir la familia del maestro y una imagen generada y aprobada del catálogo del servidor. La evidencia muestra el prompt efectivo y, si existe, el revisado por el proveedor. Las imágenes históricas no identifican la versión del maestro que usaron: se muestra origen desconocido, sin atribuirles la versión actual.
2. Registrar qué repetir, qué evitar, diagnóstico, hipótesis, beneficio y riesgos. Editar el texto propuesto y revisar el diff literal contra la base congelada. Guardar conserva el borrador y sus revisiones sin llamar a modelos. Descartar requiere motivo y libera el espacio para otra propuesta, incluso si la base ya cambió.
3. Preparar las pruebas estructurales de ocho casos. Se serializan requests con los adaptadores reales; no se envían al proveedor. Esto verifica que sólo cambia el bloque maestro y se conservan copy, configuración y referencias, pero no determina calidad visual.
4. Elegir un encargo visual, su copy literal y referencias. **Generar comparación** autoriza dos imágenes nuevas, antes/después, low, 1024×1024, PNG opaco, con el mismo ejecutor, configuración y entradas. Sólo varía el texto maestro. Se reutilizan jobs, reservas, worker, catálogo y ambos adaptadores existentes.
5. Revisar ambos resultados. Aprobar la comparación exige aprobar las dos imágenes y confirmar copy, calidad visual y ausencia de regresión. Rechazarla requiere ambas salidas disponibles y un motivo; no obliga a aprobar una imagen inadecuada.
6. Publicar exige la misma revisión del borrador, base vigente, prueba íntegra, evidencia aprobada y última revisión visual aprobada. Crea otra versión y un comprobante. La revisión más reciente se vuelve a comprobar dentro de la transacción SQL. Editar la propuesta invalida sus pruebas para publicación.
7. Revertir exige elegir una versión histórica de esa misma familia y explicar el motivo. Crea una nueva versión con el texto histórico, sin eliminar la versión revertida. Se comprueban id, versión y hash de la base actual, incluso cuando dos versiones tienen idéntico texto.

## Persistencia y recuperación

SQL006 añade ámbito gobernado, capacidades, borradores, historial, pruebas, revisiones y diario de mutaciones. El navegador no tiene acceso directo a esas tablas. Los RPC de lectura y mutación administrativos son exclusivos del servidor, con validación de membresía y capacidad; la consulta booleana de gobernanza permanece disponible al cliente para deshabilitar la ruta legacy.

Los nueve endpoints `/prompt-admin/*` cubren capabilities, read, save, discard, test, review, publish, revert y recover. Cada mutación congela sus datos y UUID antes de autenticarse; verifica actor, negocio y respuesta. Una respuesta perdida se recupera por la misma solicitud, sin repetir automáticamente la escritura ni una generación. La comparación guarda la barrera local antes del envío y conserva el primer resultado si el segundo falla. Continuar el faltante exige una acción explícita.

La política restrictiva bloquea INSERT/UPDATE/DELETE legacy de `master_prompts` en el negocio gobernado. Los demás negocios conservan su comportamiento. El editor consulta la gobernanza aun cuando su interfaz experimental está desactivada, y vuelve a comprobarla antes de escribir. Se elimina el borrado automático de versiones antiguas de estilos. Las lecturas generales filtran exactamente `prompt_type='general'`, para que una versión más alta de image o de un estilo no se convierta accidentalmente en el maestro general.

## Límites de esta entrega

- `VITE_DESAING_PROMPT_ADMIN_ENABLED` controla el editor local; `DESAING_PROMPT_ADMIN_ENABLED` controla mutaciones administrativas del servidor. Desactivar el editor no reabre escrituras legacy del negocio gobernado.
- El piloto conserva US$5 totales, cuatro salidas máximas y el vencimiento original. Queda una salida: la comparación de dos imágenes se bloquea antes de comenzar. Esta entrega no amplía el presupuesto ni el plazo.
- El límite de instrucciones del piloto sigue en 4000 bytes UTF-8, incluido el copy y el contexto administrativo. Un maestro y encargo que lo excedan no se truncan ni se envían. Los maestros largos pueden guardarse como propuesta, pero su comparación queda bloqueada por ese límite vigente.
- Preparar pruebas, guardar, descartar, recuperar, publicar y revertir no invoca IA. Generar comparación sí consume dos salidas bajo la política existente.
- Un maestro image almacenado sólo afecta a los consumidores configurados para leerlo desde la base (`MASTER_IMAGE_PROMPT_SOURCE=database`). Publicar una versión no implica activar esa configuración en todos los generadores.
- Las comprobaciones automatizadas usan proveedores simulados y PostgreSQL local. No acreditan calidad visual real ni sustituyen la sesión de Fai. No se publica ningún texto maestro real como parte de las pruebas.

## Evidencia

El cierre reproducible está en [prompt-admin-release.json](../../artifacts/desaing-lab/prompt-admin-release.json); el recorrido de navegador y las capturas están en `artifacts/desaing-lab/prompt-admin-*`. Las migraciones anteriores y el documento base original se conservan.

SQL006 instalada; `desaing-server` ACTIVE v15 con JWT y trece lectores existentes actualizados conservando sus flags. Las 36 comprobaciones remotas de acceso/CORS pasaron. TypeScript, Deno, build y la selección de 1374 pruebas en 72 suites pasaron, con nueve comprobaciones focales posteriores al ajuste final del panel. Chrome aprobó 22 comprobaciones (seis nuevas y dieciséis regresiones); las capturas de escritorio y tablet se inspeccionaron. Los datos y el gasto reales permanecen iguales. El cierre registra **un bloque pendiente: validación real**.
