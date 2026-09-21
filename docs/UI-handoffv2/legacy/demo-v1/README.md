# ScoryDesign · Base visual para Codex

**Dirección:** cobalto claro + blanco mineral + profundidad discreta + iconos originales inspirados en la presentación de apps de iPhone.

**Entrega:** referencia implementable de interfaz. No es un reemplazo del repositorio ni una integración con el backend. El nombre ScoryDesign sigue siendo provisional: este trabajo no renombra productos, repositorios o módulos.

## Empieza aquí

1. Abre `ScoryDesign-preview.html` en un navegador. Es autónomo, sin red y sin instalación.
2. Lee `docs/PROMPT_CODEX.md`. Contiene el encargo de inspección y el de implementación de la primera pantalla.
3. Coloca esta carpeta, completa y sin sobreescribir archivos existentes, dentro de `docs/ui-handoff/` del proyecto real.
4. Abre **el repositorio real** en Codex, no esta carpeta como si fuera otra aplicación. La documentación disponible sitúa Design en `F:\ScoryDesign`; verificar la ruta actual.
5. Primero inventario y plan; después, con aprobación, navegación + cabecera + Inicio. No implementar todo el rediseño de una sola vez.

## React o HTML: qué es cada cosa

- `src/`: fuente React + TypeScript, componentes de presentación y CSS. Es la base que Codex debe adaptar al Vite/React existente.
- `ScoryDesign-preview.html`: demostración HTML + JavaScript para evaluar el acomodo. Usa las vistas JSX traducidas con un pequeño renderizador de demostración; **no incluye ni ejecuta el runtime React**. No llevar ese renderizador a producción.
- El HTML que Design ya usa como contenido/exportación de piezas y presentaciones es **otra capa**. Conservar su renderer y sus contratos. No sustituirlos por este preview.
- `package.json`, `index.html` y `main.tsx`: arranque opcional del demo React aislado. No reemplazar con ellos los archivos homónimos de la aplicación real.

## Qué puedes probar

Inicio, selección de tipo de pieza, formatos, edición de texto de ejemplo, referencias locales, resumen, presentación de un resultado de muestra, Biblioteca con búsqueda/filtros/detalle, portada editable de ejemplo, ficha de marca orientativa y muestrario visual.

Se conserva el estado de la sesión al cambiar entre las vistas de demostración. Al recargar se reinicia. No hay persistencia en nube ni un motor de IA; los botones que requieren esas funciones lo dicen expresamente.

La selección de Presentación abre directamente el editor de ejemplo; no pretende recrear el flujo real completo de plantillas y composición. Los otros cuatro thumbnails del editor son ilustrativos: solo la portada tiene campos editables en esta base.

**No están implementadas las 21 vistas del PDF como producto completo.** Están mapeadas en `docs/MAPA_DE_PANTALLAS.md`, con sus límites y la secuencia sugerida para integrarlas una por una.

## Qué archivos importan

| Archivo | Uso |
|---|---|
| `docs/PROMPT_CODEX.md` | Encargo para Codex, fases, restricciones y aceptación. |
| `docs/DISENO_MAESTRO.md` | Prompt y especificación visual reutilizable. |
| `docs/MAPA_DE_PANTALLAS.md` | Relación de las 21 vistas del PDF con maquetas y demo. |
| `docs/INTEGRACION.md` | Qué reutilizar, adaptar y no tocar. |
| `docs/VALIDACION.md` | Comprobaciones realizadas y pendientes. |
| `src/styles/tokens.css` | Variables de color, espaciado, radios y sombras propuestas. |
| `src/styles/design.css` | Estilos de componentes, adaptables y con prefijo `sd-`. |
| `src/ui/Icons.tsx` | SVG originales + contenedores de iconos tipo app. |
| `src/ui/Shell.tsx` | Navegación, identidad provisional y cabecera. |
| `src/pages/` | Vistas de referencia para estudiar su composición. |
| `src/demo-controller.ts` | Comportamiento local del demo; NO sustituye lógica de negocio. |
| `src/integration-contract.ts` | Contrato orientativo para mapear acciones existentes. |
| `reference/` | PDF original y las maquetas elegidas, no las paletas descartadas. |

## Arrancar el demo React por separado

En una copia aislada de esta carpeta, no sobre la raíz de producción:

```powershell
npm install
npm run dev
```

Para comprobarlo:

```powershell
npm run typecheck
npm run build
```

Las versiones en el `package.json` de este demo son un punto de arranque independiente. Para integrarlo al proyecto real, conservar sus versiones, package manager y lockfile. No migrar a Next.js, no instalar Tailwind o un sistema de componentes adicional si la aplicación no lo requiere.

## Orden de autoridad

**Comportamiento operativo:** código actual verificado + decisiones aprobadas. El PDF documenta comportamiento y propuestas; no sustituye una auditoría actual.

**Recorrido objetivo:** PDF original. Sus 21 vistas no son 21 pasos obligatorios.

**Estética:** imágenes elegidas de esta conversación. Las anotaciones exteriores son explicaciones, no interfaz.

**Valores técnicos:** tokens propuestos y catálogo del PDF. Las imágenes generadas no son una fuente fiable de tamaños, textos, marcas, estados o fechas.

Ante una contradicción, registrarla y resolverla antes de programar. No corregir silenciosamente la lógica actual ni asumir que todo lo dibujado ya existe.

## Assets y marcas

Los WEBP son recortes demostrativos de las maquetas adjuntas, no assets maestros. Deben reemplazarse por imágenes y logos originales aprobados del proyecto. Los cables son un caso de contenido; la aplicación es para trabajar con distintas marcas. No convertir a Xending en fabricante de cables ni usar un logo generado como identidad oficial.

Los SVG del paquete son dibujos originales; no se distribuyen SF Symbols ni tipografías de Apple. La tipografía usa la pila del sistema. En Windows su apariencia tipográfica puede diferir de la de un iPhone.

## Alcance de validación

La vista HTML autónoma fue probada en Chromium, con navegación, estado de borrador, búsqueda, filtros, edición de portada y exportación local de ejemplo. Ver `docs/VALIDACION.md`.

El código fue revisado por transpilación de TypeScript para errores de sintaxis. **No se ejecutó el build React/Vite ni una comprobación completa de tipos contra dependencias instaladas**, porque el entorno de elaboración no pudo resolver el registro npm. Codex debe ejecutar las comprobaciones reales en el repositorio. Ningún código del repositorio del usuario se ha modificado en esta entrega.
