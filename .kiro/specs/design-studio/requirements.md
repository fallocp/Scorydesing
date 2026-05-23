# Requirements Document

## Introduction

El Design Studio es una herramienta dedicada dentro de SCORY Design que permite a los usuarios crear nuevos templates de diseño usando IA. Accesible desde la sección "Herramientas" de la página principal (`/design-studio`), reemplaza la funcionalidad "IA Creativo" que fue removida del flujo diario. El flujo diario ahora solo usa templates estáticos — el Design Studio es donde nacen nuevos templates. Soporta dos modos de entrada: selección visual desde la paleta de marca, y generación desde imagen de referencia. El resultado final es un template HTML reutilizable con placeholders que se integra al selector de templates del flujo diario.

## Glossary

- **Design_Studio**: Página dedicada (`/design-studio`) donde los usuarios crean nuevos templates de diseño usando generación por IA.
- **Brand_Palette**: Conjunto de colores, tipografías, logo y disclaimer almacenados en la base de datos para cada business_tenant.
- **Visual_Selector**: Componente de UI con opciones clickeables (pills/buttons) para configurar parámetros de generación sin texto libre.
- **Mockup**: Imagen generada por GPT Image que sirve como referencia visual antes de la conversión a HTML.
- **Template_Converter**: Proceso que transforma HTML finalizado en un template reutilizable con placeholders (`{{headline}}`, `{{subcopy}}`, etc.).
- **Reference_Image**: Imagen de inspiración subida por el usuario (screenshot, diseño de competidor, PDF) usada como base para generación.
- **Platform_Format**: Dimensiones y proporciones específicas de cada plataforma destino (IG Story, IG Post, Facebook, LinkedIn, Banner).
- **Design_Session**: Instancia de trabajo en el Design Studio que persiste el estado de generación, selección e iteración.
- **HTML_Preview**: Renderizado visual del HTML generado que el usuario puede revisar antes de guardar.
- **Iteration_Feedback**: Instrucciones textuales del usuario para refinar el HTML generado (ej: "Más oscuro", "CTA más grande").

## Requirements

### Requirement 1: Acceso y Navegación

**User Story:** Como usuario de SCORY Design, quiero acceder al Design Studio desde la sección Herramientas de la página principal, para crear nuevos templates sin interrumpir el flujo diario.

#### Acceptance Criteria

1. THE Design_Studio SHALL estar accesible como una card en la sección "Herramientas" de la página principal con ruta `/design-studio`
2. WHEN el usuario hace click en la card del Design Studio, THE Sistema SHALL navegar a la página `/design-studio`
3. WHEN el usuario no tiene un business_tenant configurado, THE Design_Studio SHALL mostrar un mensaje indicando que se requiere configuración de marca antes de usar la herramienta

---

### Requirement 2: Carga Automática de Paleta de Marca

**User Story:** Como usuario, quiero que mi paleta de marca se cargue automáticamente al entrar al Design Studio, para no tener que ingresar colores y fuentes manualmente.

#### Acceptance Criteria

1. WHEN el usuario accede al Design Studio, THE Design_Studio SHALL cargar la Brand_Palette completa (colores primario, secundario, acento, tipografías display/body/mono, logo_url, disclaimer) desde la base de datos para el business_tenant activo
2. WHEN la Brand_Palette se carga exitosamente, THE Design_Studio SHALL mostrar una vista previa compacta de los colores y tipografías cargados
3. IF la Brand_Palette no tiene los campos mínimos requeridos (primary_color, logo_url), THEN THE Design_Studio SHALL informar al usuario los campos faltantes y ofrecer enlace a la configuración de marca

---

### Requirement 3: Modo A — Selección Visual desde Paleta

**User Story:** Como usuario, quiero configurar mi diseño seleccionando opciones visuales mediante pills/buttons clickeables, para generar templates sin necesidad de escribir prompts complejos.

#### Acceptance Criteria

1. THE Visual_Selector SHALL presentar las siguientes categorías con opciones clickeables tipo pill/button: Fondo (Oscuro/Navy, Claro/Cream, Color/Turquesa, Otro), Estilo visual (Minimalista, Glassmorphism, Bold/Tipográfico, Financiero, Gradientes, Foto hero, Otro), Tipo de contenido (Dato/Estadística, Noticia, Educativo, Promoción, Comparativa, Evento, Testimonial, Otro), Elemento destacado (Número grande, Foto principal, Ícono/Ilustración, Badge flotante, Sin imagen, Otro), Plataforma base (IG Story, IG Post, Facebook, LinkedIn, Banner)
2. WHEN el usuario selecciona una opción en una categoría, THE Visual_Selector SHALL resaltar visualmente la opción seleccionada y deseleccionar la anterior en esa categoría
3. WHEN el usuario selecciona la opción "Otro" en cualquier categoría, THE Visual_Selector SHALL mostrar un campo de texto inline para que el usuario ingrese un valor personalizado
4. THE Visual_Selector SHALL requerir al menos una selección en Plataforma base antes de habilitar el botón de generación
5. WHEN el usuario completa sus selecciones, THE Design_Studio SHALL construir internamente el prompt de generación combinando las selecciones del usuario con los datos de la Brand_Palette

---

### Requirement 4: Modo B — Generación desde Imagen de Referencia

**User Story:** Como usuario, quiero subir una imagen de inspiración y obtener variaciones adaptadas a mi marca, para crear templates basados en diseños que me gustan.

#### Acceptance Criteria

1. THE Design_Studio SHALL permitir al usuario subir una imagen de referencia en formatos PNG, JPG, WEBP o PDF (máximo 10MB)
2. WHEN el usuario sube una Reference_Image, THE Design_Studio SHALL mostrar una vista previa de la imagen subida
3. THE Design_Studio SHALL ofrecer un campo de texto opcional donde el usuario describe adaptaciones deseadas (ej: "Quiero algo así pero con mi branding")
4. WHEN el usuario confirma la generación con imagen de referencia, THE Design_Studio SHALL enviar la imagen junto con la Brand_Palette del usuario como contexto para la generación
5. IF el archivo subido excede 10MB o no es un formato soportado, THEN THE Design_Studio SHALL mostrar un mensaje de error descriptivo sin iniciar la generación

---

### Requirement 5: Generación de Mockups con GPT Image

**User Story:** Como usuario, quiero recibir 3 opciones visuales generadas por IA para elegir la que más me gusta, para tener variedad antes de comprometer un diseño.

#### Acceptance Criteria

1. WHEN el usuario hace click en "Generar 3 opciones", THE Design_Studio SHALL invocar GPT Image para generar exactamente 3 mockups visuales distintos
2. WHEN la generación está en progreso, THE Design_Studio SHALL mostrar un indicador de carga con estado descriptivo
3. WHEN los 3 mockups se generan exitosamente, THE Design_Studio SHALL mostrar las 3 opciones lado a lado para comparación
4. WHEN el usuario selecciona un mockup, THE Design_Studio SHALL resaltar visualmente la opción seleccionada y habilitar el botón "Convertir a HTML"
5. IF la generación de mockups falla, THEN THE Design_Studio SHALL mostrar un mensaje de error y ofrecer la opción de reintentar
6. THE Design_Studio SHALL incluir la Brand_Palette (colores, tipografías, logo) como parte del prompt de generación para que los mockups reflejen la identidad de marca

---

### Requirement 6: Conversión de Mockup a HTML

**User Story:** Como usuario, quiero convertir el mockup seleccionado en HTML funcional que respete mi branding, para obtener un template editable y reutilizable.

#### Acceptance Criteria

1. WHEN el usuario hace click en "Convertir a HTML", THE Design_Studio SHALL invocar la Edge Function generate-design-html enviando el mockup seleccionado como referencia visual junto con las reglas de marca
2. WHEN la conversión está en progreso, THE Design_Studio SHALL mostrar un indicador de carga
3. WHEN el HTML se genera exitosamente, THE Design_Studio SHALL renderizar una vista previa del HTML con las dimensiones correctas de la Platform_Format seleccionada
4. THE Design_Studio SHALL generar HTML que utilice las tipografías, colores y logo de la Brand_Palette del usuario
5. IF la conversión a HTML falla, THEN THE Design_Studio SHALL mostrar un mensaje de error y permitir reintentar o seleccionar otro mockup

---

### Requirement 7: Iteración y Refinamiento del HTML

**User Story:** Como usuario, quiero poder refinar el HTML generado con instrucciones en lenguaje natural, para ajustar detalles sin conocimientos técnicos.

#### Acceptance Criteria

1. WHEN el HTML preview está visible, THE Design_Studio SHALL mostrar un campo de texto para Iteration_Feedback
2. WHEN el usuario envía feedback de iteración (ej: "Más oscuro", "CTA más grande", "Mover logo arriba"), THE Design_Studio SHALL invocar generate-design-html con el HTML actual y el feedback como contexto
3. WHEN la iteración se completa, THE Design_Studio SHALL actualizar el HTML_Preview con la versión refinada
4. THE Design_Studio SHALL mantener un historial de iteraciones visible para que el usuario pueda comparar versiones
5. THE Design_Studio SHALL limitar las iteraciones a un máximo de 10 por Design_Session para controlar costos de API

---

### Requirement 8: Guardar como Template Reutilizable

**User Story:** Como usuario, quiero guardar mi diseño finalizado como un template reutilizable con placeholders, para poder usarlo en el flujo diario con diferente contenido.

#### Acceptance Criteria

1. WHEN el usuario hace click en "Guardar como template", THE Template_Converter SHALL transformar el HTML finalizado en un template con placeholders estándar (`{{headline}}`, `{{subcopy}}`, `{{cta}}`, `{{imageUrl}}`, `{{disclaimer}}`)
2. THE Template_Converter SHALL solicitar al usuario un nombre descriptivo para el template antes de guardar
3. WHEN el template se guarda, THE Sistema SHALL persistir el HTML con placeholders en la base de datos asociado al business_id del usuario
4. WHEN el template se guarda, THE Sistema SHALL generar una imagen de preview (thumbnail) del template para mostrar en el selector
5. IF el usuario no proporciona un nombre para el template, THEN THE Design_Studio SHALL impedir el guardado y solicitar un nombre

---

### Requirement 9: Integración con Selector de Templates del Flujo Diario

**User Story:** Como usuario, quiero que mis templates guardados aparezcan junto a los templates estáticos en el flujo diario, para poder usarlos en la generación de contenido.

#### Acceptance Criteria

1. WHEN un template se guarda exitosamente en el Design Studio, THE Sistema SHALL hacerlo disponible en el selector de templates del flujo diario
2. THE Sistema SHALL mostrar los templates personalizados del usuario junto con los templates estáticos (Card Light, Card Dark, Breaking News, etc.) diferenciándolos visualmente
3. WHEN el flujo diario selecciona un template personalizado, THE Template_Engine SHALL hydratarlo con los mismos placeholders que los templates estáticos
4. THE Sistema SHALL mostrar únicamente los templates personalizados del business_tenant activo (aislamiento multi-tenant)

---

### Requirement 10: Soporte Multi-Plataforma

**User Story:** Como usuario, quiero generar templates para todas las plataformas soportadas, para tener diseños optimizados para cada canal.

#### Acceptance Criteria

1. THE Design_Studio SHALL soportar generación para las siguientes plataformas con sus dimensiones: IG Story (1080×1920), IG Post (1080×1080), Facebook Post (1200×628), LinkedIn Post (1200×628), Banner (1920×1080)
2. WHEN el usuario selecciona una plataforma, THE Design_Studio SHALL aplicar las dimensiones correspondientes en la generación de mockups y en el HTML_Preview
3. WHEN se guarda un template, THE Sistema SHALL registrar la plataforma destino como metadato del template
4. THE Design_Studio SHALL permitir al usuario generar variantes del mismo diseño para múltiples plataformas en una misma Design_Session

---

### Requirement 11: Aislamiento Multi-Tenant

**User Story:** Como operador de la agencia, quiero que cada negocio solo pueda ver y usar sus propios templates personalizados, para mantener la separación de datos entre clientes.

#### Acceptance Criteria

1. WHEN un usuario guarda un template, THE Sistema SHALL asociar el template al business_id del usuario autenticado
2. WHEN un usuario consulta templates personalizados, THE Sistema SHALL retornar únicamente templates cuyo business_id coincida con el business_tenant activo del usuario
3. THE Sistema SHALL aplicar políticas RLS en la tabla de templates personalizados para garantizar aislamiento a nivel de base de datos
4. WHEN un usuario intenta acceder a un template de otro business, THE Sistema SHALL rechazar la solicitud sin revelar la existencia del recurso

---

### Requirement 12: Persistencia de Design Sessions

**User Story:** Como usuario, quiero que mi progreso en el Design Studio se preserve si navego a otra página, para no perder trabajo en progreso.

#### Acceptance Criteria

1. WHEN el usuario genera mockups o HTML en una Design_Session, THE Design_Studio SHALL persistir el estado de la sesión (selecciones, mockups generados, HTML actual, iteraciones)
2. WHEN el usuario regresa al Design Studio con una sesión activa, THE Design_Studio SHALL restaurar el estado de la sesión y permitir continuar desde donde se quedó
3. WHEN el usuario guarda un template exitosamente, THE Design_Studio SHALL marcar la Design_Session como completada
4. THE Design_Studio SHALL permitir al usuario descartar una sesión activa y comenzar una nueva

---

### Requirement 13: Manejo de Errores y Estados de Carga

**User Story:** Como usuario, quiero recibir feedback claro sobre el estado de las operaciones y errores comprensibles cuando algo falla, para entender qué está pasando en todo momento.

#### Acceptance Criteria

1. WHEN una operación de generación está en progreso (mockups o HTML), THE Design_Studio SHALL deshabilitar los controles de entrada y mostrar un indicador de progreso con mensaje descriptivo
2. IF una llamada a la API falla por timeout, THEN THE Design_Studio SHALL mostrar un mensaje indicando que la operación tardó demasiado y ofrecer reintentar
3. IF una llamada a la API falla por content policy violation, THEN THE Design_Studio SHALL informar al usuario que el contenido solicitado no pudo generarse y sugerir modificar las selecciones
4. WHEN una operación se completa exitosamente, THE Design_Studio SHALL mostrar una confirmación visual transitoria (toast)
5. IF la conexión a internet se pierde durante una generación, THEN THE Design_Studio SHALL detectar el error de red y mostrar un mensaje apropiado

