# Encargo para Codex · Integración del diseño aprobado

## Mensaje inicial: inspección, sin cambiar la aplicación

```text
Trabaja sobre el repositorio real de ScoryDesign / Design, no sobre la demo como una aplicación nueva. La documentación lo ubica en F:\ScoryDesign con Vite + React + TypeScript: confirma la ruta y el stack inspeccionando el repositorio.

Lee primero las instrucciones vigentes del proyecto: AGENTS.md y las guías/steering que existan. No las sobreescribas.

El paquete de diseño se encuentra en docs/ui-handoff/. Lee:
- README.md
- docs/DISENO_MAESTRO.md
- docs/INTEGRACION.md
- docs/MAPA_DE_PANTALLAS.md
- docs/VALIDACION.md
- reference/flujo-original.pdf
Mira las imágenes de reference/, especialmente 01-inicio-anotado.png, y abre ScoryDesign-preview.html para estudiar la traducción a interfaz.

OBJETIVO
Adaptar la interfaz actual al diseño claro/cobalto aprobado: mismos módulos, nueva capa visual, mejoras moderadas de acomodo. No crear otra aplicación. No reconstruir funciones que ya existen. No confundir ScoryDesign con el proyecto de compliance scory-v1.

FASE 0 — SOLO INSPECCIÓN Y PLAN
1. Identifica rama, cambios locales, scripts de arranque/pruebas, dependencias de UI, rutas, layout, menús, estilos y componentes existentes. No descartes trabajo local ni cambies de rama sin avisar si hay modificaciones.
2. Localiza Inicio o su equivalente, selector de negocio, AuthGate, inicialización del negocio activo, Design Studio, Banco de contenido, Carrusel, Presentaciones, Biblioteca, Diseño libre, Marca/materiales, News, FX y renderer. Los nombres que aparecen en documentos son pistas, no garantía de que las rutas sigan iguales.
3. Separa lo que ya existe de la integración nueva propuesta por el PDF y de lo meramente ilustrativo en las maquetas.
4. Identifica qué componentes se pueden reutilizar directamente y qué cambios de presentación necesitan.
5. Entrega una tabla: pantalla/elemento → archivo real → cambio visual → comportamiento que debe preservarse → prueba de regresión.
6. Señala cualquier diferencia de catálogo, permisos, persistencia, exports o navegación respecto al PDF. No la resuelvas silenciosamente.
7. Propón SOLO la primera implementación: marco de navegación + cabecera + Inicio. Detalla los archivos que tocarías.

No modifiques código de la aplicación en esta fase. No instales paquetes. No implementes las 21 vistas. Espera aprobación del plan.
```

## Mensaje de ejecución después de aprobar el plan

```text
Implementa únicamente la fase aprobada: navegación global, cabecera e Inicio, usando el diseño de docs/ui-handoff/.

CONDICIONES OBLIGATORIAS
- Adapta el stack real; no sustituyas package.json, lockfile, router o configuración de build por los de la demo.
- Reutiliza los componentes, rutas, hooks y acciones actuales. Si un componente visual ya existe, refactoriza su presentación en lugar de duplicar su lógica.
- Mantén el comportamiento de AuthGate, negocio activo, membresías, permisos, modos single/multi y aislamiento de datos. No copies datos de un negocio a otro.
- No cambies Supabase, migraciones, RLS, Storage, Edge Functions, APIs, modelos, prompts, calidad de generación, cuotas, créditos, orquestación o renderer.
- No cambies el motor HTML/edición/exportación de presentaciones y piezas.
- No renombres el repositorio ni la marca. El nombre ScoryDesign es provisional y debe ser configurable.
- No conviertas las imágenes de referencia en el fondo completo de una pantalla. Texto, botones, menús, campos e iconos deben ser componentes reales del DOM.
- No copies anotaciones exteriores, números de lámina o la franja “Evaluación del acomodo” dentro del producto.
- No inventes fechas, cifras, aprobaciones, guardados, proyectos, usuarios, identidades de marca o promesas comerciales para que la interfaz se vea completa.
- La estética de plataforma no reemplaza la identidad del cliente. Los cables son un ejemplo de contenido, no el tema obligatorio de la app.
- Si Proyectos o Plantillas no existen como destinos globales, registra la situación y conserva los accesos reales: no construyas módulos nuevos para imitar la demo.

DISEÑO
Cobalto claro, fondos blancos/minerales, tinta azul oscura, esquinas suaves, profundidad sutil. Iconos SVG con siluetas propias, contenedores redondeados inspirados en apps de iPhone, sin recursos propietarios de Apple. Colores secundarios solo en los iconos de módulo aprobados. No volver al menú navy de bloque pesado ni a un tema violeta general.

PRIMERA ENTREGA
- Conectar Inicio con los handlers y datos reales que ya existan.
- Preservar estados reales de carga, vacío y error.
- Mantener el texto/referencias del encargo según los contratos actuales; no ejecutar generación al escribir un borrador.
- Permitir revisar la nueva UI sin eliminar prematuramente la anterior; usa el mecanismo de rollout que ya exista. Si no hay uno, propón una opción reversible mínima, sin nueva arquitectura.
- Ejecutar typecheck, lint, tests y build que correspondan al proyecto. Reportar los comandos exactos y sus resultados. No declarar pruebas que no pudiste ejecutar.
- Capturar la interfaz real en 1440 px, 1024 px y 390 px; revisar también 1920 px. Comparar con la referencia y corregir antes de entregar.
- Verificar navegación, foco visible, campos etiquetados, texto legible, scroll sin desbordamiento horizontal, reducción de movimiento y ausencia de errores de consola.
- Entregar diff y resumen: archivos cambiados, comportamiento preservado, dudas abiertas, pruebas ejecutadas y capturas.

Detente al completar esta primera pantalla. No avances a Crear, Biblioteca, Presentaciones u otras pantallas hasta que aprobemos el resultado visual.
```

## Para cada pantalla siguiente

```text
Trabaja SOLO la vista [ID del PDF + nombre], aplicando el sistema visual ya aprobado.
Primero revisa su comportamiento actual, luego su referencia estética y las observaciones del mapa.
Conserva la funcionalidad, los datos, el estado y las decisiones ya aprobadas.
No repitas preguntas ni generes nuevas pantallas cuando la información ya esté disponible.
No crees una copia paralela del módulo.
Entrega captura real, diff y pruebas. Detente para revisión de esta vista.
```

**Nota sobre instrucciones permanentes:** el uso de AGENTS.md está documentado por OpenAI. Si estas reglas se adoptan como permanentes, proponer su incorporación al archivo existente; no reemplazarlo. Esta tarea sigue siendo una integración visual incremental, no permiso abierto para modificar el sistema.
