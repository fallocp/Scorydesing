# Encargo vigente para Codex — ScoryDesign UI Handoff v2

## Primera ejecución: solo inspección y plan

```text
Trabaja sobre el repositorio real de ScoryDesign / Design.
El paquete vigente está en docs/ui-handoff-v2/.

Lee las instrucciones del repositorio y después:
- README.md del handoff v2.
- docs/PLAN_DE_FLUJO_VIGENTE.md
- docs/DISENO_MAESTRO.md
- docs/MAPA_DE_PANTALLAS.md
- docs/INTEGRACION.md
- docs/DISCREPANCIAS_Y_ESTADO.md
- docs/VALIDACION.md

Revisa reference/aprobado/ para copiar la dirección visual y los iconos exactos.
Usa el PDF de reference/historico-v1/ como referencia del recorrido,
no como un asistente obligatorio de 21 pasos.
Las instrucciones antiguas, src y preview en legacy/demo-v1/ son históricos:
no satisfacen por sí mismos el plan nuevo de 19 vistas.

DECISIONES VIGENTES
1. Studio actual conserva su UI, proceso y ambos bancos de copys.
2. Xending News y Daily Report siguen separados, con sus estructuras actuales.
3. Crear y editar estrena la nueva UI; no rehagas sus motores.
4. Tres orígenes: crear desde cero, usar plantilla o partir de diseño existente.
   El origen no determina el tipo de pieza.
5. Chat, botones y campos trabajan sobre el mismo encargo/contexto.
   Operación manual y conversación deben seguir disponibles.
   No chat vacío permanente en Inicio; no eliminarlo de las pantallas de trabajo.
6. Conservar Blanco V1, Blanco Xending V2, Blanco Xending V3, Blanco 2.0 y Navy.
   No necesitan nueva aprobación por el cambio de UI.
   El catálogo compartido entre herramientas es una conexión pendiente de verificar.
7. No confundir Xending con un fabricante de cables.
   No copiar logos generados, medidas no verificadas ni estados ficticios.
8. No implementar todo de una vez: revisión y aprobación vista por vista.

FASE 0 — NO MODIFICAR LA APLICACIÓN
A. Confirma stack, ubicación, rama, cambios locales, scripts y reglas vigentes.
B. Localiza módulos, bancos, conversación, generación, editor, HTML,
   montaje, variantes, persistencia, exportaciones y permisos reales.
C. Contrasta el inventario de Fai con el código; distingue reutilización,
   reacomodo y conexión nueva. No rellenes diferencias con supuestos.
D. Explica cómo introducir Crear y editar sin cambiar todavía Studio/News/Daily.
E. Traza chat ↔ controles ↔ procesos actuales, sin construir un agente nuevo.
F. Entrega una tabla con archivo real, capacidad existente, ajuste visual,
   conexión faltante, riesgo de regresión y prueba.
G. Propón SOLO marco del nuevo espacio + vista 01: Inicio y entrada creativa.
   Usa tres orígenes, no las cuatro tarjetas de tipos del Inicio v1.
H. Señala cualquier decisión que requiera aprobación o referencia ausente.

No instales dependencias, no cambies código, no migres datos,
no reemplaces configuraciones y no ejecutes las otras vistas.
Espera aprobación del plan.
```

## Segunda ejecución: únicamente la vista autorizada

```text
Implementa SOLO la vista [ID y nombre del mapa vigente] y el alcance aprobado.
La referencia estética es docs/ui-handoff-v2/reference/aprobado/.
El comportamiento objetivo es PLAN_DE_FLUJO_VIGENTE.md, contrastado con el código.

No rediseñes la familia de iconos ni sustituyas sus detalles por otra biblioteca.
No copies la demo antigua como nueva aplicación.
No cambies Studio actual, sus bancos, News ni Daily fuera del alcance autorizado.
Reutiliza servicios, prompts, procesos, editores, montaje, versiones y exports.
No alteres identidad, permisos, negocio activo, autenticación, RLS,
APIs, modelos, créditos ni renderer para cambiar la apariencia.

Si una integración nueva es necesaria y no está autorizada,
regístrala como pendiente y detente antes de modificarla.
No declares una capacidad implementada usando solo datos de demostración.

Mantén los tres orígenes independientes de tipo/destino/estilo/exportación.
Conserva chat contextual y controles manuales sincronizados.
No generes al escribir, adjuntar ni navegar.
Ejecuta mediante acción clara o instrucción suficiente; pregunta solo lo que falta.
Preserva original, versión, copy, estilo usado y contexto que realmente exista.
No simules capas editables en un PNG ni guardado sin confirmación.

Usa identidades y logos autorizados; los cables son contexto de una industria cliente.
No uses las medidas no verificadas de las maquetas para portadas LinkedIn.
Mantén bancos, filtros, posición, detalle del copy y acceso a copys anteriores.

Entrega:
- Archivos cambiados y diff.
- Qué se reutilizó y qué conexión quedó pendiente.
- Capturas de la UI real, no renders, con iconos y detalles comparables.
- Prueba de operación manual, conversación y alternancia cuando aplique.
- Estados vacío/carga/error/cambios/guardado según la vista.
- Comandos reales y resultados de typecheck, lint, tests y build disponibles.
- Revisión de escritorio y móvil: legibilidad, foco, scroll y acceso al asistente.

No publiques, no hagas push, no migres el resto y no avances a otra vista.
Espera la revisión de Fai.
```

## Encargo para generar o refinar maquetas, sin implementar

```text
Trabaja SOLO la vista [ID del plan vigente].
Revisa su ficha, las referencias aprobadas de iconos y el plan actualizado.
Genera una imagen legible que conserve esta familia visual y permita operar
por controles o conversación. No cambies los motores ni inventes funciones.
Indica fuera de la UI qué se reutiliza y qué conexión nueva sigue pendiente.
No copies errores de marca, dimensiones, fechas o estados de renders anteriores.
Entrega la propuesta individual para revisión; no un collage pequeño.
```
