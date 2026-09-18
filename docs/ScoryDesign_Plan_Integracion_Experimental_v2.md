# ScoryDesign — Plan maestro de integración experimental de imágenes

**Versión 2.0 · Septiembre de 2026**  
**Para:** Fai, CTO y el agente de desarrollo elegido: Kiro **o** Codex.  
**Estado:** especificación para revisión y ejecución por tareas autorizadas. No acredita implementación, pruebas ejecutadas ni despliegue.  
**Rama propuesta:** `experiment/scorydesign-image-workflows-v2`.

> **Regla principal: mejorar lo existente sin romperlo.** Auditar antes de crear. Reutilizar presentaciones, carga de archivos, chat, HTML, biblioteca, copys, carruseles y permisos que ya existan. Mantener el flujo actual disponible. Recibir este plan no autoriza a ejecutar todas sus fases.

## Cómo usar este documento

Este plan consolida el manual de evaluación anterior y las decisiones posteriores de Fai. El manual original se conserva como antecedente técnico; cuando exista una diferencia de alcance, prevalecen las decisiones de producto recogidas aquí. No hace falta consultar códigos como «A / R3»: las tareas y sus cambios se describen por nombre.

Se distinguen tres tipos de información:

- **Confirmado por Fai o por su diagnóstico:** describe lo declarado sobre el producto; no equivale a auditoría del repositorio.
- **Documentado por el proveedor:** función contrastada en documentación oficial; no acredita acceso en la cuenta ni rendimiento propio.
- **Propuesta de implementación:** contratos, nombres de campos, permisos específicos, pruebas y fases que el desarrollador debe adaptar a lo existente.

Las fuentes están al final. No se ha inspeccionado el repositorio en esta entrega, creado una rama, modificado la base de datos, generado imágenes de prueba ni consumido la API.

---

## 1. Decisiones que corrigen y completan el plan anterior

| Tema | Decisión vigente |
|---|---|
| Presentaciones | Ya existen carga de archivos, chat de refinamiento y construcción HTML. Reutilizar y mejorar solo lo necesario. No construir otro módulo paralelo. |
| Diseño antes de HTML | Añadir una ruta opcional: generar diseño visual → aprobarlo → usarlo como referencia para construir HTML → montar elementos como imágenes independientes. Conservar también el camino actual de HTML directo. |
| Elementos dentro de HTML | Añadir el botón **«Añadir imágenes montadas»**, conectado a la biblioteca existente y al diseño seleccionado. |
| Feedback en carruseles/copys | El panel lateral recoge instrucciones puntuales. La ejecución de imágenes permanece en Image API; no se convierte en una sesión Responses por tener aspecto de chat. |
| Editar y regenerar | Ambos pertenecen a Image API en producción, pero son acciones diferentes: editar usa la imagen seleccionada; regenerar crea otra propuesta desde el brief. |
| Diseño conversacional | Responses se reserva en este producto para presentaciones, nuevas marcas, nuevos estilos y sesiones de pulido creativo de imágenes/diseños. |
| Sunburst | Escalamiento manual excepcional para casos muy complejos o que no se resolvieron con el perfil estándar. No activar por cualquier error ni cambiar a él silenciosamente. |
| Prompt maestro | Añadir feedback directo en UI, basado en resultados aprobados, exclusivo para Fai con permisos administrativos autorizados. Proponer, revisar, probar y publicar una versión; nunca sobrescribir automáticamente. |
| Kiro / Codex | Cualquiera puede ejecutar la misma especificación. No asignar a uno solo planificación y al otro solo programación. Un responsable por tarea. |
| Protección del sistema actual | Nueva rama experimental, entorno de pruebas aislado, activación controlada y ruta de retorno. Una rama Git por sí sola no protege una base de datos o un despliegue compartidos. |

Estas son decisiones de producto, no limitaciones exclusivas de OpenAI. Image API también puede sostener iteraciones si la aplicación administra el estado; Responses también puede resolver una edición puntual. La separación anterior es la política elegida para ScoryDesign. [O1, O2, O3]

## 2. Lo que debe inspeccionarse y reutilizarse

### 2.1 Inventario inicial obligatorio

El diagnóstico original declara React/TypeScript, Supabase Edge Functions con Deno, `copy_bank_items`, `generate-design-image`, `generate-design-mockups`, `design_mockups` e `image_library`. También declara referencias que no siempre se transmiten y feedback que no siempre usa los píxeles anteriores. Son puntos de inspección, no defectos comprobados mediante código en esta entrega. [F1]

| Área | Situación declarada | Trabajo autorizado por este plan cuando se apruebe su fase |
|---|---|---|
| Presentaciones HTML | Existe. | Identificar editor, renderizador, persistencia, exportación y componentes reutilizables. |
| Chat de presentaciones | Existe. | Revisar proveedor, contexto, herramientas, selección de elementos y recuperación de sesiones. No asumir que el backend actual ya usa Responses. |
| Carga de archivos | Existe en presentaciones. | Reutilizar el componente y las validaciones; extender únicamente las capacidades faltantes. |
| Biblioteca e historial | Existen. | Comprobar si soportan linaje de versiones, recortes, imágenes recreadas y usos en HTML. |
| Carruseles/copys | Existen. | Mantener su metodología y añadir edición real y controles experimentales. |
| Prompt maestro | Debe localizarse su implementación real. | Identificar plantillas, versiones, variables y alcance antes de añadir feedback administrativo. |
| Usuarios y permisos | Deben inspeccionarse. | Reutilizar autorización existente y restringir la gestión del prompt maestro a Fai. |

**Entregable del inventario:** rutas/archivos reales, flujo actual, qué se conserva, qué falta y propuesta mínima de cambios. No inventar nombres de endpoints, tablas o servicios existentes para completar un diagrama.

### 2.2 Fuera de alcance inicial

No reconstruir el editor de presentaciones; no sustituir el banco de copys; no rediseñar toda la UI; no entrenar un modelo; no publicar automáticamente; no migrar todos los clientes; no introducir una nueva arquitectura general sin necesidad demostrada.

## 3. Tres decisiones independientes: espacio, acción y modelo

El backend debe decidir por un contrato explícito, no por «el usuario escribió texto» o «el panel parece chat».

**Espacio de trabajo:** producción de piezas; estudio conversacional de diseño; presentaciones.

**Acción:** generar, editar imagen, regenerar propuesta, cambiar una capa HTML, analizar/proponer, extraer elemento o recrear elemento.

**Modelo de imagen:** perfil estándar validado o Sunburst como excepción manual. Elegir Sunburst no cambia automáticamente de API ni convierte una edición en regeneración.

| Espacio y solicitud | Ruta prevista | ¿Qué debe recibir? |
|---|---|---|
| Carrusel/copy: crear imagen | Image API, generación. | Brief y copy aprobados, reglas y formato. |
| Carrusel/copy: corregir imagen seleccionada | Image API, edición. | Imagen real y versión exacta + feedback + restricciones. |
| Carrusel/copy: nueva propuesta desde cero | Image API, generación. | Brief aprobado + cambios de intención autorizados. |
| Carrusel/copy: corregir capa HTML editable | Compositor existente. | Identificador de capa y nuevo texto autorizado; no render de imagen. |
| Nuevas marcas/estilos: explorar y pulir | Responses como orquestador conversacional. | Material de marca, referencias seleccionadas y estado de la sesión. |
| Presentaciones: conversar sobre diseño o un elemento | Responses; herramienta de imagen solo cuando corresponda. | Lámina/elemento/versiones seleccionadas y conversación relevante. |
| Presentaciones: montar una imagen ya aprobada | Editor/compositor HTML. | Archivo aprobado y configuración de colocación; no generación adicional. |

**Importante:** en una conversación no todos los mensajes deben generar una imagen. «¿Qué cambiarías?» puede producir solo una propuesta textual. «Mueve el tractor dentro del HTML» puede cambiar posición sin recrear sus píxeles. La aplicación debe controlar qué operaciones se ejecutan y cobran.

## 4. Interfaz para slides e imágenes de producción

### 4.1 Controles

Reutilizar la tarjeta actual y extenderla sin rehacer la pantalla:

| Control | Comportamiento |
|---|---|
| Miniatura y selector | Selecciona inequívocamente la imagen y versión objetivo. Muestra «Slide 3 · versión 2», por ejemplo. |
| **Editar** | Abre/enfoca el campo de feedback y trabaja sobre la imagen seleccionada. |
| **Regenerar** | Crea una nueva propuesta. Advierte que la composición puede cambiar; no promete conservar la anterior. |
| **Comparar versiones** | Muestra antes/después y permite aprobar una versión. No llama al generador. |
| **Modelo / opciones avanzadas** | Muestra modelo actual y acceso a **«Intentar con Sunburst»** para casos excepcionales. |
| Panel lateral de feedback | Recoge instrucciones breves para la selección actual. Sigue siendo feedback productivo, no el estudio conversacional. |
| **Mejorar prompt maestro** | Solo aparece para Fai autorizado y una versión aprobada; abre un proceso separado. |

No es necesario poner todos los controles como botones grandes. La jerarquía propuesta es Editar y Regenerar visibles; comparación y modelo pueden agruparse en acciones secundarias. Conservar el acceso técnico a prompts para administración, sin obligar al usuario normal a reescribirlos.

### 4.2 Selección segura

Cada envío fija `asset_id`, `base_version_id` y, si aplica, `slide_id`. Son nombres conceptuales. La versión fija prevalece sobre cualquier referencia ambigua como «la última».

Si la selección cambia mientras se genera, el resultado se incorpora a la pieza original del trabajo, no a la tarjeta que esté seleccionada al finalizar. Nunca editar las otras cuatro slides por una instrucción referida a la tercera.

No crear «editar todas» en esta primera fase. Aplicar cambios a varias piezas requeriría selección y confirmación explícitas por alcance.

## 5. Edición puntual: contrato funcional para el backend

### 5.1 Secuencia

1. Autenticar usuario y comprobar acceso a empresa, proyecto, imagen y versión.
2. Leer la versión seleccionada desde almacenamiento y verificar que el archivo existe.
3. Recuperar copy aprobado, reglas de marca, formato y elementos que deben preservarse.
4. Interpretar el feedback sin ampliar el alcance. Resolver ambigüedades antes de generar.
5. Construir una instrucción de edición visible para administración y guardar su versión efectiva.
6. Enviar la imagen real al endpoint de edición; una descripción o ID interno sin archivo resoluble no basta.
7. Guardar el resultado como nueva versión, vinculada a su padre.
8. Validar salida y mostrar comparación. Mantener el resultado anterior disponible.
9. Registrar aprobación/rechazo y motivo. No modificar el prompt maestro por este evento.

La referencia oficial de Image API documenta edición con imagen de entrada. El formato exacto del request y las opciones admitidas se validarán con el SDK instalado antes de implementar. [O3]

### 5.2 Ejemplo: «Jamón y aguacate»

**Feedback:** «En esta imagen corrige Jamo por Jamón y agrega un aguacate pequeño a la derecha del plato».

**Instrucción interna propuesta:**

```text
Edita la imagen adjunta, que corresponde a la versión seleccionada.

CAMBIOS AUTORIZADOS
1. Sustituye únicamente el texto visible “Jamo” por “Jamón”.
2. Añade un aguacate pequeño a la derecha del plato, dentro del espacio libre.

CONSERVAR
Todo el texto restante; las cifras y monedas; el CTA; la paleta; el estilo;
la iluminación; el encuadre; la posición y escala de los objetos existentes;
las reservas para logo y legal. La incorporación del aguacate es la única
adición de objeto autorizada.

NO HACER
No rediseñes la pieza, no inventes otros objetos ni textos y no añadas
logotipos o disclaimers. No modifiques otras slides.
```

El backend debe comprobar si «Jamón» ya estaba en el copy aprobado. Si estaba bien en el copy y mal en la imagen, es una corrección del render. Si se cambia el propio mensaje editorial, se registra una nueva versión del copy y su autorización; no se modifica en silencio el banco.

Si el texto es una capa HTML editable, corregir esa capa. No volver a generar el fondo para corregir una palabra.

### 5.3 Preservación y máscaras

Una máscara puede orientar una edición localizada, pero no debe tratarse como garantía matemática de que el modelo no tocará nada alrededor. Si se exige igualdad de píxeles, utilizar recorte/composición sobre el original y verificar la región protegida. La guía oficial recomienda composición para esa exigencia. [O4]

Una edición rechazada se conserva como evidencia, pero no reemplaza la versión aprobada ni se convierte automáticamente en base de futuros intentos. El usuario elige la base.

## 6. Regeneración: misma familia API, acción diferente

**Editar:** «Esta imagen me sirve; corrige estos detalles».

**Regenerar:** «Haz otra propuesta a partir del mismo brief».

El botón Regenerar no debe ejecutar edición sobre la imagen anterior por costumbre. Tampoco debe sobreescribirla. Guarda un nuevo candidato con el mismo origen editorial y registra que se permitió cambiar composición.

En el experimento inicial, la regeneración desde cero usa la ruta de generación con los mismos inputs de texto. Una propuesta nueva guiada por referencias puede necesitar el adaptador de imágenes de entrada; se registra como operación con referencias, no como una solicitud de texto puro equivalente. El usuario no tiene que elegir el endpoint.

**Sunburst sigue la acción seleccionada:** editar con Sunburst continúa siendo edición; regenerar con Sunburst continúa siendo una nueva propuesta.

## 7. Estudio conversacional para nuevas marcas, estilos y pulido

### 7.1 Alcance

Usar Responses para dirigir conversaciones creativas en los espacios definidos por Fai: onboarding visual, nuevas líneas de diseño, mejora/pulido creativo y presentaciones. No abrir ese modo implícitamente al recibir tres mensajes de feedback en un carrusel.

El contexto conversacional puede gestionarse con mecanismos como `previous_response_id`; conservar además historial propio y versiones de assets. La herramienta puede generar o editar, y el modelo principal puede producir un `revised_prompt`; registrar ese campo cuando exista. [O2]

### 7.2 Onboarding propuesto

**Carga:** negocio, público, objetivos, PDFs, colores, logos, referencias y contraejemplos. Reutilizar carga y biblioteca existentes. La documentación permite trabajar con archivos PDF en modelos compatibles; leerlos no equivale a haber preparado automáticamente cada logo u objeto como referencia independiente para el generador. [O7]

**Comprensión:** devolver una ficha breve que distinga información confirmada de interpretaciones visuales. Pedir confirmación de lo relevante antes de consolidar identidad. No heredar por defecto las reglas de Xending a otro cliente.

**Exploración:** producir cinco propuestas identificables, con diferencias de diseño concretas. Guardar cada una por separado y contabilizar cada render. No suponer que un parámetro de una API garantiza una galería completa en una sola llamada de la otra.

**Selección:** permitir elegir varias y comentar qué gusta, qué sobra y qué falta. Ejemplo: «De la 1, la composición; de la 3, la fotografía; de la 5, la limpieza». Registrar esas preferencias por referencia, no simplemente «le gustan 1, 3 y 5».

**Pulido:** presentar una propuesta combinada como nuevo candidato, no alterar las cinco originales. Continuar hasta aprobar una dirección visual.

**Entrega:** guardar ficha de estilo, referencias aprobadas, assets y restricciones. Su aplicación al prompt maestro exige el paso administrativo de la sección 11.

### 7.3 Control de contexto

Anclar cada cambio a una imagen o elemento y versión seleccionados. Al cambiar de lámina, actualizar explícitamente el objetivo; el historial de otra lámina no debe provocar una edición sobre ella.

Conservar un resumen de decisiones aprobadas y reenviar restricciones críticas en la solicitud actual. No enviar todos los PDFs y toda la biblioteca en cada turno por defecto. No confiar en la sesión del proveedor como única persistencia del producto.

## 8. Presentaciones: ampliar el módulo existente

### 8.1 Qué no se construye de nuevo

La carga de archivos, el chat de refinamiento y el trabajo HTML ya existen según Fai. El agente debe localizar esas funciones, explicar qué cambios necesitan y reutilizarlas. Primero comprobar si el selector, la biblioteca y el historial también cubren los requisitos; solo añadir lo que falte.

### 8.2 Dos caminos dentro del mismo módulo

**Camino actual:** contenido → HTML → ajustes. Se conserva.

**Nuevo camino opcional:**

```text
Contenido y referencias
        ↓
Generar diseño primero
        ↓
Pulir por conversación y aprobar una imagen de referencia
        ↓
Usar diseño como referencia para HTML
        ↓
Separar elementos: texto / estructura / gráficos / imágenes
        ↓
Extraer o recrear los elementos visuales necesarios
        ↓
Añadir imágenes montadas al HTML
        ↓
Revisar composición híbrida y aprobar
```

El diseño generado es una guía visual, no una autorización para sustituir el contenido aprobado por el texto que el modelo haya dibujado.

### 8.3 Controles a incorporar o reutilizar

- **Generar diseño primero:** inicia el camino visual sin bloquear HTML directo.
- **Usar diseño para HTML:** toma la versión aprobada como referencia y abre/procesa la construcción en el editor actual.
- **Añadir imágenes montadas:** inserta elementos de la biblioteca, de un archivo o derivados de la referencia.
- **Extraer elemento / Recrear elemento:** distingue conservar un objeto de diseñar uno nuevo inspirado en él.
- **Guardar elemento reutilizable:** incorpora el resultado aprobado a la biblioteca de su empresa/marca.

Los nombres son propuestas de interfaz; deben integrarse con la nomenclatura existente. No añadir una segunda barra o un segundo chat si ya existe uno apropiado.

### 8.4 No es una conversión automática a capas originales

El desarrollo debe reconstruir en HTML/CSS la estructura elegida y conservar imágenes donde corresponda. El generador entrega imágenes, no el árbol de objetos original de un diseño. No llamar «HTML editable» a una página que únicamente contiene una captura completa dentro de una etiqueta de imagen. [O1]

Sí puede mantenerse una lámina completa como JPG/PNG cuando Fai elija **«Dejar como imagen»**. El sistema debe distinguir esa modalidad de una lámina realmente híbrida.

## 9. Caso completo: sacar el tractor y montarlo en HTML

### 9.1 Selección y encargo

Fai selecciona el diseño aprobado y pide: «De aquí quiero el tractor; saca ese elemento y úsalo en la presentación HTML».

El sistema recupera la imagen completa para entender perspectiva, iluminación y estilo, más la región del tractor cuando esté identificada. No envía solo el nombre del objeto.

### 9.2 Dos operaciones diferentes

| Operación | Qué conserva | Qué debe comunicar |
|---|---|---|
| **Extraer este tractor** | Usa los píxeles existentes mediante recorte/recorte con máscara cuando sea viable. | No reconstruye partes tapadas ni cambia por defecto el diseño del tractor. |
| **Crear un tractor basado en este** | Usa la imagen como referencia y genera un objeto nuevo. | Puede cambiar detalles. No se presenta como extracción exacta del original. |

Si hace falta inventar una rueda que no se ve o reconstruir un objeto cortado, esa parte es generación, no recuperación del archivo original. Debe mostrarse como tal y revisarse.

En presentaciones, Responses puede coordinar la conversación y llamar a las herramientas necesarias. Una operación de recorte o montaje ya resuelta no necesita pagar otra generación de imagen.

### 9.3 Archivo y transparencia

**JPG es válido para una imagen rectangular con fondo. Para una silueta sin fondo, guardar PNG o WebP con transparencia.** JPEG no contiene canal alfa. [O9]

No imponer PNG a toda la presentación. Elegir formato por elemento: fotografía opaca en JPG si conviene; objeto recortado en PNG/WebP; texto y estructura en HTML. Conservar un maestro del elemento y derivados de exportación.

### 9.4 Montaje

El botón «Añadir imágenes montadas» permite insertar el tractor aprobado. Se configura su posición, tamaño, proporción, recorte y orden de capas. El tractor debe poder reemplazarse sin regenerar la lámina completa.

El título, los párrafos, cifras, logo y otros elementos que deban ser editables se mantienen como capas independientes. La imagen completa aprobada se conserva como referencia visual, no necesariamente como fondo final.

### 9.5 Refinamiento posterior

«Haz el tractor más pequeño» dentro del montaje modifica su escala en HTML.

«El tractor debe verse de lado en vez de tres cuartos» requiere nueva imagen o edición visual, con nuevo asset y aprobación.

«La cabina quedó rara, corrígela» abre una iteración sobre la versión del tractor, no sobre toda la diapositiva. Tras aprobar el resultado se reemplaza únicamente ese asset en el HTML.

### 9.6 Mismo flujo para el mundo

«De esta imagen solo me interesa el mundo» debe permitir extracción o creación basada en referencia. «Haz los puntos más tenues» se aplica a la versión seleccionada del mundo. El resto de la presentación no cambia salvo instrucción explícita.

## 10. Botón «Añadir imágenes montadas»: especificación

### 10.1 Orígenes admitidos

Biblioteca existente; archivo subido; elemento extraído del diseño de referencia; elemento recreado durante la sesión. Los cuatro deben terminar en una referencia persistente, autorizada y versionada.

### 10.2 Acciones mínimas

Seleccionar, insertar, mover, redimensionar conservando proporción, cambiar orden, reemplazar, retirar de la lámina y guardar para reutilización. Retirar del HTML no debe borrar automáticamente el asset de la biblioteca.

### 10.3 Datos conceptuales de colocación

Identificador del elemento, versión del asset, lámina destino, posición, dimensiones, modo de ajuste, recorte, orden, texto alternativo y versión de composición. Adaptar estos datos al esquema actual antes de proponer tablas nuevas.

### 10.4 Criterios de aceptación

El elemento sigue disponible al recargar; la exportación incluye la versión correcta; no se deforma; se conserva la transparencia; un enlace temporal vencido no deja la lámina sin imagen; se comprueba pertenencia a la empresa; reemplazarlo no cambia el copy ni los demás elementos.

El HTML generado se trata como contenido no confiable: aplicar las políticas de sanitización/aislamiento existentes, impedir scripts o cargas arbitrarias no autorizadas y revisar la exportación. No ejecutar directamente cualquier HTML devuelto por un modelo en un contexto con privilegios.

## 11. Feedback del prompt maestro, exclusivo para Fai

### 11.1 Dos feedbacks distintos en UI

**Feedback de la imagen:** «quita ese objeto». Cambia una pieza.

**Feedback del prompt maestro:** «En esta familia de piezas, evita acumular objetos; la versión final aprobada muestra el nivel de limpieza correcto». Propone una mejora reutilizable.

No convertir el primero en el segundo automáticamente.

### 11.2 Acceso

Añadir **«Mejorar prompt maestro»** solo para Fai, con rol admin/superadmin y autorización específica del sistema. No concederlo a cualquier administrador de una empresa cliente por compartir el nombre de rol.

Propuesta de permiso: `prompt_master.manage`, vinculado a la identidad administrativa real. No inventar el ID de Fai ni basarse en un nombre visible. Verificar el permiso tanto al abrir datos sensibles como al proponer, probar, aprobar, publicar o revertir por backend.

### 11.3 Flujo administrativo

1. Fai aprueba una versión visual o una dirección de diseño.
2. Pulsa «Mejorar prompt maestro» y escribe qué debe aprender el sistema.
3. Selecciona alcance: pieza/familia, marca, flujo o global. El global nunca se aplica implícitamente.
4. El backend reúne prompt maestro y versión originales, brief, prompt efectivo, referencias, feedback relevante y resultado aprobado.
5. Un agente propone un cambio acotado: problema observado, causa posible, texto anterior/nuevo, beneficio esperado y riesgos.
6. La UI muestra las diferencias y permite editar o rechazar la propuesta.
7. Se prueba contra un conjunto congelado, sin cambiar simultáneamente de modelo, calidad y formato.
8. Fai autoriza publicar una versión nueva y su alcance. Conservar reversión a la anterior.

**Aprobar una imagen no publica un prompt. Publicar un prompt no rediseña automáticamente las imágenes ya aprobadas.**

### 11.4 Diagnóstico antes de modificar

| Hallazgo | Destino probable de la corrección |
|---|---|
| El copy estaba bien, pero el render omitió un acento. | Evaluación del render, edición o capa de texto; no demuestra por sí solo un fallo del prompt maestro. |
| El generador de prompts omite sistemáticamente la reserva del logo. | Plantilla/ensamblador de prompts. |
| El copy aprobado ya era incorrecto. | Banco editorial y proceso de aprobación. |
| La referencia no llegó al proveedor. | Integración del backend, no añadir más adjetivos al prompt. |
| La tipografía se corta al exportar HTML. | Compositor/exportador. |
| Una línea visual aprobada debe reutilizarse para esa marca. | Configuración de marca o plantilla del flujo, con alcance explícito. |

No se puede deducir de una imagen final una causa interna única del modelo. Registrar como hipótesis la causa y verificar la propuesta. No confundir este proceso con entrenamiento automático del modelo.

### 11.5 Presentación propuesta en UI

```text
Mejorar prompt maestro

Versión visual aprobada: [imagen / lámina / elemento]
Prompt de origen: [identificador y versión]
Alcance: [marca / familia / flujo / global autorizado]

¿Qué debe repetirse en futuros diseños?
¿Qué no debe volver a ocurrir?

[Preparar propuesta]  [Ver diferencias]  [Probar]
[Guardar borrador]    [Publicar versión aprobada]
```

El administrador puede ver el prompt efectivo y el `revised_prompt` del proveedor cuando exista. Eso no obliga a mostrar todos los prompts al cliente final.

## 12. Modelos: estándar y rescate excepcional

### 12.1 Política de producto

El perfil candidato estándar es Flare `medium`, condicionado a pruebas frente al modelo actual. Producción mantiene el perfil vigente hasta aprobación; este documento no convierte Flare en default global ya validado.

Sunburst se ofrece mediante una acción manual de mayor exigencia. Antes del envío deben estar claros modelo, acción, calidad, versión base y presupuesto disponible. No aumentar calidad a `max` al cambiar de modelo sin permiso.

La documentación describe Flare como orientado a rapidez y Sunburst a calidad/edición exigente. Esta orientación no determina por sí sola qué resultado tendrá ScoryDesign. [O5, O6]

### 12.2 Cuándo escalar

Tras revisar que el problema no es archivo ausente, copy incorrecto, formato mal aplicado o exportación defectuosa. La complejidad visual o un fallo de preservación pueden justificar probar Sunburst; un timeout o bloqueo de seguridad no deben activar cambios ciegos de modelo.

Propuesta inicial: un intento de rescate autorizado por versión; nuevos intentos requieren confirmación y presupuesto. El límite definitivo lo aprueba Fai/CTO antes del piloto.

### 12.3 Transparencia de costos

No mostrar «Sunburst cuesta X veces más» sin datos. Los modelos 2.5 comparten tarifas por categoría de tokens, pero pueden consumir cantidades diferentes. Responses añade el consumo del modelo principal y los componentes de la aplicación también pueden costar. [O1]

El costo de una sesión puede aumentar con su contexto: usar `previous_response_id` no vuelve gratuitos los tokens anteriores. Medir uso real por turno y por sesión. [O8]

## 13. Catálogo central de formatos

### 13.1 Alcance

Conservar la petición de añadir formatos para Instagram, Stories, TikTok, LinkedIn, portadas y presentaciones **en todos los servicios relevantes**, no solo en un selector de frontend.

Cada entrada debe distinguir nombre de producto, destino final, tamaño de generación, proporción, transformación, formato de archivo, transparencia, zonas de seguridad y fecha/fuente de verificación del destino.

### 13.2 Presets y verificación pendiente

Los tamaños sociales siguientes son presets propuestos para ScoryDesign, no una afirmación de que sean los únicos admitidos por cada plataforma. La validación final debe distinguir publicación orgánica, anuncio, portada y contenido estático frente a video.

| Preset | Salida final | Generación / composición propuesta | Estado |
|---|---:|---|---|
| Instagram cuadrado | 1080×1080 | 1088×1088 → reducción proporcional. | Contrato de producto; verificar publicación concreta. |
| Instagram vertical | 1080×1350 | 1088×1360 → reducción proporcional. | Contrato 4:5 solicitado; no implica que sea la única proporción disponible. |
| Instagram Story | 1080×1920 | 1152×2048 → reducción proporcional. | Revisar reservas de interfaz del destino. |
| TikTok imagen vertical | 1080×1920 | 1152×2048 → reducción proporcional. | Preset de imagen; no genera un video ni garantiza compatibilidad de todo placement. |
| LinkedIn publicación cuadrada | 1200×1200 | Puede probarse 1200×1200 directamente. | LinkedIn documenta este tamaño recomendado para anuncios de imagen; verificar aparte uso orgánico. [O10] |
| LinkedIn publicación horizontal | 1200×628 | Composición final exacta; asset generado en tamaño válido y recorte/encaje explícitos. | Tamaño recomendado documentado para anuncios de imagen. [O10] |
| LinkedIn portada de página | 1512×256 | Composición híbrida al tamaño final; no render ultrapanorámico directo. | Tamaño publicado en ayuda de LinkedIn Pages consultada. [O11] |
| LinkedIn portada personal | Por verificar antes de habilitar. | Preset separado de la portada de página; composición al tamaño confirmado. | No quedó confirmada su especificación oficial en esta revisión. |
| Presentación panorámica | 1920×1080 | HTML final o imagen 2048×1152 reducida. | Preset de producto 16:9. |
| Asset reutilizable | Según uso y escala necesaria. | PNG/WebP con alfa o JPG opaco. | No confundir proporción del objeto con proporción de la lámina. |

No declarar terminada la tarea de formatos mientras la portada personal o el placement correspondiente continúen sin verificación. Guardar los presets experimentales como tales y no etiquetarlos «oficial».

### 13.3 Reglas de dimensiones

Para los modelos documentados, el tamaño personalizado tiene restricciones de múltiplos de 16, proporción máxima 3:1, lado máximo 3840 y total entre 655,360 y 8,294,400 píxeles. Validar contra la documentación y la respuesta real del endpoint. [O1]

Una portada más ancha que 3:1 no se resuelve mandando su tamaño final directamente al modelo. Generar assets y componer el lienzo final, o aplicar un recorte aprobado. Nunca estirar para forzar la proporción.

### 13.4 Propagación

Auditar selector, validación frontend, backend, generador de prompts, adaptadores Image/Responses, composición HTML, exportación, almacenamiento, metadata e historial. Registrar qué servicios consumen el catálogo común. No replicar otra tabla independiente en cada función.

## 14. Arquitectura mínima propuesta y contratos

No se prescribe una nueva pila tecnológica. Adaptar la existente con límites claros:

**UI → autorización/selección → resolución de contexto → instrucción de operación → adaptador de ejecución → almacenamiento/versionado → validación → revisión.**

El compositor HTML opera como herramienta separada del generador de píxeles, aunque pueda coordinarlo el mismo espacio conversacional.

### 14.1 Contrato conceptual de solicitud

| Campo | Finalidad |
|---|---|
| Empresa, marca y proyecto | Delimitar autorización y reglas. |
| Modo de trabajo | Producción, estudio de diseño o presentaciones. |
| Acción | Generar, editar, regenerar, componer, extraer, recrear, analizar. |
| Asset/slide/versión base | Identificar objeto exacto. Obligatorio al editar. |
| Feedback | Instrucción original del usuario, sin borrar su intención. |
| Cambios autorizados e inmutables | Separar lo que cambia de lo que debe conservarse. |
| Copy y su versión | Evitar sustituir contenido aprobado por texto reconstruido de una imagen. |
| Referencias con rol y versión | Estilo, objeto, disposición; solo archivos autorizados. |
| Formato y perfil de modelo | Resolver tamaño/API/modelo/calidad en el servidor. |
| Sesión conversacional | Solo cuando corresponda; no equivale al ID del asset. |
| Identificador de operación | Evitar envíos duplicados y permitir seguimiento. |

Los nombres definitivos se decidirán tras revisar contratos existentes. El frontend no debe poder omitir controles de acceso o seleccionar modelos sin autorización mediante campos manipulados.

### 14.2 Validaciones previas

Archivo existente; pertenencia; versión vigente o rama explícita; copy resuelto; parámetros compatibles; presupuesto; ausencia de contradicciones; permiso de Sunburst si aplica; prompt sin variables pendientes. Si falla una condición, no cobrar un intento que ya se sabe inválido.

### 14.3 Prompt efectivo

Guardar qué recibió el sistema, qué construyó y qué envió. Una plantilla puede completar contexto a partir del feedback breve, pero no agregar una segunda reescritura oculta e ilimitada después de la aprobación técnica. En Responses registrar también la reformulación que el proveedor exponga. [O2]

## 15. Datos, versiones y trazabilidad

Primero mapear lo que ya existe. Las siguientes son entidades conceptuales, no una orden de crear siete tablas nuevas:

| Entidad | Datos mínimos |
|---|---|
| Versión de imagen | ID, padre, empresa, imagen base, output, operación, modelo, calidad, dimensiones, aprobación. |
| Evento de feedback | Usuario, texto original, objetivo, momento, cambios interpretados y resultado. |
| Trabajo de ejecución | Estado, intentos, tiempos, request IDs, errores, presupuesto y costos. |
| Sesión de diseño | Contexto aprobado, referencias, versiones relevantes y enlaces al estado Responses. |
| Composición HTML | Versión del documento, manifiesto de capas y versiones de assets montados. |
| Propuesta de prompt | Prompt origen, diferencias, feedback administrativo, evidencia, pruebas y estado de publicación. |
| Catálogo de formatos | Salida, generación, transformaciones, fuente, versión y validación. |

Conservar por separado prompt maestro, brief, prompt de render, prompt de edición y `revised_prompt`. No son intercambiables.

No guardar claves, tokens de sesión, base64 masivo ni URLs firmadas completas en logs públicos. Los archivos del cliente y el feedback administrativo no deben cruzar empresas ni quedar visibles por una URL adivinable.

## 16. Rama experimental y protección del sistema actual

### 16.1 Antes de tocar código

El agente elegido informa repositorio real, rama actual, estado de cambios sin guardar, commit de partida y servicios conectados. No hace `reset`, limpieza destructiva, cambios en otra tarea o modificaciones automáticas de archivos ajenos.

Crear la rama nueva propuesta, o el nombre equivalente aprobado, desde la base acordada. Conservar las modificaciones existentes del usuario. Kiro y Codex no deben editar simultáneamente los mismos archivos sin coordinación.

### 16.2 Separar código y servicios

La rama Git aísla cambios de código; la seguridad del experimento también requiere verificar las conexiones. Propuesta: entorno local o preview, base/Storage de prueba y funciones experimentales que no sustituyan los endpoints en uso.

Supabase documenta entornos de branching con credenciales separadas; su disponibilidad y ajuste a este proyecto deben comprobarse, no darse por incluidos en la cuenta. [O12]

**No desplegar automáticamente las Edge Functions experimentales sobre producción.** Una variable o nombre nuevo en una rama no protege una función remota sobrescrita con el mismo identificador.

### 16.3 Activación controlada

Separar banderas de funciones para laboratorio, edición real, diseño conversacional, diseño previo a HTML y feedback maestro. Desactivadas fuera del entorno/usuarios autorizados. Nombres finales sujetos al sistema actual.

Esquemas aditivos, archivos versionados y configuración reversible. No borrar datos viejos ni reemplazar imágenes aprobadas. Toda prueba con API de pago requiere presupuesto autorizado.

### 16.4 Instrucción operativa

```text
Trabaja en una rama experimental nueva, sin modificar el comportamiento
actual fuera del experimento. Primero inspecciona y reporta.

Reutiliza el módulo de presentaciones, sus archivos, chat y editor HTML.
No reconstruyas funcionalidades existentes ni cambies producción.

Ejecuta una sola tarea autorizada. Al terminar entrega:
archivos cambiados, diferencias, pruebas, resultados, riesgos y reversión.
Detente y espera aprobación antes de pasar a la siguiente tarea.
```

## 17. Laboratorio pequeño de pruebas rápidas

### 17.1 Función inicial

Crear una pantalla o función interna, accesible solo al equipo autorizado, que tome un copy/brief real y permita comparar **los tres modelos** con la misma configuración. No necesita rediseñar el producto completo.

Candidatos: `gpt-image-2`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`, inicialmente `medium`. Verificar disponibilidad, snapshots y parámetros en la cuenta. Si uno no está disponible, marcarlo como bloqueado; no sustituirlo ocultamente ni afirmar comparación de tres modelos.

### 17.2 Qué congelar

Prompt efectivo, versión de copy, referencias reales y su orden, imagen base/máscara, tamaño, formato, calidad nominal, fondo, datos calculados, número de imágenes y modo de API. No volver a pedir al agente que reescriba el prompt para cada modelo.

Primera pista: request actual, igual para los tres. Segunda pista: integración corregida de referencias, igual para los tres. Mantener separadas para no atribuir al modelo la mejora del backend. [F1, F2]

### 17.3 Prueba rápida propuesta

Cinco casos × tres modelos × una repetición = **15 renders** iniciales. Casos sugeridos: copy real con acentos; fotografía operativa; objeto 3D; edición de texto/objeto; imagen multiformato o transparente según la hipótesis de esa corrida.

Si procede, repetir cada combinación tres veces: **45 renders totales**, no 45 adicionales si se reutiliza la primera corrida con idéntico protocolo. No es evidencia suficiente para declarar un p95 estable o una tasa de errores muy baja.

El test de nuevas dimensiones debe usar la misma dimensión válida entre los tres modelos. Si una combinación no es compatible, registrar la incompatibilidad; no cambiar tamaño solo a uno.

### 17.4 Pantalla de resultados

Mostrar imágenes con modelo oculto durante revisión, y después revelar modelo, tiempo, calidad, costo, aceptación y defectos. Permitir guardar resultado y repetir el caso congelado. Una muestra bonita no habilita producción.

## 18. Plan de pruebas funcionales y de regresión

### 18.1 Casos críticos

| Caso | Prueba | Condición de aceptación |
|---|---|---|
| Flujo antiguo | Generar carrusel con experimento apagado. | Mismo camino funcional; no requiere nuevas tablas/configuraciones para seguir trabajando. |
| Selección | Editar slide 3 de 5. | Solo cambia la 3; versión padre correcta. |
| Cambio de selección | Cambiar a slide 4 mientras termina el trabajo de la 3. | El output se adjunta a la 3. |
| Feedback productivo | «Corrige Jamón» en panel lateral. | Ruta Image API edit; no sesión de imagen Responses. |
| Imagen ausente | Archivo base no disponible. | Se bloquea con explicación; no se simula edición desde una descripción. |
| Regeneración | Pulsar Regenerar. | Nueva propuesta; original conservado; acción registrada como distinta de edit. |
| Copy correcto/render incorrecto | Acento omitido en bitmap. | Se corrige el render; banco editorial intacto. |
| Cambio de copy | Usuario modifica el mensaje. | Nueva versión editorial autorizada; no edición silenciosa. |
| HTML editable | Corregir palabra en capa de texto. | Cambia la capa sin regenerar el visual. |
| Inmutables | Editar zona señalada. | Se verifica lo protegido; no prometer precisión absoluta solo por la máscara. |
| Sunburst | Pulsar rescate manual. | Conserva acción/base; registra costo; no eleva calidad ni regenera toda la serie sin permiso. |
| Conversación sin render | «¿Qué mejorarías?» en presentaciones. | Respuesta/propuesta sin imagen nueva salvo solicitud aprobada. |
| Cinco propuestas | Onboarding de marca. | Cinco candidatos independientes, selección múltiple y feedback por candidato. |
| Cambio de marca | Referencias de otra empresa. | Lectura y uso rechazados por backend. |
| Diseño primero | Activar nueva ruta en presentaciones. | HTML directo sigue disponible; la versión aprobada guía la composición. |
| Extraer tractor | Solicitar el mismo objeto. | Conserva origen y etiqueta extracción; no lo rediseña sin permiso. |
| Recrear tractor | Solicitar otra perspectiva. | Nuevo asset identificado como recreación. |
| Alfa | Insertar objeto sin fondo. | Transparencia real, sin rectángulo o damero dibujado. |
| Montaje | Escalar/reemplazar tractor en HTML. | No cambia texto ni otros elementos; sin generación para un simple movimiento. |
| Persistencia | Recargar sesión y lámina. | Mantiene versiones/selección/elementos; archivos resolubles. |
| Exportación | Texto largo, acentos y varios formatos. | No hay recortes, duplicados, glifos rotos ni imágenes ausentes. |
| Permiso maestro | Cliente o admin de cliente llama al endpoint directamente. | No obtiene permisos de Fai ni publica prompts. |
| Prompt aprobado | Aprobar imagen y luego feedback maestro. | Propuesta visible; no publicación automática. |
| Conflicto de versiones | Dos propuestas sobre un maestro antiguo. | Detecta conflicto; no sobrescribe silenciosamente la versión vigente. |
| Presupuesto | Agotar límite de sesión. | Detiene nuevos renders y muestra consumo/estado. |
| Trabajo incierto | Timeout de red después del envío. | No reintenta ilimitadamente ni reporta costo cero por asumir que falló. |
| Rollback | Apagar experimental. | Regresa el flujo previo sin perder activos o evidencias. |

### 18.2 Corpus ampliado

Mantener la cobertura del manual: operación, puertos/bodegas, 3D, infografía, dashboard, corredor internacional, acentos, cifras exactas, escenarios ilustrativos, sin texto, reserva de logo, transparencia, edición, máscara, carrusel completo, consistencia y secuencia de feedback. Añadir tractor/mundo → HTML, onboarding de cinco opciones y feedback administrativo del prompt.

La prueba ampliada se presupuesta por salidas reales. Un carrusel de cinco slides son cinco renders, no un render. Una sesión de tres ediciones son tres intentos de imagen, más los consumos de coordinación cuando corresponda.

### 18.3 Evaluación

Primero requisitos obligatorios: cifras/texto según manifiesto; cero claims inventados; cero logos/legal no solicitados; identidad de empresa; inmutables; dimensiones y alfa correctos. Luego valorar composición, marca, realismo, referencias, variedad y acabado.

Usar la rúbrica del manual anterior como base, sujeta a aprobación. No convertir un puntaje alto en permiso para omitir un requisito crítico. Registrar tanto aceptación del render bruto como aceptación de la pieza final.

## 19. Fases y dependencias para Kiro o Codex

Cada fila representa un alcance que se subdivide en tareas pequeñas; **no una autorización automática de ejecución**.

| Fase | Trabajo | Entregable para aprobar avance |
|---|---|---|
| 0. Inventario y aislamiento | Auditar repo, conservar cambios existentes, preparar rama y entorno de prueba. | Mapa de lo existente, archivos/rutas y evidencia de aislamiento. |
| 1. Laboratorio mínimo | Tres modelos, inputs congelados, registro de costo/tiempo/outputs. | Prueba rápida y reporte comparativo; sin cambiar default productivo. |
| 2. Formatos y contratos | Catálogo común, validación, transmisión de referencias reales y prompt efectivo. | Matriz de servicios actualizados y pruebas de dimensiones/contrato. |
| 3. Feedback productivo | Editar/regenerar separados, selector, comparación y rescate manual. | Casos de edición por slide aprobados, sin activar conversación Responses. |
| 4. Ampliación de presentaciones | Reutilizar chat/carga/HTML; habilitar diseño primero y selección precisa. | Camino nuevo opcional y regresión del camino actual. |
| 5. Elementos montados | Extraer/recrear, biblioteca, botón de montaje y reemplazo. | Casos tractor y mundo completos con exportación híbrida. |
| 6. Estudio de marca/estilo | Onboarding, cinco propuestas, favoritas y refinamiento. | Primera sesión completa y dirección visual guardada sin mezclar marcas. |
| 7. Feedback maestro administrativo | UI de Fai, diferencias, pruebas, publicación y reversión. | Permisos negativos/positivos y promoción de versión controlada. |
| 8. Robustez y piloto | Recuperación, cuotas, revisión humana, despliegue gradual y rollback. | Evidencia suficiente y aprobación de Fai/CTO para cada alcance. |

**Dependencia transversal:** si el entorno actual no puede completar y recuperar los trabajos largos, resolver esa necesidad antes de habilitar cinco propuestas o sesiones largas a clientes. No relegar fiabilidad a una fase futura solo porque aparezca al final de la tabla.

No pasar por calendario ni por una única imagen exitosa. La activación gradual debe depender de volumen, evidencia, costo y riesgo del flujo; porcentajes como 5%/20%/50% son una propuesta, no una obligación útil para cualquier tamaño de tráfico.

## 20. Trabajos largos, errores y continuidad

Registrar el trabajo antes del envío. Como mínimo, separar pendiente, ejecutando, resultado recibido, validando, necesita revisión, aprobado, rechazado, fallido, cancelado y resultado incierto. Adaptar a los estados existentes.

No asumir que cerrar la pestaña cancela el procesamiento del proveedor o evita el cobro. Al reabrir, consultar el trabajo existente. Un doble clic no debe crear dos publicaciones ni dos versiones aprobadas por accidente.

Si hacen falta cola y worker, introducirlos de forma acotada, con intentos limitados y recuperación. Empezar con concurrencia conservadora y aumentar solo tras medir. Cancelar trabajos pendientes es distinto de cancelar una llamada ya iniciada.

Streaming se trata como mejora de experiencia sujeta a prueba de compatibilidad; no es una solución garantizada al timeout ni un requisito para el primer laboratorio.

## 21. Costos y métricas explicados

### 21.1 Qué medir

Tiempo de proveedor y tiempo completo desde solicitud hasta resultado utilizable; intentos; errores; timeouts; aceptación; consumo y costo por versión; gasto por carrusel aprobado; gasto por sesión; reutilización de assets y costo de conversión/composición.

**p50:** el tiempo dentro del cual terminó la mitad de los casos medidos. **p95:** el tiempo dentro del cual terminó el 95%. No es el máximo. Reportar aparte fallos/timeouts: eliminarlos silenciosamente hace parecer más rápido al sistema.

### 21.2 Fórmula económica

```text
Costo por pieza aprobada =
  costo de todos los intentos y operaciones atribuibles
  / número de piezas únicas aprobadas
```

Separar costo API de costo operativo total si se incluye revisión humana e infraestructura. Si no hay aprobaciones, no reportar costo por aprobada igual a cero.

En conversación: contabilizar modelo principal, llamadas de imagen, lectura de archivos y otras herramientas que correspondan. Evitar doble conteo si el reporte ya incluye subtotales. Guardar la tarifa y fecha usadas; no estimar ahorro fijo sin medición.

### 21.3 Límites a fijar antes del piloto

Presupuesto del laboratorio; presupuesto por empresa/sesión; límite de renders por turno; costo de generar cinco propuestas; rescates Sunburst; plazo aceptable; reglas para interrupción. Los importes no están definidos por Fai en esta conversación: deben aprobarse, no inventarse.

## 22. Seguridad, permisos y alcance de datos

Una sesión, archivo, PDF, imagen, máscara, prompt o HTML pertenece a una empresa/proyecto autorizado. Validar antes de leer y antes de escribir. Los IDs del frontend no conceden acceso por sí solos.

Los PDFs y referencias se usan como material, no como instrucciones que puedan autorizar cambios de permisos, marcas o reglas de compliance. Las instrucciones embebidas en archivos no deben reemplazar las del sistema.

La documentación de OpenAI distingue uso para entrenamiento y retención; no afirmar «no se guarda nada» por utilizar API. Revisar configuración de organización, almacenamiento propio, archivos, conversaciones y borrado antes de abrir onboarding a clientes. [O13]

Guardar propuestas de prompt maestro y auditoría administrativa fuera del acceso normal de clientes. Cualquier capacidad global exige el permiso específico de Fai, no una simple bandera visual.

## 23. Criterios de detención y reversión

Detener el experimento ante mezcla de marcas, cambio no autorizado del prompt/copy, fuga de permisos, pérdida de versiones, costo fuera del límite o rotura del flujo previo.

Para fallos visuales aislados, conservar el output rechazado y decidir corrección local o revisión; no lanzar una cadena automática de modelos/calidades.

Reversión propuesta: bloquear nuevos trabajos experimentales → conservar/reconciliar los que están en curso → restaurar configuración estable → comprobar flujo anterior → documentar incidente. No borrar la evidencia ni promover resultados incompletos.

Un fallback debe estar disponible y probado; no asumir que un modelo permanecerá accesible indefinidamente. Si no hay ruta segura, pausar ese flujo sin perder imágenes aprobadas.

## 24. Checklist de entrega

### Antes del experimento

- [ ] Rama nueva desde base acordada y cambios previos conservados.
- [ ] Entorno/API/DB/Storage/despliegue aislados del flujo activo.
- [ ] Inventario de presentaciones y componentes existentes.
- [ ] Corpus real, prompt efectivo, referencias y cálculos congelados.
- [ ] Tres modelos verificados en la cuenta o bloqueo documentado.
- [ ] Presupuesto y condiciones de detención aprobados.
- [ ] Pista actual y pista de capacidades corregidas separadas.

### Antes del piloto funcional

- [ ] Selección inequívoca de asset y versión.
- [ ] Editar, regenerar y modificar HTML tienen acciones distintas.
- [ ] Feedback productivo no activa el estudio conversacional.
- [ ] Píxeles reales enviados y autorización de empresa probada.
- [ ] Prompts efectivos e historial registrados sin secretos en logs.
- [ ] Sunburst manual y presupuesto visible.
- [ ] Presentaciones reutiliza chat, carga y HTML existentes.
- [ ] Camino diseño primero opcional; HTML directo intacto.
- [ ] Botón «Añadir imágenes montadas» funcional.
- [ ] Extraer y recrear tractor/mundo diferenciados.
- [ ] Exportación revisada con acentos, textos largos, alfa y formatos.
- [ ] Feedback maestro exclusivo para Fai, con diferencias y versiones.

### Antes de producción

- [ ] Resultados de benchmark y pruebas funcionales revisados.
- [ ] Recuperación, duplicados, cancelación y resultados inciertos probados.
- [ ] Cuotas globales/por empresa y límite de rescate establecidos.
- [ ] Revisión de la pieza final, no solo del JSON o del visual base.
- [ ] Fuentes y tamaños de los destinos pendientes confirmados.
- [ ] Permisos y separación entre empresas probados con casos negativos.
- [ ] Reversión ensayada y ruta anterior disponible.
- [ ] Aprobación explícita de Fai/CTO para el alcance concreto del despliegue.

## 25. Responsabilidades y primer encargo al agente

**Fai:** dirección de producto/diseño, aprobación de resultados y autoridad sobre el prompt maestro.

**CTO:** revisión de integración, aislamiento, seguridad, operación, costos y despliegue.

**Kiro o Codex:** inspección, propuesta, implementación, pruebas y documentación de la tarea asignada. Son alternativas de ejecución, no puestos distintos. Pueden relevarse mediante commits e informe de estado; no trabajar a ciegas sobre los mismos cambios.

### Primer encargo listo para copiar

```text
Lee este plan completo, pero NO implementes todas las fases.

Primera tarea: inspección del repositorio y propuesta de aislamiento.
Identifica la rama actual y cambios pendientes. No borres ni reviertas trabajo.
Localiza el módulo existente de presentaciones, su chat, carga de archivos,
editor HTML, biblioteca, exportación y sistema de permisos.
Localiza también los flujos de copys/carruseles, generación, feedback,
prompts maestros y conexiones de Supabase/OpenAI.

Entrega un mapa de rutas/archivos reales y señala qué puede reutilizarse.
Propón la rama experimental y cómo impedir que las pruebas alteren
funciones, datos, almacenamiento o despliegues del sistema actual.

No reconstruyas funciones que ya existen.
No cambies producción, prompts publicados ni el modelo por defecto.
No hagas llamadas de pago sin presupuesto autorizado.
No asignes tareas diferentes según uses Kiro o Codex: ejecuta tú la tarea.

Después de presentar el inventario y la propuesta, DETENTE.
Espera autorización para crear el entorno/laboratorio o implementar cambios.
```

## 26. Prompts internos reutilizables para las nuevas funciones

Son instrucciones de aplicación, no payloads listos para producción. Los campos se sustituyen con datos reales y autorizados.

### 26.1 Generar diseño antes de construir HTML

```text
Crea una propuesta visual para la lámina seleccionada.
Usa el contenido aprobado y las referencias adjuntas con sus roles.
Esta imagen servirá como referencia de diseño para una versión HTML posterior.

Distingue una jerarquía clara de título, contenido y visual protagonista.
No inventes cifras, servicios, condiciones ni textos.
Respeta las reservas y el formato indicados.
No agregues elementos solo para llenar espacio.

La decisión sobre qué se convertirá a HTML y qué se conservará como imagen
se tomará después. No presentes el resultado como un archivo ya editable.
```

### 26.2 Preparar HTML desde una referencia aprobada

```text
Usa la imagen seleccionada como referencia de composición y estilo.
Usa el manifiesto editorial aprobado como fuente del texto y de las cifras.
No extraigas del bitmap una cifra que contradiga el manifiesto.

Antes de construir, identifica:
- texto/estructura que serán HTML editable;
- visuales que se conservarán como imágenes;
- elementos que necesitan extracción o recreación autorizada.

Reutiliza los componentes y el editor existentes.
Monta únicamente assets disponibles y autorizados.
No simules HTML editable pegando toda la lámina como una única imagen.
No alteres otras láminas ni publiques el resultado.
```

### 26.3 Recrear el tractor como elemento independiente

```text
La imagen 1 es el diseño aprobado y aporta perspectiva, materiales e iluminación.
Crea un tractor nuevo basado en el tractor seleccionado de esa referencia.
Debe encajar visualmente en esa composición.

Conserva los rasgos indicados por el usuario y aplica solo sus cambios.
Entrega únicamente el tractor, completo, con margen alrededor y sin texto.
No generes el resto de la lámina.
No inventes una marca ni logotipos.
Usa fondo transparente cuando esa sea la configuración de salida.

Este resultado es una recreación basada en referencia, no una extracción
idéntica del tractor original.
```

### 26.4 Proponer una mejora del prompt maestro

```text
Actúa como revisor de instrucciones de ScoryDesign.
Recibes un resultado aprobado, su historial relevante y feedback de Fai.
Tu tarea es PROPONER, no publicar, una mejora acotada del prompt indicado.

Distingue entre fallo de copy, prompt, transporte de referencias,
generación visual, composición y exportación.
No asumas que todo defecto se arregla modificando el prompt maestro.

Devuelve:
problema observado; causa como hipótesis; evidencia;
alcance; texto anterior y propuesto; riesgos; pruebas de regresión.

No cambies claims, cifras o reglas de otra marca.
No conviertas una preferencia de una pieza en regla global sin autorización.
No publiques ni sobrescribas ninguna versión.
```

## 27. Pendientes que se resuelven en la inspección, no mediante suposiciones

Ruta exacta del repositorio y rama base; componentes ya disponibles; API actual del chat de presentaciones; versiones de SDK; disponibilidad de modelos; tipos de archivos soportados; contrato actual del compositor; gestión de assets/URLs; límites reales; permiso administrativo de Fai; presupuesto; formatos/plataformas pendientes; infraestructura necesaria para trabajos largos.

Estos pendientes no impiden definir el producto. Sí impiden presentar un esquema de base de datos, endpoint o despliegue como si ya existiera o hubiera sido autorizado.

## 28. Fuentes y alcance de verificación

### Material del usuario y antecedentes

**F1.** Diagnóstico adjunto de ScoryDesign: proceso editorial, sistema visual, arquitectura declarada, limitaciones, corpus y reglas de evaluación. Archivo `Pasted text.txt` del encargo de integración.

**F2.** Guía de prompting adjunta y texto de Image generation proporcionados en la conversación.

**F3.** `ScoryDesign_Manual_Evaluacion_GPT_Image_2_5.md`, versión 1.0, conservado sin reemplazo. Antecedente técnico, no evidencia de implementación.

**F4.** Correcciones posteriores de Fai en esta conversación: separación de feedback/conversación, onboarding de cinco propuestas, presentaciones existentes, diseño antes de HTML, tractor/mundo, botón de imágenes montadas, Sunburst excepcional, feedback maestro administrativo y rama experimental. Base de las decisiones vigentes de producto.

### Documentación oficial contrastada

**O1. OpenAI — Image generation.** Generación, formatos, dimensiones y componentes de costo.  
`https://developers.openai.com/api/docs/guides/image-generation`

**O2. OpenAI — Image generation tool.** Herramienta en Responses, contexto, acción y prompt revisado.  
`https://developers.openai.com/api/docs/guides/tools-image-generation`

**O3. OpenAI — Create image edit.** Contrato de edición de imágenes.  
`https://developers.openai.com/api/reference/resources/images/methods/edit`

**O4. OpenAI — Image prompting.** Referencias, preservación y composición para identidad estricta.  
`https://developers.openai.com/api/docs/guides/image-prompting`

**O5. OpenAI — GPT Image 2.5 Flare.** Ficha de modelo.  
`https://developers.openai.com/api/docs/models/gpt-image-2.5-flare`

**O6. OpenAI — GPT Image 2.5 Sunburst.** Ficha de modelo.  
`https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst`

**O7. OpenAI — File inputs.** Archivos/PDF y lectura visual en modelos compatibles.  
`https://developers.openai.com/api/docs/guides/file-inputs`

**O8. OpenAI — Conversation state.** Contexto y facturación de tokens de la cadena.  
`https://developers.openai.com/api/docs/guides/conversation-state`

**O9. MDN — Image file type and format guide.** JPEG sin alfa; PNG/WebP para transparencia.  
`https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types`

**O10. LinkedIn — Single Image Ads specifications.** Tamaños recomendados para anuncios; no extrapolar automáticamente a todos los formatos orgánicos.  
`https://business.linkedin.com/de/de/advertise/ads/ads-guide/single-image-ads`

**O11. LinkedIn Help — Image specifications for your LinkedIn Pages and Career Pages.** Portada de página; distinta de la portada personal.  
`https://www.linkedin.com/help/linkedin/answer/a563309/image-specifications-for-your-linkedin-pages-and-career-pages`

**O12. Supabase — Branching.** Entornos aislados; disponibilidad e integración concretas pendientes de comprobar.  
`https://supabase.com/docs/guides/deployment/branching`

**O13. OpenAI — Data controls.** Retención y uso de datos.  
`https://developers.openai.com/api/docs/guides/your-data`

**Límite de esta verificación:** la documentación pública respalda capacidades, no el acceso de la cuenta, compatibilidad del SDK instalado, rendimiento o costo por pieza de ScoryDesign. La especificación oficial de portada personal de LinkedIn y la validación por placement de TikTok/Instagram quedan pendientes; el plan no las presenta como resueltas. No se realizaron pruebas de API ni cambios en el producto.

---

**Resultado buscado:** producción de piezas con edición puntual controlada; diseño conversacional donde aporta al proceso creativo; presentaciones híbridas que reutilizan imágenes como elementos; aprendizaje del prompt bajo control de Fai; todo construido y probado fuera del flujo actual hasta recibir autorización.
