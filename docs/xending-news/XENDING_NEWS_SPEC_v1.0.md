# Xending News — Sistema Editorial Visual para Kiro
## Especificación maestra v1.0

> Documento operativo para implementar el módulo **Xending News** sobre la infraestructura existente de Xending Design / Design Studio.
>
> Xending News comparte origen de contenido con **Morning Brief**. Morning Brief puede seguir siendo el motor que recopila, resume, prioriza y estructura noticias; Xending News toma ese contenido y lo transforma en un carrusel/editorial visual de 5 a 8 piezas.
>
> **Entradas admitidas:** Markdown, JSON o copy/paste de texto estructurado o semiestructurado.

---

# 1. Objetivo

Construir un sistema capaz de transformar noticias financieras, macroeconómicas, comerciales, geopolíticas o empresariales en un set visual editorial premium de **Xending News**, manteniendo consistencia de marca sin depender de templates cerrados por tema.

```text
Morning Brief / MD / JSON / Copy-Paste
        ↓
Normalización de contenido
        ↓
Selección / orden editorial
        ↓
Slide Plan
        ↓
Visual Resolver
        ↓
Visual Director
        ↓
Prompt Builder
        ↓
Generación de imagen
        ↓
Xending Design Composer
        ↓
Carrusel / PDF / set editorial
```

---

# 2. Relación con Morning Brief

## 2.1 Morning Brief y Xending News comparten contenido

Morning Brief puede producir:

- PDF;
- Markdown;
- JSON;
- resumen diario;
- listado de notas;
- ranking de importancia;
- comentarios ejecutivos;
- fuentes;
- links;
- imágenes de referencia;
- datos clave.

Xending News **no necesita volver a investigar o reescribir toda la historia** si el Morning Brief ya trae una salida suficientemente estructurada.

La responsabilidad de Xending News es:

```text
contenido ya seleccionado
→ entender cada nota
→ decidir cómo visualizarla
→ construir la escena
→ generar prompts
→ producir las imágenes
→ componer el carrusel
```

**Morning Brief responde “qué pasó y qué importa”.**

**Xending News responde “cómo lo convertimos en una pieza editorial visual Xending”.**

---

# 3. Formatos de entrada admitidos

El sistema NO debe depender de un formato único.

Debe aceptar:

1. Markdown
2. JSON
3. Copy/paste de texto
4. Salida estructurada de Morning Brief
5. En el futuro, PDF ya procesado por el pipeline de extracción

---

# 4. Entrada Markdown

Ejemplo:

```md
# Carrusel Xending News · viernes, 21 de agosto de 2026

**Formato:** Instagram Post 1080x1080
**Notas usadas:** 6

## Slide 1

**Dato:** `$16.9083`

**Headline:** El dólar pierde piso y el rebote sigue en juego

**Subcopy:** El USD/MXN cae a $16.9083...

**Fuente:** Investing.com México

**Plantilla:** `market-update`

## Comentario final

El peso recibe soporte por dos frentes...
```

Kiro debe parsear esta estructura sin exigir cambios manuales.

---

# 5. Entrada JSON

```json
{
  "date": "2026-08-21",
  "title": "Xending News",
  "slides": [
    {
      "slide": 1,
      "data": "$16.9083",
      "headline": "El dólar pierde piso y el rebote sigue en juego",
      "subcopy": "El USD/MXN cae a $16.9083...",
      "source": ["Investing.com México"],
      "editorial_type": "market-update"
    }
  ],
  "executive_commentary": "El peso recibe soporte por dos frentes..."
}
```

---

# 6. Entrada Copy/Paste

Kiro también debe soportar contenido pegado directamente, aunque no venga perfectamente estructurado.

```text
USD/MXN cae a 16.9083.
La tendencia sigue bajista pero RSI marca sobreventa.
Fuente: Investing.com México.

Tesoro de EE.UU. amplía recompras a 4 mil millones.
La medida presiona al dólar.
Fuente: El Financiero.
```

Cuando el input sea semiestructurado:

1. identificar noticias;
2. separar headline / dato / explicación / fuente;
3. crear internamente el mismo esquema normalizado;
4. no pedir reformateo si el contenido es interpretable.

---

# 7. Esquema normalizado interno

Todo input debe convertirse a una estructura común.

```json
{
  "date": "",
  "edition": "daily",
  "slides": [
    {
      "slide_number": 1,
      "headline": "",
      "subcopy": "",
      "key_data": "",
      "secondary_data": "",
      "source": [],
      "source_urls": [],
      "editorial_type": "",
      "reference_images": [],
      "notes": ""
    }
  ],
  "executive_commentary": ""
}
```

Este esquema es el puente entre Morning Brief y Xending News.

---

# 8. Qué NO debe hacer Xending News

Xending News no debe:

- inventar una historia comercial;
- convertir cada nota en problema-solución-CTA;
- rehacer innecesariamente el guion;
- forzar seedCopy a una estructura narrativa;
- convertir todas las noticias en el mismo layout;
- inventar datos;
- inventar fuentes;
- modificar cifras aprobadas;
- generar logos dentro de las imágenes;
- depender de cuatro temas predeterminados.

El contenido de la nota **ya es el guion editorial**.

---

# 9. Arquitectura del módulo

```text
INPUT ADAPTER
    ↓
CONTENT NORMALIZER
    ↓
EDITORIAL SELECTOR
    ↓
SLIDE PLANNER
    ↓
VISUAL RESOLVER
    ↓
VISUAL DIRECTOR
    ↓
PROMPT BUILDER
    ↓
IMAGE GENERATOR
    ↓
DESIGN COMPOSER
    ↓
EXPORT
```

---

# 10. Input Adapter

Responsabilidad:

- detectar MD;
- detectar JSON;
- detectar copy/paste;
- recibir salida de Morning Brief;
- entregar un objeto normalizado.

No debe contener lógica visual.

---

# 11. Content Normalizer

Debe extraer:

- fecha;
- headline;
- subcopy;
- dato principal;
- datos secundarios;
- fuente;
- URLs;
- categoría editorial;
- comentario final;
- referencias visuales;
- advertencias.

---

# 12. Editorial Selector

Cuando el input ya trae slides seleccionados, debe respetarlos.

Cuando el input trae más noticias de las que caben:

- ordenar por importancia;
- evitar redundancias;
- favorecer temas que cambien decisiones;
- combinar macro + mercado + comercio cuando tenga sentido;
- conservar diversidad editorial.

Default recomendado:

```text
6 noticias + 1 Executive View = 7 slides
```

Rango permitido:

```text
5–8 slides
```

---

# 13. Slide Planner

Cada noticia debe convertirse en un contrato editorial.

```json
{
  "slide_number": 2,
  "headline": "Mercado de bonos y tasas bajo presión",
  "subcopy": "El rendimiento del Tesoro...",
  "key_data": "4.36%",
  "secondary_data": "-0.04 pp",
  "source": ["U.S. Department of the Treasury"],
  "editorial_type": "market_update"
}
```

El Slide Planner no decide todavía la escena final.

---

# 14. Visual Resolver

Es el núcleo del sistema.

No pregunta “¿qué template de tema toca?”.

Pregunta:

- ¿Qué está ocurriendo?
- ¿Qué entidad u objeto es protagonista?
- ¿Qué contexto real explica mejor la noticia?
- ¿Importa la geografía?
- ¿Importa un dato?
- ¿Importa una institución?
- ¿Importa una industria?
- ¿Qué motor visual representa mejor la noticia?

---

# 15. Dimensiones que debe inferir

```yaml
domain:
mechanism:
entities:
geography:
economic_object:
physical_context:
visual_priority:
visual_engine:
layout_family:
text_safe_area:
```

---

# 16. Domains

Valores iniciales:

```text
fx
rates
bonds
fiscal
macro
trade
tariffs
energy
commodities
equities
companies
geopolitics
industry
central_bank
forecast
employment
inflation
logistics
technology
semiconductors
banking
regulation
supply_chain
```

La lista es extensible y no debe tratarse como whitelist rígida.

---

# 17. Mechanisms

```text
rises
falls
expands
contracts
tightens
cuts
holds
negotiates
restricts
supports
pressures
revises
projects
surprises
accelerates
slows
recovers
breaks_level
adds_risk
reduces_risk
```

---

# 18. Editorial types

```text
market_update
breaking_news
stat_of_the_day
executive_commentary
special_report
weekly_recap
macro_event
company_news
```

---

# 19. Motores visuales

## 19.1 Editorial Photography

Para instituciones, edificios, infraestructura, empresas, puertos, fábricas, oficinas, investigación y escenas reales.

## 19.2 Photo + Data

Para FX, tasas, inflación, empleo, encuestas, forecast, bonos y datos macro.

## 19.3 Hybrid Editorial Objects

Objetos editoriales híbridos 3D-realistas.

> Premium editorial 3D objects with realistic materials and icon-like clarity.

Deben sentirse entre objeto físico premium e iconografía refinada.

Nunca cartoon, app icon, toy o dark fintech pedestal.

## 19.4 Maps & Flows

Para comercio, aranceles, T-MEC, geopolítica, rutas, supply chain, sanciones y flujos regionales.

## 19.5 Industrial Macro

Para acero, aluminio, petróleo, autos, semiconductores, maquinaria, manufactura, commodities y logística.

## 19.6 Data Environment

Para temas donde la información es protagonista y no existe un objeto físico obvio.

---

# 20. Motor de fallback

Si no existe arquetipo claro:

```text
REAL CONTEXT + DATA + XENDING EDITORIAL COMPOSITION
```

Nunca resolver la incertidumbre con un icono genérico.

Fallback preferido:

```text
Institutional / real context + data
```

---

# 21. ADN visual Xending News

```text
WHITE SPACE
+
PREMIUM EDITORIAL
+
REAL CONTEXT
+
HYBRID OBJECTS
+
DATA
+
SUBTLE XENDING ACCENT
```

---

# 22. Diferencia frente a Xending Commercial

Commercial:

```text
impacto + marca + producto + conversión
```

News:

```text
información + contexto + autoridad + interpretación
```

---

# 23. Paleta

Dominante:

- white;
- off-white;
- light gray;
- soft steel;
- dark navy typography.

Acentos:

- turquoise controlado;
- coral únicamente cuando sea semántico.

Proporción:

```text
80–90% neutral
3–8% brand accent
resto contextual
```

---

# 24. Turquesa y coral

Turquesa para líneas, rutas, nodos, categorías, gráficas, palabra puntual y microdetalles.

Coral solo para riesgo, presión, caída, fricción, arancel, alerta o evento relevante.

---

# 25. Tipografía

Mantener ADN Xending.

Preferencia:

```text
Poppins
```

Jerarquía:

```text
headline: Poppins Bold / ExtraBold
subcopy: Poppins Regular / Medium
metadata: Poppins Medium
```

El dato puede usar Poppins o una serif editorial únicamente si el sistema final lo valida.

---

# 26. Fotografía

Debe sentirse editorial, contemporánea, institucional, real y premium.

Evitar stock genérico, AI evidente, banco tradicional, influencer y corporativo cliché.

---

# 27. Realismo

Cuando se utilicen edificios, instituciones o infraestructura, priorizar realismo fotográfico o semi-fotográfico.

Evitar:

- columnas simplificadas;
- fachadas tipo maqueta;
- edificios de juguete;
- arquitectura 3D caricaturesca.

Ejemplo validado: Tesoro / bonos → arquitectura creíble, texturas de piedra reales, profundidad fotográfica y luz natural.

---

# 28. Hybrid Editorial Objects

Prompt base:

```text
Small premium hybrid editorial object, halfway between a realistic product render and a refined 3D icon. White and light-silver dominant materials, translucent glass details, subtle metallic finishes, restrained turquoise accent, soft studio lighting, realistic contact shadows, precise proportions, no cartoon styling, no generic app-icon appearance, no dark navy pedestal.
```

Características:

- ligeros;
- claros;
- realistas sin ser fotografía pura;
- alto nivel de detalle;
- materiales creíbles;
- lectura inmediata;
- geometría limpia;
- no demasiado metálicos;
- no navy dominante.

---

# 29. Materiales

Favorecer:

- vidrio claro;
- ceramic white;
- aluminio claro;
- acero pulido suave;
- papel;
- pantallas;
- piedra;
- hormigón;
- superficies mate.

---

# 30. Iluminación

Default:

```text
soft daylight
high-key
studio realism
soft contact shadows
controlled reflections
clean whites
```

Evitar neon, cyberpunk, heavy glow y dramatic dark lighting.

---

# 31. Mapas

Estilo:

- 3D relief;
- white / off-white;
- profundidad sutil;
- rutas turquesa/coral;
- objetos industriales integrados;
- iluminación de estudio;
- no turismo;
- no atlas escolar.

---

# 32. Personas

Default:

```text
NO FACE
```

Antes de usar rostro buscar institución + mercado afectado + objeto económico + consecuencia.

---

# 33. Layout families

## L1 — Minimal Editorial
Text Left + Visual Right.

## L2 — Institutional Data
Text Left + Institution / report / data Right.

## L3 — Map Story
Text Left + Sculptural Map Right.

## L4 — Executive View
Summary Left + Editorial Scene Right + Supporting Hybrid Objects Bottom.

## L5 — Stat Driven
Para cuando el dato principal pesa más que la escena.

---

# 34. Variación controlada

No usar el mismo layout más de dos veces consecutivas.

```text
L1 → L2 → L5 → L3 → L2 → L1 → L4
```

---

# 35. Daily

Default:

```text
Slide 1 → noticia principal
Slide 2 → noticia
Slide 3 → noticia
Slide 4 → noticia
Slide 5 → noticia
Slide 6 → noticia
Slide 7 → Xending View
```

Rango: 5–8 slides.

---

# 36. Xending View

Último slide.

Función:

```text
conectar los puntos + interpretar + cerrar la lectura
```

No CTA comercial.

---

# 37. Special Editions

El mismo sistema debe permitir:

```text
Banxico Special
Fed Special
T-MEC Special
Inflation Special
Weekly Recap
Macro Report
```

Los Specials pueden tener portada, mayor dirección artística, layout específico y gráficos especiales, conservando el mismo ADN.

---

# 38. Referencias visuales de terceros

Si Morning Brief incluye imágenes de Reuters, Bloomberg, EFE, AP u otros medios, usarlas solo como:

```text
semantic_reference
```

Extraer sujeto, lugar, objeto, industria y situación. Nunca copiarlas visualmente.

---

# 39. Prompt maestro de estilo

```text
Create a premium Xending News editorial image with a white-dominant, high-end financial editorial aesthetic. Use lots of negative space, soft daylight, subtle shadows, modern institutional elegance, dark navy typography areas, subtle turquoise accents, restrained coral only when semantically justified, realistic materials, clean composition, polished surfaces, and a refined modern layout.

The image must feel premium, editorial, minimal, analytical, sophisticated and contemporary.

Prioritize credible real-world context, realistic or semi-realistic imagery, refined hybrid editorial objects, sculptural maps, industrial macro details and subtle data integration.

Avoid generic social-media templates, flat stock iconography, cartoonish 3D, dark heavy fintech styling, clutter, exaggerated metallic effects, toy-like architecture and generic AI aesthetics.

Do not render the Xending logo or wordmark inside the generated image.
```

---

# 40. Negative prompt general

```text
No generic Instagram template.
No cheap Canva look.
No generic outline icons.
No cartoonish 3D.
No toy-like buildings.
No dark navy pedestals.
No excessive metallic look.
No neon fintech aesthetic.
No cyberpunk.
No clutter.
No crowded dashboards.
No random currency symbols.
No giant flags as default.
No generic office people.
No repeated AI faces.
No fake newspaper headlines.
No fake institutional documents.
No Xending logo.
No Xending wordmark.
```

---

# 41. Prompt arquetipo FX

```text
Create a premium Xending News editorial visual about foreign exchange and currency markets.

Use a clean white-dominant editorial environment with a clear text-safe area on the left and the visual scene on the right.

Show a refined transparent glass globe placed on a clean white desk, with a softly blurred laptop or market screen in the background displaying a subtle financial chart.

The globe should feel physically credible, premium, refined and sculptural, with realistic glass, controlled reflections and soft contact shadows.

Use soft daylight, high-key lighting, dark navy visual accents only where needed and restrained turquoise chart details.

The scene must feel financial, contemporary, premium and analytical.

Avoid cartoonish 3D, excessive navy, generic finance symbols, floating currency signs and visual clutter.

Do not generate text or logos inside the image.
```

---

# 42. Prompt arquetipo Treasury / Bonds

```text
Create a premium Xending News editorial visual about Treasury yields, government bonds or fiscal pressure.

Use a bright white-dominant institutional editorial composition with a clear text-safe area on the left.

On the right, show a highly realistic or near-photorealistic U.S. Treasury-style government building with architecturally credible classical columns, realistic pale stone materials, natural depth, physically believable proportions and soft daylight.

The building must resemble real architectural photography rather than a 3D model, toy, icon or illustration.

In the foreground, integrate a clean printed Treasury Yield Curve report or financial research sheet with a restrained turquoise chart line.

Use realistic perspective, subtle depth of field, soft contact shadows and clean high-key lighting.

The atmosphere should feel institutional, analytical and premium.

Do not make the building cartoonish.
Do not simplify the architecture into an icon.
Do not use dark 3D pedestals.
Do not generate the Xending logo or wordmark.
```

---

# 43. Prompt arquetipo Trade / Map

```text
Create a premium Xending News editorial visual about North American trade, tariffs or cross-border commerce.

Use a white-dominant sculptural 3D relief map of North America with elegant depth, realistic proportions and a high-end editorial finish.

Integrate subtle turquoise and coral trade routes across the map.

Add only a few relevant supporting objects such as a cargo ship, shipping container, industrial metal coils or vehicle.

These objects should be realistic or premium hybrid editorial objects, not cartoon icons.

Keep the composition airy, elegant and uncluttered.

Use soft daylight, white and light-gray materials, subtle shadows and controlled reflections.

The map should be visually strong enough to become a signature Xending News visual.

Do not generate text or the Xending logo.
```

---

# 44. Prompt arquetipo Executive View

```text
Create a premium Xending News executive-summary editorial visual.

Use a bright, refined research-desk environment with a clear text-safe area on the left and the visual scene on the right.

Show a clean white desk with a paper report or tablet displaying subtle financial charts, a naturally placed pen, a glass of water and a softly blurred modern city or office background.

The scene must feel like high-end financial research, not generic office stock photography.

Include optional small hybrid editorial objects representing the major drivers of the day's narrative.

These objects should be light, semi-realistic, physically credible and premium, using white, translucent glass, light silver and subtle turquoise details.

They must feel halfway between real product renders and refined 3D editorial iconography.

Avoid generic outline icons, dark navy pedestals, toy-like objects or excessive metal.

Do not generate text or logos.
```

---

# 45. Prompt fallback Institutional + Data

```text
Create a premium Xending News editorial visual using a credible real-world institutional or economic context combined with restrained data visualization.

Choose a physical environment that genuinely relates to the news topic: institution, building, research desk, infrastructure, port, factory, terminal or market environment.

Use a white-dominant, high-end editorial composition, subtle turquoise data accents, realistic daylight, soft shadows, ample negative space and physically credible materials.

Do not invent generic iconography if a real context can communicate the story better.

Avoid cartoonish 3D, stock-looking finance clichés, excessive color and clutter.

Do not generate text or logos.
```

---

# 46. Prompt fallback Industrial Macro

```text
Create a premium Xending News editorial visual about an industrial, commodity, technology or supply-chain topic.

Use a highly refined realistic or semi-realistic physical subject connected directly to the story, such as machinery, semiconductor wafers, containers, metals, energy infrastructure, vehicles, industrial components or commodities.

Use a bright high-key environment, white and neutral materials, controlled contextual color, subtle Xending turquoise accents and realistic studio or natural lighting.

The composition must feel like premium financial editorial photography rather than commercial product advertising.

Avoid generic icons, cartoon styling and overly futuristic visuals.

Do not generate text or logos.
```

---

# 47. Prompt fallback Maps & Flows

```text
Create a premium Xending News editorial visual centered on geography, routes, cross-border flows or geopolitical relationships.

Use a clean sculptural map in white, off-white or light gray with elegant physical depth.

Add only the most relevant routes, nodes and contextual objects.

Use restrained turquoise and coral accents based on the meaning of the story.

The composition must remain editorial, premium and analytical.

Avoid tourism-map aesthetics, infographic clutter, giant flags, generic arrows and cartoon 3D.

Do not generate text or logos.
```

---

# 48. Construcción dinámica del prompt

Kiro NO debe enviar solo el headline al generador.

Debe crear:

```text
MASTER STYLE
+
NEWS CONTEXT
+
VISUAL ENGINE
+
SUBJECT
+
PHYSICAL CONTEXT
+
COMPOSITION
+
MATERIALITY
+
LIGHTING
+
TEXT SAFE AREA
+
NEGATIVE RULES
```

---

# 49. Prompt Builder

```text
{{MASTER_STYLE_PROMPT}}

NEWS CONTEXT
Headline: {{headline}}
Summary: {{subcopy}}
Primary data: {{key_data}}
Domain: {{domain}}
Mechanism: {{mechanism}}
Relevant entities: {{entities}}
Relevant geography: {{geography}}

VISUAL DIRECTION
Visual engine: {{visual_engine}}
Primary subject: {{visual_subject}}
Physical context: {{physical_context}}
Supporting elements: {{supporting_elements}}
Layout family: {{layout_family}}
Text-safe area: {{text_safe_area}}

STYLE
{{archetype_prompt}}

IMPORTANT
The exact headline, numerical data, source, date, slide number and branding will be added later by Xending Design.
Do not render them into the generated image.
Do not generate the Xending logo or wordmark.

NEGATIVE RULES
{{negative_rules}}
```

---

# 50. Output del Visual Resolver

```json
{
  "domain": "bonds",
  "mechanism": "pressures",
  "entities": ["U.S. Treasury", "Treasury bonds"],
  "geography": ["United States"],
  "economic_object": "government bonds",
  "physical_context": "U.S. Treasury-style institution",
  "visual_priority": "institution + data",
  "visual_engine": "editorial_photography_plus_data",
  "layout_family": "L2",
  "text_safe_area": "left",
  "visual_subject": "near-photorealistic Treasury-style building with yield-curve report"
}
```

---

# 51. Temas no previstos

Ejemplo:

```text
Taiwán restringe exportaciones de semiconductores
```

No crear template nuevo automáticamente.

Resolver:

```yaml
domain:
  technology_trade

economic_object:
  semiconductor

geography:
  Taiwan + destination markets

physical_context:
  semiconductor manufacturing / supply chain

visual_engine:
  industrial_macro + maps_and_flows
```

Y construir la escena con el ADN Xending News.

---

# 52. Confidence

El Visual Resolver puede devolver:

```json
{
  "visual_confidence": 0.84
}
```

Si baja de un threshold definido, usar:

```text
institutional / real context + data
```

No iconografía genérica.

---

# 53. Diversidad visual

Reglas:

- no repetir laptop en todas las slides;
- no repetir globo;
- no repetir documento;
- no repetir mapa;
- no repetir el mismo hybrid object;
- no usar el mismo lenguaje exacto en slides consecutivos.

Ideal para 7 slides:

```text
1 → photo + data
2 → institutional + data
3 → stat / data environment
4 → industrial macro
5 → map
6 → forecast / data
7 → executive desk + hybrid objects
```

---

# 54. Generación de imagen vs composición final

Image Generator produce:

- escena;
- contexto;
- materialidad;
- profundidad;
- objetos;
- visual storytelling.

Xending Design produce:

- headline;
- subcopy;
- dato;
- delta;
- fuente;
- fecha;
- numeración;
- categoría;
- disclaimers;
- branding.

---

# 55. Safe Areas

Cada prompt debe declarar `text_safe_area`.

Valores:

```text
left
right
upper_left
upper_right
top
bottom
split_left
```

---

# 56. QA visual

Validar realismo, marca, diseño y diversidad.

## Realismo
- ¿se ve AI?
- ¿la arquitectura parece maqueta?
- ¿los objetos se ven juguete?
- ¿las proporciones tienen sentido?

## Marca
- ¿se siente Xending?
- ¿sin depender de saturar turquesa?
- ¿evita estética comercial?

## Diseño
- ¿hay aire?
- ¿existe jerarquía?
- ¿la imagen deja espacio al texto?
- ¿la escena comunica la nota?

## Diversidad
- ¿es distinta de las slides anteriores?
- ¿está repitiendo recursos sin necesidad?

---

# 57. QA Hybrid Objects

Aprobar solo si:

- materiales claros;
- volumen creíble;
- sombra de contacto;
- detalle premium;
- icon-like clarity;
- no outline genérico;
- no pedestal navy;
- no exceso de metal;
- no cartoon.

---

# 58. QA edificios

Aprobar solo si:

- perspectiva coherente;
- columnas realistas;
- piedra creíble;
- ventanas coherentes;
- escala arquitectónica;
- profundidad fotográfica;
- luz natural;
- no toy-like.

---

# 59. Naming sugerido en código

```text
xending_news_input_adapter
xending_news_normalizer
xending_news_editorial_selector
xending_news_slide_planner
xending_news_visual_resolver
xending_news_visual_director
xending_news_prompt_builder
xending_news_style_v1
xending_news_image_qa
```

---

# 60. Config inicial

```yaml
xending_news:
  version: 1.0

  input:
    formats:
      - markdown
      - json
      - copy_paste
      - morning_brief

  carousel:
    min_slides: 5
    max_slides: 8
    default_slides: 7
    executive_wrap: true

  image:
    generate_text: false
    generate_logo: false
    white_dominant: true

  style:
    profile: xending_news_v1
    turquoise_intensity: restrained
    coral_intensity: semantic_only

  resolver:
    fallback: institutional_plus_data
    avoid_generic_icons: true
```

---

# 61. Regla de implementación más importante

Los cuatro ejemplos validados:

```text
FX
Treasury / Bonds
Trade Map
Executive View
```

NO son los únicos cuatro templates posibles.

Son **REFERENCE VISUALS** que definen nivel de calidad, balance de imagen/texto, realismo, materialidad, uso de color y dirección editorial.

El Visual Resolver debe producir nuevas escenas con ese mismo ADN.

---

# 62. Resumen operativo para Kiro

```text
1. Recibir MD, JSON, Morning Brief o copy/paste.
2. Normalizar las noticias.
3. Respetar el guion editorial cuando ya venga armado.
4. Seleccionar 5–8 slides si es necesario.
5. Convertir cada nota en Slide Plan.
6. Inferir dominio, mecanismo, entidad, geografía y contexto.
7. Seleccionar el motor visual.
8. Seleccionar layout.
9. Construir prompt con ADN Xending News.
10. Generar imagen sin texto ni logo.
11. Validar realismo, diversidad y estilo.
12. Componer texto/datos/fuente en Xending Design.
13. Exportar carrusel y/o PDF.
```

---

# 63. Resultado esperado

El sistema debe permitir que un mismo pipeline reciba mañana noticias sobre Banxico, Fed, bonos, deuda, USD/MXN, petróleo, T-MEC, acero, autos, semiconductores, China, inflación, empleo, empresas, logística, sanciones o commodities sin haber diseñado previamente un template para cada tema.

El contenido cambia.

La dirección visual se resuelve dinámicamente.

El ADN permanece:

```text
XENDING NEWS
=
real context
+
premium editorial design
+
data
+
white space
+
subtle brand accents
+
hybrid realistic objects when useful
+
visual intelligence
```
