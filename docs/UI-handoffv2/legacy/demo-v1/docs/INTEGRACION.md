# Integración incremental en el producto real

## Base documental, no auditoría del repositorio

La documentación recuperada identifica Design en `F:\ScoryDesign`, Vite + React + TypeScript. El inventario posterior aclara que rutas y conteos deben contrastarse antes de cambiar código. En esta entrega no se inspeccionó el repositorio ni se accedió a su despliegue.

Pistas documentadas para buscar, no archivos que se asumen vigentes:
`AuthGate`, `useInitActiveBusiness`, `DesignStudioPage`, `CopyBankV2Panel` / `CopyBankPanel`, `CarouselPanel`, `useCarouselQueue`, `CarouselPdfComposer`, `FxDailyPanel`, `NewsPanel` y `renderer/scripts/render-server.js`.

## Separar tres capas

1. **Interfaz de la aplicación:** componentes React, tokens, navegación y acomodo. Este es el alcance actual.
2. **Contenido creado:** imágenes, carruseles y composiciones HTML. Conserva su motor y sus reglas.
3. **Servicios y datos:** Supabase, permisos por negocio, generación, persistencia y exports. No modificarlos para cambiar la apariencia.

No confundir la carpeta `renderer` con el frontend completo ni con una invitación a reconstruir el sistema de renderizado.

## Estrategia recomendada

Revisar componente actual → aislar cambio visual → aplicar tokens/estilos/componentes → conectar las mismas acciones → verificar datos y estados → captura y revisión de Fai.

No copiar `src/App.tsx` sobre la aplicación real. `App.tsx` y `demo-controller.ts` contienen datos de demostración y navegación local. El sistema existente tiene que seguir siendo propietario de la autenticación, las rutas, la generación y la persistencia.

Las vistas del paquete son pequeñas muestras de composición. Reutiliza `Icons`, partes del `Shell` y tokens según convenga; si la aplicación ya tiene un sistema de componentes, mapea el lenguaje visual sobre él.

Mantener prefijo/alcance de estilos para no modificar automáticamente otros módulos. `demo-page.css` es solo para la demo autónoma y no debe importarse en producción. Los nombres `sd-*` son orientativos; adaptar a las convenciones del repositorio.

## Componentes propuestos

- Marco de aplicación: marca configurable, selector de negocio, cabecera y navegación.
- Iconos: símbolo SVG + contenedor con variante visual.
- Entrada de encargo: texto, adjuntos, continuar.
- Tarjeta de tipo de pieza: icono, nombre, descripción y selección.
- Tarjeta de formato: nombre, dimensiones del catálogo y proporción real.
- Tarjeta de recurso/proyecto: miniatura, metadatos reales, estado real y acciones.
- Panel contextual: encargo, resumen, referencias y ayuda de la vista actual.
- Marco de editor: miniaturas, lienzo, inspector y alcance del cambio.

Son responsabilidades de UI, no instrucciones para añadir nuevas tablas, servicios o agentes.

## Funciones que deben sobrevivir

El PDF declara plantillas, editor, piezas, reconstrucción editable y compositor de presentaciones; biblioteca, referencia por roles; edición de píxeles y comparación; guardados y recuperación; y exports específicos por módulo. No reimplementar esas funciones desde cero.

De decisiones previas del proyecto: presentaciones ya cuenta con carga de archivos, chat de refinamiento y construcción HTML. Revisar y reutilizar esos puntos. No introducir un segundo chat o un segundo motor de presentaciones. Cualquier montaje o extracción de assets debe seguir el alcance autorizado, no activarse como efecto secundario de un cambio de UI.

News, carrusel comercial y Daily FX conservan su separación funcional. Daily FX no es un panel de métricas de campañas aunque alguna maqueta lo dibuje así. Los datos de mercado no se inventan para completar un diseño.

## Decisiones de interacción

Escribir un borrador no ejecuta una acción. El usuario confirma con el control correspondiente. Si ya indicó formato o texto, mantener la decisión y omitir la pregunta, como establece el PDF.

La demo muestra todos los pasos de preparación para inspeccionarlos; no implica un asistente lineal obligatorio en producción.

Si ya están definidas las entradas «Ejecutar cambio» y «Explorar diseño», mantener su separación. Un cambio directo se aplica al recurso/version seleccionados; explorar no genera ni edita automáticamente. Las reglas reales de API se verifican en el proyecto y se conservan. No añadir nuevas llamadas por estética.

## Regresión mínima antes de aceptar una pantalla

Autenticación y negocio activo correctos; permisos y aislamiento preservados; navegación y contexto; estados reales de carga/vacío/error; persistencia y recuperabilidad cuando correspondan; ausencia de generación duplicada; ningún cambio accidental a copia aprobada; salida compatible con el módulo; accesibilidad y vista móvil.

Revisar también reabrir un proyecto, cambiar de sección y regresar, errores de red, assets faltantes, texto largo y referencias ausentes. No simular éxito cuando falta una integración.

## Recursos oficiales consultados para el handoff

- React: Add React to an Existing Project — https://react.dev/learn/add-react-to-an-existing-project
- React: Using TypeScript — https://react.dev/learn/typescript
- OpenAI: instrucciones de proyecto con AGENTS.md — https://developers.openai.com/codex/guides/agents-md/

Estas referencias apoyan la integración por componentes y la configuración de instrucciones; no prueban el estado actual del repositorio de Design.
