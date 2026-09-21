# Validación de esta entrega

## Lo comprobado

### Vista previa HTML autónoma

Se comprobó el archivo `ScoryDesign-preview.html` en Chromium de escritorio, usando Playwright y cargando su contenido íntegro, con imágenes y estilos embebidos. Esta verificación corresponde al **renderizador local de demostración**, no a un build de React/Vite ni a una sesión de la aplicación del usuario.

Se revisaron **40 combinaciones de vista y ancho**: Inicio, Crear, Biblioteca, Editor, Marca, Sistema visual y los pasos de preparación de Crear, a 1920, 1440, 1024 y 390 píxeles de ancho. En esas comprobaciones no se detectaron desbordamientos horizontales, errores de JavaScript ni solicitudes HTTP externas.

También se ejercitaron estas interacciones:

- Escribir una idea, continuar y conservar el borrador al navegar entre vistas.
- Cambiar tipo de pieza, formato y texto; llegar al resumen y abrir un resultado identificado como ejemplo.
- Buscar y filtrar Biblioteca; comprobar el estado sin coincidencias y volver a los resultados.
- Añadir una imagen WEBP local válida como referencia y rechazar un archivo PNG con contenido corrupto.
- Editar el titular de la portada de ejemplo y comprobar su actualización visible.
- Descargar el HTML de muestra de la diapositiva seleccionada.
- Abrir y cerrar navegación móvil y continuar con el estado de la sesión.

Los resultados de las 40 comprobaciones de ancho/vista están en `qa-results.json`. Las capturas reales del prototipo están en `../preview-captures/`.

### Controlador y sintaxis del código

`tests/demo-controller.test.mjs` comprueba:

- Continuidad de estado al navegar.
- Catálogo de tamaños utilizado por esta base.
- Límite de tres referencias de demostración y cambio de roles.
- Conservación del texto al cambiar de modo y ausencia de generación real.
- Escape de contenido escrito por el usuario en el HTML exportado de muestra.
- Transpilación de los **15 archivos TypeScript/TSX** sin diagnósticos de sintaxis.

Comandos ejecutados en el entorno de elaboración:

```text
SCORY_TYPESCRIPT_PATH=/usr/local/slides_js/node_modules/typescript node scripts/build-offline.mjs
SCORY_TYPESCRIPT_PATH=/usr/local/slides_js/node_modules/typescript node tests/demo-controller.test.mjs
```

La ruta de TypeScript anterior pertenece al entorno de elaboración, no a la computadora del usuario. Los scripts intentan usar primero una instalación local normal de TypeScript; después de instalar las dependencias del demo aislado se pueden ejecutar `npm run build:offline` y `npm test` sin esa variable.

## Lo pendiente

**No se ejecutó el build de React/Vite ni una comprobación completa de tipos contra las dependencias instaladas.** La instalación de dependencias no se pudo completar porque el entorno no resolvió el registro npm. La transpilación de sintaxis no sustituye esas pruebas.

Tampoco se ha inspeccionado ni modificado el repositorio real del usuario. Quedan pendientes para Codex, en ese repositorio:

1. Contrastar los componentes, rutas y contratos declarados en los documentos con el código actual.
2. Ejecutar los comandos reales de typecheck, lint, pruebas y build.
3. Conectar únicamente las acciones de la pantalla aprobada, conservando negocio activo, permisos y comportamiento.
4. Comprobar generación, guardado, recuperación, biblioteca y exportación con los servicios existentes, cuando corresponda a esa pantalla.
5. Comparar visualmente la interfaz React real con la referencia y revisar cada vista antes de avanzar.

## Límites de estas pruebas

No son una auditoría completa de accesibilidad, seguridad, rendimiento ni compatibilidad entre navegadores. Los anchos móviles se comprobaron mediante un viewport estrecho de Chromium, no en un iPhone físico.

No se afirma equivalencia píxel por píxel con los renders. Los assets son recortes de demostración, no archivos maestros. La aplicación final debe usar imágenes, logos, datos, estados y textos aprobados de cada negocio.

Los botones de generar, guardar en nube o analizar no llaman servicios reales. La exportación HTML de muestra no reemplaza el motor de exportación existente de Design.
