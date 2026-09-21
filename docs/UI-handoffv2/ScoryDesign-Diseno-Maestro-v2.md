# Diseño maestro vigente — ScoryDesign UI Handoff v2

## Referencia prioritaria identificada

Fai volvió a adjuntar las vistas «02 · Encargo y tipo de pieza» y «03 · Selección de formato» y aclaró: «Los iconos detalles de esta así deben ser». Después confirmó que el diseño del Encargo corregido debía seguirse en el resto de la serie.

Archivos que gobiernan la apariencia:

- `../reference/aprobado/01-encargo-iconos-y-chat.jpeg`: iconos de módulo, navegación y panel conversacional.
- `../reference/aprobado/02-formatos-iconos-y-detalles.jpeg`: selección, tarjetas, botones, símbolos y detalles.
- `../reference/aprobado/03-encargo-reconfirmado.png`: última reconfirmación de esa familia visual.

Las tres referencias son objetivos de fidelidad estética. No son prueba de que cada texto, logo o dato generado sea correcto. El plan de flujo rige el comportamiento.

## Qué conservar visualmente

Blanco mineral y superficies blancas; tinta azul oscura; cobalto limpio para acción y selección; profundidad discreta; radios suaves; bordes finos; espacio para el contenido. Cabecera ligera y navegación clara, sin convertirlas en grandes bloques navy.

Los iconos principales de pieza son **tipo app**, con cuadrado de esquinas continuas, símbolo blanco fino, volumen moderado y degradado corto: Imagen azul, Carrusel violeta, Presentación verde, Diseño libre naranja. Esos acentos pertenecen a módulos; no autorizan un tema violeta general. Mantener los símbolos y proporciones de la referencia, no sustituirlos por otro juego genérico.

Los iconos de navegación son discretos, azul oscuro, de trazo cuidado y coherente. No forzar contenedores volumétricos en todos: copiar el tratamiento de navegación de la referencia aprobada. No redibujar Biblioteca, Proyectos o Marca por gusto. Si dos destinos necesitan diferenciarse mejor, presentar una corrección aislada para aprobación.

Flechas circulares, estados seleccionados, miniaturas y botones siguen la misma familia. No usar emojis como iconos, neón, grandes brillos, menús oscuros nuevos ni fondos recargados.

Los SVG de la demo v1 **no están aprobados individualmente**. Compararlos con la referencia antes de reutilizarlos. Este paquete no distribuye recursos propietarios de Apple ni archivos de fuentes.

## Valores técnicos de partida, no medición exacta

Los valores del v1 se conservan como aproximación para discutir código, no como nueva dirección de marca:

| Uso de plataforma | Valor orientativo |
|---|---|
| Fondo mineral | `#F1F6FD` |
| Superficie | `#FFFFFF` |
| Tinta | `#101B3B` |
| Texto secundario | `#60718C` |
| Cobalto | `#0866FF` |
| Cobalto profundo | `#004DD8` |
| Cobalto tenue | `#E9F2FF` |
| Bordes | `#DAE5F5` |
| Carrusel, solo icono | `#7955F8` |
| Presentación, solo icono | `#18AF8E` |
| Diseño libre, solo icono | `#FF8A3C` |

Contrastar en capturas reales antes de fijarlos. Usar la tipografía autorizada del proyecto o la pila de sistema. No se ha establecido una nueva fuente web ni una librería de componentes obligatoria.

## Chat y controles: un solo encargo

El usuario puede operar manualmente o diciéndole al agente. Mantener conversación existente, campos, selecciones y botones sobre los mismos valores de trabajo. No crear un modo manual desconectado de un modo IA.

Ejemplo del plan: «Usa este copy, Blanco V3 y haz un carrusel». El asistente selecciona o propone lo que pueda resolver con el contexto real; señala lo que falta; utiliza los procesos actuales. Si la petición es suficiente y explícita para ejecutar, no encadena confirmaciones vacías.

- En Inicio: campo de intención y adjuntos cuando corresponda; no panel de chat vacío permanente.
- En preparación: chat contextual visible o accesible con un panel plegable, junto a las decisiones manuales. Las elecciones hechas en un lado se reflejan en el otro.
- En resultados: conversación sobre la versión seleccionada y alcance visible; no hablar de una imagen distinta de la que se está editando.
- En editores: lienzo protagonista. Evitar sumar navegación global, miniaturas, inspector, chat y sugerencias como cinco columnas fijas. Alternar inspector/asistente en una misma zona o plegar paneles según el ancho, sin borrar el acceso a ninguno.
- En móvil: Diseño/Chat y adjuntos alcanzables, con contexto compartido y acción principal identificada.

No generar al escribir, adjuntar, cambiar filtro o navegar. El estado «Prompt pendiente de actualizar» aparece cuando corresponda a cambios de contenido que aún no se incorporaron al prompt. No fingir que está sincronizado cuando el proceso no lo haya confirmado.

## Acomodo actualizado de Inicio

Tres entradas primarias: **Crear desde cero**, **Usar una plantilla**, **Partir de un diseño existente**. No reemplazarlas por cuatro tarjetas de tipos como única entrada, como ocurría en v1.

Los tipos de pieza se resuelven aparte. Una imagen, carrusel, portada, página o presentación puede utilizar cualquiera de los tres orígenes compatibles.

Acceso a Studio actual, Xending News y Daily Report separado del nuevo Crear y editar. Biblioteca y proyectos usan datos reales o estados vacíos explícitos, no una colección de ejemplos que aparenten estar guardados.

## Plataforma versus pieza de Xending

La UI usa cobalto. La pieza usa el estilo real seleccionado de su marca: Blanco V1, Blanco Xending V2, Blanco Xending V3, Blanco 2.0 o Navy.

No deducir cómo luce cada estilo solo por su nombre. Reutilizar sus prompts, reglas y ejemplos existentes. Si falta un ejemplo o una compatibilidad, marcarla pendiente; no inventar una miniatura «aprobada».

Xending es una marca de servicios financieros y pagos internacionales. Los cables ilustran una industria cliente. No colocar Xending como fabricante, no inventar especificaciones de sus cables ni cambiar sus logos reales por un símbolo generado.

## Entrega visual por vista

Una imagen legible por vista; sin collage diminuto como única entrega. Mantener el marco y los detalles de referencia. La numeración de revisión, explicación de reutilización, conexiones pendientes y notas de evaluación quedan **fuera de la interfaz**.

No copiar la franja «Evaluación del acomodo» dentro de la aplicación. No poner notificaciones, cifras, fechas, usuarios ni aprobaciones inventadas para llenar espacio. No dibujar capas editables sobre un PNG como si ya fueran parte de un documento HTML.

La serie de 19 vistas es un conjunto de estados y alternativas. No añadir un indicador de 19 pasos obligatorios en el producto.

## Prompt visual reutilizable

> Genera una propuesta visual de una sola vista de ScoryDesign usando como referencia exacta los iconos, superficies, cabecera, botones, tarjetas y detalles de `reference/aprobado/`. Conserva blanco mineral, tinta azul oscura, cobalto limpio y profundidad discreta; no propongas otra dirección estética. Aplica la ficha de la vista del mapa vigente y las decisiones del plan del usuario. Distingue origen, pieza, destino, estilo y exportación. Mantén conversación contextual y controles manuales sobre el mismo trabajo, sin saturar el lienzo ni insertar un chat vacío en Inicio. Xending es de pagos internacionales; los cables son contexto industrial del cliente. Usa solo identidades y estilos reales disponibles; señala ejemplos o compatibilidades pendientes. No inventes capacidades, datos, estados guardados o aprobaciones. No generes variantes para decorar la preparación. Las anotaciones van fuera de la UI. Entrega una imagen legible, no un collage. Esta es una propuesta, no una captura implementada.

## Puerta de revisión

Antes de considerar cerrada una vista: comparar iconos, radios, proporciones y densidad con las referencias; revisar conversación + controles; verificar la acción principal y su alcance; distinguir preparación/generación/guardado; registrar qué es existente y qué integración falta. Aprobar el diseño no aprueba automáticamente las funciones propuestas.
