# Diseño maestro · ScoryDesign / Design

## Prompt de implementación visual

Construye una interfaz profesional de estudio creativo para agencias y equipos de marketing, sobre el producto actual. Reproduce la dirección elegida de las imágenes adjuntas: base clara, cobalto limpio, blanco mineral, tinta azul oscura, iconos de app refinados y profundidad discreta. No diseñes un dashboard corporativo genérico ni una landing de venta de cables.

La interfaz debe sentirse precisa, ligera y táctil. Conserva la jerarquía y las funciones existentes. El contenido creativo es el protagonista; los controles lo acompañan. La referencia visual manda sobre decisiones estéticas no definidas; la lógica del producto no se deduce de una imagen generada.

## Colores propuestos para código

Estos valores son una traducción técnica inicial del estilo elegido, no una extracción exacta de la imagen ni una nueva identidad de Xending.

| Token | Valor | Uso |
|---|---|---|
| Fondo | `#F1F6FD` | Superficie base mineral. |
| Superficie | `#FFFFFF` | Tarjetas, paneles y campos. |
| Tinta | `#101B3B` | Títulos y texto principal. |
| Secundario | `#60718C` | Explicaciones y metadatos. |
| Cobalto | `#0866FF` | Acciones y selección. |
| Cobalto profundo | `#004DD8` | Contraste y estados de interacción. |
| Cobalto tenue | `#E9F2FF` | Selección suave y etiquetas. |
| Línea | `#DAE5F5` | Bordes discretos. |
| Violeta de módulo | `#7955F8` | Solo icono de Carrusel. |
| Verde de módulo | `#18AF8E` | Solo icono de Presentación. |
| Naranja de módulo | `#FF8A3C` | Solo icono de Diseño libre. |

El tema general no es violeta. La distribución aprobada de acentos por icono no autoriza colorear todos los paneles. La paleta de un cliente se obtiene de su identidad real; no de estos tokens.

## Tipografía

Pila de sistema: `-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`.

No distribuir fuentes de Apple. En Windows se verá con la fuente disponible del sistema. La selección definitiva de tipografía web debe resolverse con los recursos autorizados del proyecto.

Jerarquía inicial: hero 48–60 px en escritorio; título de pantalla 28–36 px; título de sección 18–24 px; contenido de interfaz 12–14 px en la referencia. Antes de publicar, revisar tamaño de lectura en el entorno real: no reducir texto para forzar que todo quepa en una captura.

Títulos semibold/bold con tracking ligeramente cerrado, no todos extrabold. Microetiquetas espaciadas solo como acento editorial.

## Formas, profundidad y material

Tarjetas 16–22 px de radio. Panel principal/navegación 22–28 px. Botones 10–12 px. Cápsulas para estados pequeños, no para cada control.

Sombras suaves, amplias y poco opacas. Brillo contenido en iconos y botón principal; nada de neón. Translucidez ligera en la cabecera y barra de entrada; los campos con texto y el contenido principal deben conservar fondo legible.

No usar neumorfismo con contraste bajo, reflejos metálicos intensos ni fondos animados permanentes. Se prefieren superficies mayormente planas con niveles de profundidad claros.

## Iconografía

Dos niveles distintos:

**Navegación:** símbolos propios y legibles a 20–22 px, dentro de contenedores suaves de aproximadamente 30–34 px. No repetir el mismo dibujo para Biblioteca y Proyectos. Biblioteca puede usar un archivo/carpeta de piezas; Proyectos, un portafolio; Marca, un sistema modular; Plantillas, una cuadrícula.

**Accesos a crear:** iconos tipo app de 44–52 px, contorno suavizado, leve realce superior y degradado corto. El símbolo interior mantiene una silueta clara. Los fondos de cada módulo usan el acento de color aprobado.

No utilizar emojis como iconos. No llamar a una biblioteca lineal genérica “iconos de iPhone” solo por añadirle una sombra. Los SVG incluidos son una primera propuesta original y deben revisarse junto al diseño, no suponerse aprobados automáticamente a nivel de píxel.

## Acomodo de Inicio

Marco de navegación lateral claro de aproximadamente 210–230 px en escritorio. Cabecera compacta con negocio activo, búsqueda y cuenta. Área central amplia, sin panel conversacional vacío permanente en Inicio.

Hero: intención creativa a la izquierda, recurso visual del ejemplo a la derecha. El campo para iniciar trabaja sobre texto real, no una imagen. Mantener acceso a adjuntar referencias. No obligar a completar un formulario largo para empezar.

Debajo, cuatro entradas: Imagen, Carrusel, Presentación y Diseño libre. Luego, continuar trabajo reciente. News y FX como accesos secundarios, conservando módulos distintos.

Los proyectos no llevan estados inventados para decorar. Si no hay datos, mostrar un vacío real con una acción útil, no ejemplos ocultos como si fueran producción.

## Acomodo de pantallas de trabajo

Un marco global estable. Dentro, panel contextual cuando haga falta y zona central de decisiones/lienzo. No añadir una tercera barra lateral genérica porque aparece espacio libre.

En edición, compactar el marco global si el diseño y la implementación lo permiten. Las miniaturas de diapositivas no sustituyen al selector de negocio ni a las rutas de salida. Mantener el alcance del cambio visible: pieza, variante, diapositiva o presentación.

El chat contextual no debería desaparecer de toda una sección solo para copiar una lámina de marketing. En pantallas pequeñas, conservar acceso a Chat/Diseño conforme a la propuesta del PDF. El demo actual simplifica ese panel en móvil y no debe tomarse como implementación final de la vista 21.

## Adaptación

Escritorio amplio: navegación completa, proyecto/lienzo protagonista.

Escritorio compacto: disminuir márgenes y reorganizar tarjetas, no reducir drásticamente todo el texto.

Móvil: navegación plegable, columnas apiladas y acciones alcanzables. Las tarjetas de formato conservan las proporciones de sus vistas previas. No recortar controles fuera de pantalla.

## No copiar de las maquetas

No copiar encabezados externos de lámina, flechas explicativas, círculos numerados ni “Evaluación del diseño”. No usar fechas 2024/2025 de ejemplo como datos reales. No aceptar dimensiones mal dibujadas. No tratar logos generados como logos aprobados.

La aprobación de una dirección visual no aprueba cambios de arquitectura, reglas financieras, API, modelos, permisos ni funcionalidad nueva.

## Criterios de revisión visual

Comparar la captura del producto con la referencia elegida usando el mismo tamaño de viewport. Revisar proporciones del marco, espaciado, orden, iconos, contraste y densidad. No calificar una implementación como fiel solo porque coincide el azul.

Revisar contenido largo, estados vacíos, carga, error, accesibilidad por teclado y versión móvil. Una interfaz bonita con datos de muestra no prueba integración funcional.
