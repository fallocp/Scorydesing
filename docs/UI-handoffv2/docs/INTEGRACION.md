# Integración y migración — v2

## Base de trabajo

El inventario del documento de Fai es la base funcional declarada. En esta actualización no se inspeccionó el repositorio ni se ejecutaron servicios. Las rutas y nombres mencionados en documentación anterior son pistas que deben contrastarse en el código actual.

No confundir el proyecto de Design con Scory compliance. No migrar de stack para reproducir la estética.

## Convivencia decidida

1. **Studio actual:** conserva su UI por ahora, su proceso y ambos bancos de copys.
2. **Xending News y Daily Report:** conservan accesos, estructuras, formatos y editores especializados. No forman parte principal del rediseño actual.
3. **Crear y editar:** nuevo espacio de UI que conecta capacidades actuales y los tres orígenes.

Después de comprobar recorridos reales se migra gradualmente. No aplicar CSS global del rediseño que cambie Studio, News o Daily de forma involuntaria. La ubicación exacta del acceso y el mecanismo de convivencia se proponen tras inspección; no hay ruta o feature flag impuesto por este paquete.

## Reutilizar completo

Llamadas, procesos, prompts, reglas de generación, propuestas de copy, bancos actual y anterior, referencias, materiales, generadores, carruseles, presentaciones, documentos, editor visual/HTML, corrección de píxeles, regeneración, compositor de marca, versiones, guardado y exports.

Cambiar presentación y conexión de la UI no autoriza reescribir motores o simplificar eliminando funcionalidades. Mantener permisos, marca/negocio activo, tenencia, autenticación, datos y contratos actuales.

## Estado compartido de trabajo

Representar, con los mecanismos que el proyecto ya utilice, origen, tipo de pieza, destino, copy fuente, estado de revisión, marca, estilo y su versión, referencias y roles, prompt vigente, resultados/versiones, alcance seleccionado y guardado confirmado.

Esta lista es de contexto funcional, **no un esquema de base de datos aprobado**. No crear un almacén/historial nuevo ni migraciones por inferencia. Verificar qué se guarda hoy y qué conexión falta.

Los cambios manuales y las instrucciones del agente operan sobre el mismo contexto. Recuperar filtros y posición del banco al volver; no borrar el copy anterior por cambiar la selección. Las imágenes, versiones y documentos se abren con el contexto disponible; un dato faltante no se inventa.

## Matriz de conexiones pendientes

| Conexión objetivo | Qué reutilizar | Qué no asumir |
|---|---|---|
| Tres entradas y continuidad transversal | Bibliotecas, proyectos, documentos y preparación actual | Que todos los módulos ya compartan historial o estructura |
| Catálogo de varios estilos por marca | Configuración, reglas/prompts y revisión visual existentes | Que el catálogo compartido ya esté conectado a todas las herramientas |
| Portadas LinkedIn empresa/empleado | Lienzos, editor, montaje y recursos de marca | Medidas aprobadas, compatibilidad o exports no verificados |
| Chat ↔ campos ↔ botones | Conversación y operaciones existentes | Orquestación nueva completa, ejecución al escribir o confirmaciones repetidas |
| Versión final por lámina y exportación | Variantes, revisión y exportador actuales | Unificación ya implementada para exportar la selección correcta |
| Reapertura desde biblioteca | Versiones, guardados, cola y recuperación actuales | Historial universal ni regeneración automática |
| Contenido de News reutilizado | Texto HTML, escena y procedencia original | Que un PNG final equivalga a la edición original |

## Tres recorridos para comprobar

**A · Desde cero:** idea → contenido → estilo aprobado → preparar → generar → corregir → guardar → retomar.

**B · Desde plantilla:** elegir base compatible → personalizar → revisar → guardar o exportar.

**C · Diseño existente:** abrir → continuar o crear variante → pulir → guardar → reabrir.

Los orígenes se separan del tipo de pieza. Incluir imagen, portada, presentación y carrusel; no convertir LinkedIn en el único alcance.

## Reglas de ejecución

Escribir, adjuntar y navegar no generan. Un botón de acción o una instrucción explícita suficiente ejecuta el proceso actual. Pedir únicamente los datos faltantes. Identificar alcance de pieza, lámina o conjunto y la versión seleccionada.

Aprobar estilo, aprobar copy y aprobar resultado son decisiones distintas. Una actualización de estilo no cambia trabajos anteriores automáticamente. Guardar no se anuncia hasta recibir confirmación real.

Un PNG se edita como píxeles o se monta como base; no tiene capas de texto por aparecer dentro de un editor. La reconstrucción HTML es explícita y requiere revisión.

## Fases

**Fase 0:** inspección, diferencias y propuesta de primera vista; sin modificar código.

**Fase 1, tras autorización:** marco del nuevo espacio y vista 01; conservar accesos existentes y tres orígenes. Captura y revisión.

**Fases siguientes:** una vista del plan vigente por autorización. Priorizar un recorrido completo y comprobar las alternativas sin reconstruir procesos. Mobile, estados y conversación se evalúan transversalmente, no se olvidan hasta el final.

Si una conexión necesaria excede la fase aprobada, registrarla con su dependencia y pedir autorización específica. No simular éxito para ocultar que sigue pendiente.
