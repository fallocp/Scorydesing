# ScoryDesign — plan consolidado de implementación de la nueva UI

Fecha: 20 de septiembre de 2026. Primera entrega de UI implementada en la rama de trabajo: navegación, cabecera e Inicio. Revisión visual del usuario pendiente. Ver sección 9 para el alcance comprobado y las conexiones que faltan.

Este documento incorpora las correcciones del usuario posteriores al handoff v2 y al mapa de recorridos. Conserva la dirección visual aprobada y precisa el comportamiento acordado. Es la referencia de continuidad para implementar por entregas; el código actual determina qué capacidades existen.

## 1. Estado real de partida

- Base de código: `experimental/desaing`, commit `fed69bed7ee679889ce5b54529c70c3d06ecb4ab`.
- Rama de trabajo creada: `codex/ui-crear-editar-v2`, desde esa base.
- La base estaba limpia: sin cambios rastreados, archivos nuevos ni staging pendientes. La advertencia anterior sobre 118 cambios y 115 entradas nuevas ya no describe el estado actual.
- `feat/xending-usa` sigue en `7829a2f01deca1f68b048ad6e5bb4e5305aeb971`; no se modifica esa rama.
- La carpeta anterior `artifacts/ui-fase0-2026-09-20` ya no se encuentra en esta copia. Este documento consolida las decisiones desde la conversación; no afirma recuperar aquellos archivos o capturas byte por byte.
- El paquete original `docs/UI-handoffv2` y sus referencias visuales sí están presentes.
- `npm run build` pasó: TypeScript y build Vite. Advertencias de empaquetado por tamaño de chunks e imports estáticos/dinámicos; no errores. No se cambió configuración para ocultarlas.
- No se instalaron dependencias, ejecutaron migraciones, generaron imágenes ni accedió a datos productivos en esta preparación.

## 2. Destino del proyecto

Todas las herramientas terminarán integradas en la nueva UI. La versión actual permanece funcional durante la transición. Compartir navegación y apariencia no elimina los recorridos especializados de Studio, News y Daily.

Reutilizar llamadas, procesos, prompts, ideas/copys, conversación, editores, píxeles, regeneración, montaje, versiones, guardado y exportaciones. No reconstruir la aplicación ni copiar los motores, datos ficticios, router o configuración de la demo archivada.

Inicio tendrá tres entradas: **Crear nuevo / Usar plantilla / Editar**. Editar incluye regenerar cuando corresponda. El origen no determina el formato; no volver a preguntar decisiones conocidas. Crear nuevo para Xending conserva sus estilos aprobados.

## 3. Decisiones de producto consolidadas

### Imagen y Studio

Conservar Studio y ambos bancos de copy, incluidos los anteriores. En la nueva preparación, el copy activo queda visible y el catálogo se pliega mediante Cambiar copy, conservando búsqueda, filtros y página.

Mantener Blanco V1, Blanco Xending V2, Blanco Xending V3, Blanco 2.0 y Navy con sus valores y prompts actuales. No necesitan nueva aprobación. Mantener los tratamientos visuales existentes —incluidos fotografía, infografía y mapas/financiero—.

Crear nuevo → completar las decisiones faltantes de formato/estilo/copy/referencias → preparar prompt → generar → editar → guardar/retomar. Cambiar una selección conserva acceso al resultado anterior y distingue lo desactualizado. Texto editable y píxeles son capacidades diferentes.

### Carrusel

**Elegir copy → generar narración → seleccionar la historia que gusta → preparar contenido visual con los prompts actuales → revisar lo que dice y corregir → generar láminas → editar píxeles o láminas → guardar, exportar o retomar.**

Utilizar los diseños aprobados de Xending, incluyendo V2, V3 y Navy. No exigir generar una imagen individual antes. Las etapas pueden agruparse visualmente; no son ocho pantallas obligatorias. Conservar historia elegida, guion, prompts y versiones. La selección final debe corresponder con lo exportado.

La cola ya incorpora determinadas correcciones de píxeles mediante recibos; reutilizarlo y comprobar/completar otros caminos, como variantes de montaje. No volver a construir lo que existe.

### Presentación

No hay un catálogo de bases aprobadas listo para ofrecer. Existe la presentación Xending ya realizada: extraer su estilo y guardarlo como base es una tarea explícita. Los archivos de plantillas en código no prueban la existencia de ese catálogo de producto.

**Intención, fotos u otras referencias/presentaciones → explorar en imágenes → pedir ideas, regenerar o editar píxeles hasta elegir → convertir a HTML editable → completar y editar la presentación → guardar, exportar o retomar.**

Reutilizar todo Presentaciones: conversación, exploración, generadores, conversión, editor, compositor, proyectos y salidas. Un proyecto HTML existente entra directamente en edición sin repetir exploración/conversión.

Mantener el formato habitual de la presentación actual. El usuario lo recuerda como “media carta creo”; verificar nombre y medidas contra ese documento antes de fijar un preset. No sustituirlo por una medida deducida de una maqueta o un valor por defecto.

### Portada, página y diseño especial

Definir qué se quiere y si existe una foto/diseño de base o se comienza libremente. Chat y controles comparten el trabajo y ofrecen ideas, fotos, PDF y otros recursos por el proceso compatible.

Conservar todos los formatos disponibles en ScoryDesign. Los tres presets de Diseño libre no representan todo el inventario del producto. Integrar cada formato con su herramienta y salida real; medidas nuevas de portadas requieren verificación antes de implementación.

### News y Daily

**Mismo proceso actual con la nueva UI**, más los ajustes ya acordados sobre correcciones y controles compatibles. Conservar estructuras, prompts, escenas/kit, texto HTML, formatos, composición, guardado y salidas. No imponerles el formulario creativo general.

La recuperación editable adicional de Daily que propuso la auditoría queda fuera de esta migración. Las observaciones sobre limitaciones o metadata no autorizan cambiar sus datos, formatos o composición.

### Estilos

Crear estilos nuevos desde cero con datos y referencias, o iniciar una idea por chat y pulirla iterativamente. Poder usar trabajos reales de Biblioteca como ejemplos, conservando procedencia.

Datos/referencias/idea → propuesta → conversar y ajustar → revisar/aprobar → guardar → añadir a los estilos existentes y usar en recorridos compatibles. Conservar los actuales y sus versiones. Una imagen guardada no es automáticamente un estilo aprobado.

Reutilizar dirección creativa, materiales y permisos actuales. El catálogo de múltiples estilos coexistentes por marca requiere conexión y un contrato de datos delimitado, sin sustituir los prompts maestros actuales por implicación.

### Biblioteca y editor HTML

Biblioteca conserva organización, acciones y datos actuales: qué se hizo, formato, modelo, procedencia y demás metadata disponible. La imagen llega a su circuito correspondiente sin importar el módulo de origen. Comprobar las conexiones de las entradas nuevas sin duplicar Biblioteca, crear otra taxonomía o migrar todos los almacenes.

Los trabajos guardados también pueden servir para desarrollar estilos nuevos mediante una acción explícita. No modificar los originales ni inventar metadata ausente en trabajos antiguos.

**El editor HTML funciona igual que ahora:** mismas herramientas, comportamiento, recursos, guardado y salidas. Integrarlo visualmente sin reemplazarlo por controles reducidos ni rasterizar documentos editables.

### Opciones compartidas

- Ayuda para idear, chat y controles sobre el mismo contexto; no dos historiales desconectados.
- Referencias de fotos, PDF, datos y otras presentaciones según el adaptador compatible. El selector de imágenes y Materiales tienen contratos distintos; no fingir un importador universal.
- Regenerar y editar píxeles sobre la imagen/versión elegida; conservar el original.
- Modelos actuales: **GPT Image 2 / 2.5 Flare / 2.5 Sunburst**.
- Calidad independiente del modelo: **Low / Medium / High**.
- Reutilizar `ImageGenerationControls` y preferencias existentes. Respetar combinaciones admitidas; no sustituir silenciosamente una selección.
- Escribir, adjuntar o navegar no genera. Una instrucción explícita suficiente ejecuta sin confirmaciones redundantes; preguntar solo lo indispensable que falta.

## 4. Qué ya está decidido y qué falta

| Tema | Estado | Próximo resultado verificable |
|---|---|---|
| Objetivo y recorridos | Definidos con las correcciones del usuario | Mantenerlos al implementar |
| Estética | Familia aprobada clara/cobalto e iconos exactos | Contrastar cada vista real con las referencias |
| Base de código | Guardada, limpia y build aprobado | Usar `fed69be` para detectar regresiones |
| Rama independiente | Creada: `codex/ui-crear-editar-v2` | Trabajo nuevo acotado en esa rama |
| Inicio | Implementado en `/create`; pendiente revisión visual del usuario | Navegación, cabecera y vista 01 revisables |
| Transmisión del encargo | Borrador por cuenta/negocio en esta pestaña y entrega visible al destino | Falta aplicación directa revisable a los campos de cada herramienta; hoy se copia explícitamente |
| Chat/controles | Procesos existentes; integración común pendiente | Una selección visible compartida y una sola ejecución |
| Guardado y reapertura | Reutilizar contratos por herramienta | Resultado y versión localizables; no confundir generado y guardado |
| Bases de Presentaciones | Base Xending por extraer/guardar | Base real reutilizable con procedencia |
| Estilos compartidos | Capacidad por completar | Añadir estilos aprobados sin sustituir los actuales |
| Formato habitual de presentación | Nombre/medidas por confirmar contra el documento | Conservar dimensiones reales |

## 5. Primera entrega: Inicio, navegación y cabecera

La siguiente implementación productiva se limita a la vista 01 y su marco. Las demás vistas se revisan y ejecutan después; este documento no equivale a implementar todo el roadmap.

### Apariencia

Referencias: [diseño maestro](F:/ScoryDesign/docs/UI-handoffv2/docs/DISENO_MAESTRO.md) y [Encargo reconfirmado](F:/ScoryDesign/docs/UI-handoffv2/reference/aprobado/03-encargo-reconfirmado.png).

Conservar blanco mineral, superficies blancas, tinta azul oscura, cobalto y los iconos aprobados. Sin otra barra lateral genérica, tema navy nuevo, fuentes/dependencias nuevas o elementos ficticios. La selección Navy cambia la pieza, no la UI.

### Contenido

- Marca/negocio activo real y acceso a las herramientas permitidas.
- Tres entradas con los nombres confirmados: Crear nuevo, Usar plantilla, Editar.
- Campo de intención, evitando un panel de chat vacío permanente en Inicio.
- Accesos a Studio, News/Daily, Presentaciones, Diseño libre y Biblioteca según capacidades actuales. Durante la transición pueden abrir sus pantallas existentes.
- Trabajos/bases solo con datos reales; vacío honesto cuando corresponda. No inventar un catálogo de plantillas de Presentaciones ni proyectos recientes.

### Conexiones a resolver en esta entrega

| Entrada | Comportamiento delimitado | Condición de aceptación |
|---|---|---|
| Crear nuevo | Seleccionar un destino real disponible; conservar encargo y marca al abrirlo | No generación por navegación; no perder intención |
| Usar plantilla | Abrir selección compatible solo con bases realmente guardadas; explicar el vacío cuando no existan | No maqueta con un catálogo ficticio ni aplicación de plantilla de otra marca |
| Editar | Abrir Biblioteca o proyecto existente en su herramienta compatible | No regenerar al abrir ni prometer HTML en una imagen plana |
| Acceso a módulos | Reutilizar rutas, autenticación y permisos actuales | Mantener la herramienta funcionando como antes |

Para no exceder Inicio, los selectores pueden ser paneles del marco y desembocar en procesos existentes. Si el traspaso de intención a un destino requiere más alcance, delimitar su adaptador antes de mostrar un envío exitoso. La primera entrega debe ser funcional y revisable; no botones que simulen generación/guardado.

### Archivos previstos

- Modificar `src/App.tsx`: ruta autenticada adicional propuesta `/create`.
- Modificar `src/pages/XendingDesignPage.tsx`: acceso al nuevo espacio, conservando el Inicio actual durante la transición.
- Crear `src/pages/CreateEditPage.tsx`.
- Crear `src/components/create-edit/CreateEditShell.tsx`, `StartOptions.tsx` y estilos limitados al espacio nuevo.
- Crear un contrato/adaptador de entrada acotado bajo `src/lib/create-edit/` cuando sea necesario para conservar intención/origen. Reutilizar el negocio activo y persistencias existentes, sin otro motor de generación.
- Cualquier ajuste mínimo para abrir una pestaña concreta de Studio se declara como conexión de navegación; no rediseña Studio, News o Daily.

La lista es una previsión de cambios, no archivos ya creados. No reemplazar configuraciones, servicios ni CSS global para conseguir la nueva apariencia.

### Validación de la primera entrega

Build y tipos; lint sobre archivos modificados y pruebas pertinentes a navegación/contexto. Comprobar autenticación/negocio, tres entradas, destinos reales y que escribir/adjuntar/navegar no ejecuta generación. Capturas reales a 1440, 1024 y 390 px; teclado, foco, legibilidad y ausencia de desbordamiento. Revisar el diff para detectar cambios no previstos en módulos antiguos.

No es necesario volver a ejecutar toda la aplicación para documentar decisiones; las pruebas funcionales y capturas corresponden a la entrega implementada. El build de base ya ejecutado no certifica la UI nueva, que aún no existe.

## 6. Entregas posteriores

1. Imagen Xending completa: preparación, copy/estilo/formato/referencias, generación, edición y guardado/reapertura; chat y controles sincronizados.
2. Bases y trabajos existentes: continuar o usar como base, preservando origen y datos reales.
3. Carruseles: narración/historia, contenido visual revisado, generación, correcciones y versión final exportada.
4. Presentaciones y documentos: explorar imagen, convertir a HTML, editar; base Xending; formatos existentes y portadas compatibles.
5. Estilos: creación con datos/chat/Biblioteca, revisión y disponibilidad compartida.
6. Migración visual de Studio, News, Daily, Biblioteca y editor HTML con comportamiento conservado. El objetivo final es una UI común; no enlaces permanentes a pantallas antiguas.

Móvil, recuperación, permisos y conservación de la versión actual se comprueban durante cada entrega. No incluir las mejoras funcionales de Daily descartadas por el usuario.

## 7. Recomendación de razonamiento

**Astra High para implementar Inicio y cambios acotados. Extra High (`xhigh`) para revisar integraciones complejas, continuidad, versiones y regresiones entre módulos.** No hace falta usar Extra High en cada ajuste visual. Esta distribución es una recomendación para este proyecto, no una garantía de calidad.

OpenAI Docs confirma que GPT-6 Astra admite `low`, `medium`, `high`, `xhigh` y `max`: [modelo oficial](https://developers.openai.com/api/docs/models/gpt-6-astra). La metadata local también incluye `xhigh`. No se cambió el modelo ni su configuración en esta preparación.

## 8. Resultado de esta preparación

La preparación inicial creó la rama y comprobó el build base, sin cambiar la aplicación. Las decisiones quedaron consolidadas fuera del paquete original. Después de la autorización «Adelante con lo siguiente», se implementó la primera entrega descrita a continuación. No hay publicación, push ni migración.

## 9. Primera implementación realizada

### Acceso y alcance

- Ruta autenticada `/create`, dentro del `AuthGate` existente, accesible desde la nueva tarjeta «Crear y editar» del Inicio actual.
- Navegación clara, cabecera con negocio activo y tres orígenes: Crear nuevo / Usar plantilla / Editar.
- Tipos Imagen, Carrusel, Presentación y Diseño libre. Los formatos, estilos y controles siguen dentro de la herramienta actual.
- Studio, News y Daily tienen accesos precisos mediante `tab=studio`, `tab=news` y `tab=fx-daily`. El selector actual de pestañas conserva los demás parámetros de navegación.
- Editar imagen abre `/assets`; presentaciones y diseño libre abren sus editores actuales. Carrusel abre Studio para seguir su mecánica actual. No se selecciona ni genera una historia automáticamente.
- Usar plantilla muestra un estado pendiente y permite cambiar a Editar para abrir un trabajo existente. No existe todavía un selector unificado de bases ni se anuncian plantillas aprobadas inexistentes.
- Diseño libre, Materiales y Configurar marca respetan la disponibilidad del servicio actual. Las entradas creativas requieren cuenta y negocio; durante el cambio explícito de negocio esperan la resolución del RPC existente.

### Continuidad real de esta entrega

Se conservan origen, tipo e indicaciones en `sessionStorage`, separados por usuario y negocio. Es un borrador de esta pestaña, no un proyecto guardado en Biblioteca ni un historial nuevo del generador. Volver a Inicio o recargar en la misma pestaña recupera ese borrador. Una falla de almacenamiento se comunica y evita salir mediante Continuar perdiendo el texto.

Al continuar se muestra el origen y el texto encima de la herramienta de destino. «Copiar indicaciones» permite pegarlo en su campo existente. **No se insertan automáticamente esas indicaciones, no se convierten en copy aprobado y no se conectó aún el chat unificado desde Inicio.** Esta limitación es visible; la aplicación directa revisable corresponde a la siguiente integración, conservando el estado previo del editor.

### Archivos

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | Agrega `/create` y el contexto de entrada bajo la autenticación actual |
| `src/pages/XendingDesignPage.tsx` | Agrega acceso al nuevo Inicio |
| `src/pages/DesignStudioPage.tsx` | Adapta únicamente las pestañas principales a la URL |
| `src/pages/CreateEditPage.tsx` | Negocio, capacidades, borrador y navegación |
| `src/components/create-edit/CreateEditHome.tsx` | Navegación, cabecera y vista de Inicio |
| `src/components/create-edit/create-edit.css` | Estilos acotados a `ce-*`; adaptación móvil |
| `src/components/create-edit/CreateEntryHandoff.tsx` | Muestra y permite copiar las indicaciones en el destino |
| `src/lib/create-edit/entry.ts` | Contrato local de borrador y destinos permitidos |
| `src/lib/create-edit/entry.test.ts` | Aislamiento, recuperación, destinos y pestañas válidas |

### Comprobaciones

- `npm run build`: aprobado, TypeScript y Vite. Persisten advertencias de tamaño e imports estáticos/dinámicos del build base.
- ESLint: sin errores ni avisos en los archivos nuevos, App y el Inicio anterior. Studio conserva 23 avisos en código previo; no se amplió este cambio para resolverlos.
- 35 pruebas aprobadas en seis archivos: entrada, modelos/calidades, generación compartida News/FX, generación compartida del carrusel, recuperación de mockups y propiedades de Studio.
- Chromium: componente real de Inicio a 1440, 1024 y 390 px; sin desbordamiento horizontal, errores JS ni solicitudes externas en la prueba. Verificadas las tres entradas, navegación explícita, menú móvil, acceso por teclado, disponibilidad y recuperación del borrador en el adaptador local de revisión.
- Capturas: `artifacts/ui-inicio-2026-09-20/inicio-desktop.png`, `inicio-tablet.png`, `inicio-mobile.png`. Harness, script y resultados en la misma carpeta; fuera de las rutas y del build productivo.
- **Las capturas usan contexto de prueba, no una sesión autenticada ni datos reales.** No se verificaron contra el backend las membresías, el RPC de cambio de negocio ni el guardado/generación. Los motores y sus contratos no se modificaron.
- Las referencias de ramas `experimental/desaing` y `feat/xending-usa` permanecen en sus commits de partida. Los cambios nuevos están en el árbol de trabajo de `codex/ui-crear-editar-v2`, todavía sin commit.

### Siguiente revisión

Revisar este Inicio antes de migrar las demás vistas. Después, conectar las indicaciones a la preparación existente con una acción explícita que preserve el borrador previo del editor, y desarrollar la selección real de bases. Continúan pendientes el catálogo compartido de estilos, la base Xending de Presentaciones y la integración contextual del chat. Esta primera entrega no los declara terminados.
