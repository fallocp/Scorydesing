# Xending Visual Generation System v1.0

Documento maestro para agentes generadores de imágenes de Xending.

> **Integración runtime:** este archivo define la fuente conceptual del sistema visual, pero la Edge Function no lee Markdown en ejecución. `MASTER_IMAGE_PROMPT_V1` conserva el snapshot anterior y `MASTER_IMAGE_PROMPT_V2` contiene la traducción operativa de este sistema en `supabase/functions/generate-design-image/index.ts`. Durante la evaluación, el runtime usa código por defecto (`MASTER_IMAGE_PROMPT_SOURCE=code`); una fila `master_prompts` con `prompt_type='image'` solo vuelve a tener precedencia al configurar `MASTER_IMAGE_PROMPT_SOURCE=database`. Rollback: `MASTER_IMAGE_PROMPT_VERSION=v1`.

Este sistema define el estilo visual de Xending para piezas de LinkedIn, Instagram, presentaciones, campañas, imágenes corporativas, iconografía 3D, mockups, mapas, globos, comercio internacional, pagos, treasury, FX y financiamiento.

---

## 0. Principio rector

**Xending = infraestructura financiera global, clara, premium y confiable.**

La marca debe comunicar:

- solidez institucional;
- operación global;
- tecnología financiera útil;
- pagos internacionales;
- treasury;
- FX;
- financiamiento;
- comercio exterior;
- velocidad operativa;
- simplicidad premium.

La dirección visual debe sentirse como una fintech B2B seria, internacional y moderna, no como una startup visualmente saturada ni como banca tradicional pesada.

---

## 1. Brand DNA

### 1.1 Definición estratégica

Xending usa un lenguaje visual fintech premium, corporativo, limpio y global, combinando:

1. fotografía profesional operativa;
2. iconografía 3D blanca ultra limpia;
3. globos/mapas de red global;
4. mockups financieros;
5. elementos editoriales minimalistas.

El objetivo es comunicar pagos internacionales, treasury, FX y comercio exterior con claridad, confianza y sofisticación operativa.

### 1.2 Sensación deseada

Cada imagen debe sentirse:

- premium;
- limpia;
- blanca;
- ejecutiva;
- institucional;
- moderna;
- global;
- confiable;
- tecnológica;
- B2B;
- financiera.

### 1.3 Qué debe evitar

La imagen nunca debe sentirse:

- crypto;
- gamer;
- neón;
- infantil;
- caricaturesca;
- sobrecargada;
- caótica;
- demasiado plástica;
- demasiado futurista;
- stock barata;
- excesivamente oscura;
- excesivamente emocional;
- genérica de Canva.

---

## 2. Sistema visual general

### 2.1 Estilo madre

**Corporate Clean Global Fintech**

Una mezcla de:

- editorial fintech premium;
- clean 3D iconography;
- institutional global visuals;
- modern white-space corporate design;
- fotografía profesional operativa;
- mapas/globos de red global.

### 2.2 Regla general de superficie

La composición debe sentirse mayormente blanca.

Distribución visual recomendada:

- **80–90% blanco / gris muy claro / cream muy sutil**
- **6–12% navy**
- **2–5% turquesa**
- **1–3% coral**

El blanco no es solo fondo; es parte central de la identidad.

### 2.3 Jerarquía visual

1. Un mensaje o concepto principal.
2. Un hero visual claro.
3. Pocos elementos secundarios.
4. Mucho espacio negativo.
5. Acentos de color controlados.
6. Composición editorial, no saturada.

---

## 3. Paleta oficial

### 3.1 Colores base

| Nombre | HEX | Uso |
|---|---:|---|
| Blanco | `#FFFFFF` | Fondo principal, objetos 3D, superficie dominante |
| Navy | `#0F1419` | Texto, estructura, símbolos financieros, flechas |
| Turquesa menta | `#2ED4C7` | Activación, nodos, métricas, detalles tecnológicos |
| Coral | `#FF7A4A` | Acentos, énfasis, nodos principales, rutas puntuales |
| Light gray | `#F5F5F5` | Fondos mínimos, tarjetas, separadores |
| Cream | `#F5F3F0` | Calidez suave, máximo 10% de uso |
| Medium gray | `#6B7280` | Textos secundarios |
| Dark green | `#236262` | Apoyo institucional, detalles sobrios |

### 3.2 Reglas de uso

#### Blanco
Usar como superficie dominante.

Debe aparecer en fondos, objetos 3D, globos, tarjetas, documentos, monedas e interfaces limpias.

#### Navy
Usar como columna vertebral visual: títulos, símbolos financieros, letras USD/MXN/EUR/CNY, checks, flechas estructurales, contornos principales, dashboards y UI institucional.

#### Turquesa menta
Usar como energía visual: nodos, anillos finos, métricas, indicadores, líneas de activación, detalles de velocidad, componentes de UI y puntos de conexión.

**Regla crítica:** el turquesa debe ser sólido, limpio y exacto: `#2ED4C7`. No usar ruido, textura, glow barato, puntos blancos ni degradados que alteren su lectura.

#### Coral
Usar como acento editorial o punto focal: puntos de origen, acentos de rutas, highlights, líneas cortas, detalles de énfasis y palabras clave puntuales.

No debe dominar la composición.

### 3.3 Prohibiciones de color

Evitar neón, morados, azules eléctricos, verdes saturados, naranjas agresivos, gradientes visibles exagerados, fondos navy pesados, fondos oscuros dominantes y paletas multicolor sin control.

---

## 4. Tipografía visual

### 4.1 Titulares grandes

Usar:

- **Montserrat Bold**
- **Montserrat ExtraBold**

Aplicar en claims, headlines, portadas, frases principales y títulos de campaña.

### 4.2 Textos pequeños

Usar:

- **Poppins Medium**
- **Poppins SemiBold**

Aplicar en subtítulos, etiquetas, bullets, captions, UI, navegación, textos en tarjetas y microcopy.

### 4.3 Reglas de texto en imágenes generadas

Preferir poco texto dentro de la imagen generada. Cuando haya texto, debe ser corto y controlado.

Permitido:

- USD
- MXN
- EUR
- CNY
- INVOICE
- PAID
- TOTAL
- CREDIT
- SAME DAY
- 0%
- $10,000 / USD 10,000 si el concepto lo requiere

Evitar slogans largos, frases promocionales completas, nombres inventados, logos inventados, textos ilegibles, texto falso tipo gibberish, marcas no autorizadas y la palabra Xending dentro de iconos salvo solicitud explícita.

---

## 5. Modos visuales oficiales

El agente debe elegir uno de estos modos según el brief.

---

# MODO 1 — Corporate Professional Photography

## 5.1 Uso

Usar para LinkedIn, campañas institucionales, credibilidad, contenido B2B, importadores/exportadores, logística, treasury, FX, pagos, financiamiento y comercio exterior.

## 5.2 Estilo

Fotografía corporativa luminosa, realista, ejecutiva y operativa.

Debe verse limpia, seria, premium, internacional, moderna, sobria y de alto nivel empresarial.

## 5.3 Ambientes aprobados

- almacenes limpios;
- centros logísticos;
- puertos;
- oficinas modernas;
- escritorios financieros;
- salas de juntas;
- espacios con skyline;
- estaciones de trabajo con monitores;
- laptop con dashboard;
- documentos financieros;
- reportes FX;
- contenedores;
- pallets ordenados.

## 5.4 Personas

Las personas deben apoyar la historia, no dominarla.

Preferir:

- profesionales de espaldas;
- perfil parcial;
- rostro fuera de foco;
- rostro cortado por encuadre;
- manos trabajando;
- torso ejecutivo;
- personas usando tablet;
- personas revisando documentos;
- siluetas profesionales;
- equipos caminando de lejos.

## 5.5 Regla crítica sobre rostros

Evitar rostros como protagonista.

Los rostros generados por IA suelen verse repetitivos, artificiales o stock-like. Eso reduce confianza institucional.

Evitar:

- retratos frontales;
- personas mirando a cámara;
- sonrisas exageradas;
- demasiadas caras visibles;
- piel demasiado perfecta;
- expresiones genéricas;
- modelos corporativos falsos;
- close-ups faciales.

## 5.6 Wardrobe

Preferir trajes navy, camisas blancas, tonos neutros, ropa ejecutiva sobria, uniformes logísticos limpios, chalecos o ropa técnica profesional cuando aplique.

Evitar ropa llamativa, colores no marca, moda excesiva y look informal sin justificación.

## 5.7 Luz y color grading

Usar luz natural, luz suave, blancos limpios, contraste moderado, temperatura neutra o ligeramente cálida y tono premium.

Evitar sombras dramáticas, iluminación cinematográfica pesada, look oscuro, ambiente lúgubre y saturación excesiva.

---

# MODO 2 — Premium 3D Iconography

## 6.1 Uso

Usar para explicar servicios, representar beneficios, carruseles, productos, posts educativos, features, web, pitch decks, anuncios, comparativos y conceptos complejos de pagos, FX, treasury y comercio exterior.

## 6.2 Estilo general

**3D premium ultra-clean corporate icons.**

Cada imagen debe parecer parte de una familia visual coherente.

Debe sentirse como un objeto financiero de alta gama: blanco, limpio, institucional, moderno, confiable, tecnológico, refinado y fácil de entender.

## 6.3 Materialidad

Usar cerámica blanca refinada, acrílico blanco mate, superficies blancas satinadas, bordes redondeados, volumen suave, reflejos limpios, sombras tenues, iluminación de estudio softbox, contornos precisos y alta definición.

Evitar plástico barato, apariencia inflable, materiales sucios, metal pesado, cristales exagerados, glow excesivo, bloom, ruido, textura gamer y estilo juguete.

## 6.4 Composición

Reglas:

- una sola composición por imagen;
- un objeto principal o hero object;
- máximo 1–3 elementos secundarios;
- lectura clara en menos de 3 segundos;
- objeto centrado o balanceado;
- suficiente espacio negativo;
- no crear mosaicos ni comparativos dentro de una misma imagen;
- no crear múltiples opciones en una sola imagen.

## 6.5 Fondo

Default: blanco puro `#FFFFFF`.

Permitir sombra muy suave, ligero suelo invisible por contacto y fondo transparente si se solicita.

Evitar gris dominante, beige dominante, escenarios, habitaciones, paredes, pisos visibles, fondos fotográficos y degradados fuertes.

---

# MODO 3 — Hybrid Corporate Visual

## 7.1 Uso

Usar para anuncios premium, posts de campaña, hero visuals, LinkedIn Ads, Instagram Ads, piezas de performance, portadas y social media visual fuerte.

## 7.2 Composición

Combinar fotografía profesional o mockup con mapa/globo Xending, tarjetas blancas, mini iconos 3D, nodos/rutas, titular editorial y acentos coral/turquesa.

Debe verse como una pieza de branding financiero premium, no como collage.

## 7.3 Reglas

- mantener blanco dominante;
- no saturar de íconos;
- no usar más de 1 hero visual;
- no mezclar demasiados estilos;
- dejar área limpia para copy;
- usar overlays blancos suaves si la foto es oscura.

---

# MODO 4 — Product / Dashboard Mockup

## 8.1 Uso

Usar para pagos internacionales, treasury, FX, beneficiarios, cuentas multidivisa, reportes, quick quote, platform demo, Xending USA y operaciones corporativas.

## 8.2 Estilo

Mockups realistas de laptop o monitores con interfaz financiera limpia.

La UI debe usar navy, blanco, turquesa, gris claro, gráficos simples, mapas, tablas limpias y dashboards ejecutivos.

Evitar dashboards de trading agresivo, pantallas saturadas, crypto UI, números ilegibles, demasiados widgets e interfaz oscura excesiva sin balance.

## 8.3 Escenarios

Aprobados: oficina con skyline, escritorio ejecutivo, laptop junto a libreta y pluma, monitores en oficina premium, vista corporativa de ciudad y entorno financiero limpio.

---

# MODO 5 — Global Map / Globe Visual

## 9.1 Uso

Usar para pagos globales, presencia internacional, red de beneficiarios, FX, treasury, rutas internacionales, comercio exterior, USA–Mexico, China–USA, pagos a Asia e infraestructura global.

## 9.2 Globo oficial Xending

El globo Xending es un activo visual insignia.

Características:

- esfera blanca limpia;
- continentes punteados o en relieve;
- líneas curvas finas;
- nodos turquesa;
- nodo principal coral;
- gris suave para continentes;
- rutas sobrias;
- sensación global, tecnológica e institucional.

## 9.3 Dos tipos de globo

### Tipo A — Globo de red global

Usar para presencia global, pagos internacionales, cobertura, red, alcance, treasury y plataforma.

Características: continentes punteados, muchas rutas finas, nodos múltiples y punto central coral.

### Tipo B — Globo de corredor geográfico

Usar para México–USA, China–USA, Asia, import/export, comercio exterior y rutas específicas.

Características: continentes en relieve, países destacados, banderas oficiales cuando aporten claridad, pocas rutas, nodos claros y composición limpia.

## 9.4 Reglas de mapas

- no deformar territorios de forma evidente;
- no saturar rutas;
- no usar puntos negros pesados;
- usar gris suave;
- usar nodos pequeños;
- usar rutas curvas finas;
- evitar mapas turísticos o políticos sobrecargados.

---

# MODO 6 — Shipping, Ports & Global Trade Photography

## 10.1 Uso

Usar para importaciones, exportaciones, comercio global, pagos a proveedores, supply chain, logística, freight y financiamiento de comercio exterior.

## 10.2 Fotografía de buques

Preferir buques cargueros de día, puertos limpios, grúas visibles, contenedores ordenados, espacio libre para texto, luz natural y composición premium.

Evitar barcos demasiado oscuros, atardeceres demasiado naranjas, escenas dramáticas, océano agresivo, logos visibles, nombres de barco legibles, look documental crudo y exceso de contenedores saturados.

## 10.3 Almacenes y contenedores

Preferir almacén blanco, piso limpio, pallets ordenados, contenedores turquesa o tonos controlados, personas usando tablet, perspectiva amplia y ambiente operativo premium.

Evitar caos logístico, suciedad, montacargas como protagonista si no es necesario, rostros frontales y colores industriales pesados.

---

## 11. Sistema de iconografía 3D por subfamilias

### 11.1 Institutional Financial Objects

Objetos:

- banco;
- wallet;
- documento;
- factura;
- escudo;
- moneda;
- crédito;
- liquidez;
- plataforma;
- check.

Reglas:

- blanco dominante;
- navy para símbolos;
- turquesa como detalle;
- coral mínimo;
- bordes redondeados;
- lectura inmediata.

### 11.2 FX / Currency Icons

Objetos:

- monedas USD/MXN/EUR/CNY;
- flechas curvas;
- anillos finos;
- símbolo $;
- 0%;
- conversión;
- tasas;
- ahorro.

Reglas de monedas:

- cuerpo exterior blanco;
- grosor visible;
- cara central blanca ligeramente hundida;
- borde exterior blanco premium;
- anillo interior muy fino;
- letras o símbolos navy en relieve;
- perspectiva frontal o ligera inclinación.

Tratamiento por moneda:

- USD: letras o símbolo navy; anillo coral o navy fino.
- MXN: letras navy; anillo turquesa fino.
- EUR: letras navy; anillo navy o gris.
- CNY: letras navy; coral muy sutil.
- Moneda genérica: símbolo $ navy.

Evitar monedas vacías, anillos gruesos, colores saturados, texto extra y símbolos genéricos poco claros.

### 11.3 Global Corridor Icons

Objetos:

- globo;
- países destacados;
- rutas;
- nodos;
- barco;
- camión;
- monedas;
- banderas.

Usar para México–USA, China–USA, Asia–USA, export/import.

Reglas:

- globo blanco;
- países o banderas solo si aportan;
- rutas curvas;
- nodos claros;
- no saturar.

### 11.4 Trade & Logistics Icons

Objetos:

- barco;
- contenedor;
- caja;
- pallet;
- documento;
- camión;
- ruta.

Reglas:

- cuerpo blanco;
- detalles navy;
- acentos turquesa/coral pequeños;
- look premium, no industrial crudo;
- no marcas reales.

### 11.5 Treasury / Liquidity Icons

Objetos:

- wallet;
- monedas;
- cuenta;
- núcleo financiero;
- flechas;
- check;
- banco.

Reglas:

- movimiento claro;
- flechas finas;
- centro financiero blanco;
- símbolos navy;
- turquesa para activación.

### 11.6 Benefit / Status Icons

Objetos:

- reloj;
- check;
- escudo;
- candado;
- 0%;
- flecha de crecimiento.

Usar para seguridad, velocidad, eficiencia, aprobación, cumplimiento, costo cero y protección.

---

## 12. Pedestales y bases

### 12.1 Regla default

Por defecto, los iconos deben generarse **sin base**.

### 12.2 Cuándo sí usar base

Permitir base blanca o plataforma circular cuando el concepto represente status, beneficio, feature, insignia, seguridad, velocidad, 0%, aprobación, validación, crédito o liquidez centralizada.

### 12.3 Cómo debe ser la base

- blanca;
- limpia;
- sutil;
- sin peso excesivo;
- con sombra suave;
- puede tener anillo turquesa fino;
- no debe competir con el objeto principal.

---

## 13. Flechas, rutas y movimiento

### 13.1 Flechas

Las flechas deben ser curvas, elegantes, claras, de grosor medio o fino, con navy como estructura y puntas coral o turquesa según intención.

### 13.2 Significado de color

- Navy = estructura de movimiento.
- Turquesa = activación, llegada, recepción, eficiencia.
- Coral = origen, énfasis, alerta suave, punto focal.

### 13.3 Evitar

Evitar flechas gruesas tipo infografía, flechas agresivas, muchas flechas cruzadas, líneas desordenadas, motion blur fuerte, rayos, fuego y partículas excesivas.

---

## 14. Documentos, facturas y reportes

### 14.1 Documentos 3D

Deben ser blancos, verticales, con bordes redondeados, esquina superior doblada cuando aplique, pocas líneas navy/gris, tablas mínimas, símbolos financieros integrados, limpios y fáciles de interpretar.

### 14.2 Texto permitido

Permitido:

- INVOICE;
- USD;
- MXN;
- PAID;
- TOTAL;
- CREDIT;
- $10,000;
- 0%.

No inventar razones sociales, marcas, logos, datos fiscales complejos, nombres de empresas, textos largos o importes sin intención del brief.

### 14.3 Documentos profesionales/fotográficos

Para fotos con reportes o estrategia FX: carpetas ejecutivas, reportes impresos, gráficos claros, calculadora, pluma, escritorio limpio, puerto o skyline desenfocado.

Evitar texto excesivo ilegible.

---

## 15. Social media: LinkedIn e Instagram

### 15.1 LinkedIn

Debe verse más institucional, ejecutivo, sobrio, financiero y confiable.

Usar fotografía operativa, globos de red, dashboards, iconografía 3D, frases claras y layouts con mucho aire.

Evitar visuales demasiado emocionales, exceso de color, claims demasiado publicitarios y personas mirando a cámara.

### 15.2 Instagram

Debe verse más visual, directo y dinámico, con mayor protagonismo de objeto, limpio y premium.

Usar iconografía 3D grande, globos, corredores, monedas, visuales híbridos y copy corto.

Evitar saturación, carruseles con demasiada información por slide y diseños juveniles no corporativos.

### 15.3 Ratios recomendados

- LinkedIn feed: 1:1 o 4:5.
- LinkedIn banner / hero: 16:9.
- Instagram feed: 1:1.
- Instagram vertical: 4:5.
- Stories/Reels cover: 9:16.

---

## 16. Sistema de composición

### 16.1 Regla de una idea

Cada imagen debe comunicar una sola idea principal.

Ejemplos:

- Pagos internacionales
- FX hedging
- Financiamiento a proveedores
- Same day
- Cuenta multidivisa
- Cero costo
- México–USA
- China–USA
- Control de treasury

### 16.2 Layouts aprobados

#### A. Hero split

- texto izquierda;
- visual derecha;
- fondo blanco;
- mapa/globo o foto.

#### B. Center object

- objeto 3D centrado;
- fondo blanco;
- ideal para Instagram o carrusel.

#### C. Editorial card

- foto o mockup;
- overlay blanco;
- tarjeta con texto;
- acento coral/turquesa.

#### D. Operational background

- foto de bodega, puerto u oficina;
- persona no protagonista;
- área libre para copy.

#### E. Product dashboard

- laptop/monitor protagonista;
- ciudad o oficina de fondo;
- UI limpia.

---

## 17. Prompt router para el agente

Antes de generar, el agente debe clasificar el brief.

### 17.1 Clasificación por intención

Si el usuario pide explicar un servicio:
- usar Premium 3D Iconography.

Si el usuario pide campaña institucional:
- usar Corporate Professional Photography o Hybrid Corporate Visual.

Si el usuario pide comercio exterior:
- usar Shipping / Ports / Global Trade o Trade 3D Iconography.

Si el usuario pide FX o treasury:
- usar Dashboard Mockup, FX Documents o 3D Currency Icons.

Si el usuario pide presencia global:
- usar Global Map / Globe Visual.

Si el usuario pide social media:
- adaptar composición a LinkedIn o Instagram.

### 17.2 Selección de modo

El agente debe elegir uno:

1. Corporate Professional Photography
2. Premium 3D Iconography
3. Hybrid Corporate Visual
4. Product / Dashboard Mockup
5. Global Map / Globe Visual
6. Shipping / Ports & Global Trade Photography

---

## 18. Prompt maestro general del agente

```text
Eres un agente especializado en generar imágenes para Xending, una fintech B2B enfocada en pagos internacionales, treasury, FX, financiamiento y comercio exterior.

Tu objetivo es crear imágenes consistentes con el sistema visual de Xending: premium, blanco, corporativo, global, limpio, tecnológico e institucional.

Cada imagen debe comunicar confianza financiera, operación global, claridad, control y sofisticación. El estilo debe funcionar para LinkedIn, Instagram, presentaciones, campañas, web y contenido B2B.

Usa la identidad visual:
- Blanco dominante #FFFFFF
- Navy #0F1419 como estructura
- Turquesa menta #2ED4C7 como acento de activación
- Coral #FF7A4A como acento editorial
- Light gray #F5F5F5 para soporte
- Cream #F5F3F0 con uso muy limitado

Antes de generar, clasifica la imagen en uno de estos modos:
1. Corporate Professional Photography
2. Premium 3D Iconography
3. Hybrid Corporate Visual
4. Product / Dashboard Mockup
5. Global Map / Globe Visual
6. Shipping / Ports & Global Trade Photography

Aplica siempre composición limpia, fondo claro, mucho espacio negativo, jerarquía visual clara y acentos controlados.

Evita fondos oscuros dominantes, neón, crypto look, gamer look, caricatura, saturación, rostros frontales, stock barato, logos inventados, texto falso, marcas reales no solicitadas y composiciones sobrecargadas.

La imagen final debe sentirse como parte de una familia visual premium de fintech internacional.
```

---

## 19. Prompt base — Premium 3D Iconography

```text
Create a premium ultra-clean 3D icon for Xending, a B2B fintech focused on international payments, FX, treasury, financing and global trade.

Style:
white dominant, corporate, premium, minimal, refined, institutional, high-end financial product render.

Use:
- pure white background #FFFFFF
- satin white ceramic or matte acrylic materials
- navy #0F1419 for structural symbols, letters, checks and arrows
- mint turquoise #2ED4C7 only as thin accent, node, ring or activation detail
- coral #FF7A4A only as small emphasis, route origin or micro accent
- very soft studio shadows
- rounded edges
- clean geometry
- high definition

Composition:
one main hero object, maximum 1 to 3 secondary elements, centered, clear, readable in less than three seconds, enough negative space.

Avoid:
logos, Xending wordmark, invented brands, extra text, noisy backgrounds, gray backgrounds, heavy pedestal unless requested, childish style, toy look, crypto style, neon, excessive reflections, plastic look, multiple options in one image.

The result must look like part of a consistent premium fintech 3D icon family.
```

---

## 20. Prompt base — Corporate Professional Photography

```text
Create a premium editorial corporate photograph for Xending, a B2B fintech focused on international payments, FX, treasury, financing and global trade.

STYLE
Photorealistic, natural, operational, institutional and modern. Use the real colors, textures and materials of the selected location: cardboard, wood, steel, concrete, daylight, water, containers and office furniture. A bright style means clean exposure and controlled contrast, not an all-white studio, bleached environment or 3D render.

SCENE AND COMPOSITION
Choose one credible scene that communicates the brief: warehouse or port operation, executive office, treasury desk, financial documents, cargo, laptop, tablet or monitors. Vary the composition according to the concept: environmental wide shot, medium working shot, over-the-shoulder view, close detail of hands/documents/device, lateral subject or distant figure. Use one narrative focus and reserve clean negative space for copy. Do not default to a centered professional walking with a tablet.

PEOPLE
People are optional and secondary. If present, do not show an identifiable or evaluable face. Prefer back view, over-the-shoulder framing, crop below the eyes or nose, face fully outside the frame, face hidden by perspective or strong depth of field, hands working, or a distant figure. Do not use a sharp side profile as the default workaround. Natural posture and task interaction; no portraits, direct eye contact, posed groups, stock smiles, waxy skin or AI-looking facial features.

DEVICES
Include a tablet, laptop or monitor only when it strengthens the concept. Use a real contemporary device with plausible proportions, thickness, bezels, perspective, weight, contact and reflections. A tablet must be held with anatomically natural grip and oriented toward the person using it, never floating, oversized or displayed front-on like a sign. Show a restrained operational interface that is abstract or slightly out of focus, with no readable text or invented data unless exact text was explicitly requested.

LIGHT AND COLOR
Use natural available light or softbox light integrated into the real location, realistic dynamic range, moderate contrast, optical depth of field, photographic texture and neutral or slightly warm color grading. Navy or neutral wardrobe is welcome. Teal/coral accents appear only when physically plausible and never recolor the entire scene.

CONTEXTUAL MICRODETAILS
Select only 2–4 credible operational cues for the chosen scene; never include all of them or use random decoration. Warehouse/logistics: stretch-wrap folds and reflections, pallet wood grain and joints, neutral unreadable labels, cardboard corrugation and tape, floor seams or safety lines, bollards, loading docks and real container hardware. Office/treasury: paper edges, folder, notebook, pen, restrained cable management, window reflections and minimal signs of use. Port/trade: distant cranes or container stacks, slight atmospheric haze, natural water/metal reflections and controlled wear without logos. Use these cues to create foreground, middle-ground and background depth. Avoid flawless surfaces, cloned repetition and generic props.

AVOID
all-white clinical set, blown highlights, fake empty warehouse, CGI, 3D render, perfect synthetic symmetry, repeated stock composition, frontal or visible faces, sharp facial profile, malformed hands or fingers, floating or toy-like tablet, fake dominant UI, flawless unused surfaces, cloned boxes or pallets, random decorative clutter, chaotic or dirty industrial scene, dramatic cinematic darkness, crypto/neon look, logos and readable brand names.
```

---

## 21. Prompt base — Hybrid Corporate Visual

```text
Create a premium hybrid corporate visual for Xending combining professional photography with clean fintech graphic elements.

Use a bright professional business or logistics scene as the base. Add subtle Xending-style elements:
- white editorial cards
- thin coral accent line
- mint turquoise nodes or small indicators
- navy text areas or UI details
- optional dotted global map or route overlay
- optional small 3D financial icon

The composition must remain clean, premium and B2B. Leave enough negative space for copy. Use white as the dominant surface and keep all accents minimal.

Avoid clutter, heavy overlays, too many icons, visible faces as main subject, dark backgrounds, neon, crypto look, and generic Canva-style graphics.
```

---

## 22. Prompt base — Global Map / Globe

```text
Create a premium Xending-style global network globe.

Style:
white sphere, clean institutional fintech look, soft studio lighting, subtle depth, premium minimal render.

Globe:
continents made of uniform light gray dots or subtle white relief, geographically recognizable, refined, not black, not distorted.

Network:
thin elegant curved routes, small mint turquoise nodes, one coral main origin node when needed. Routes should feel precise and global, not chaotic.

Background:
pure white, soft shadow, no platform unless requested.

Avoid:
dark maps, saturated colors, thick lines, too many routes, inaccurate messy continents, tourist map style, country labels, logos, text.
```

---

## 23. Prompt base — Shipping / Ports / Trade Photography

```text
Create a clean premium logistics photograph for Xending, focused on global trade and international payments.

Scene options:
cargo ship in daylight, organized port with cranes, clean warehouse with pallets, shipping container, import/export operation, supply chain environment.

Style:
corporate, realistic, bright, clean, premium, global trade, B2B.

Composition:
wide frame, space for copy, neutral or cool color grading, organized containers, no chaos.

Avoid:
visible shipping company logos, readable ship names, dark dramatic lighting, dirty industrial look, overly orange sunset, rough ocean, oversaturated containers, documentary news-photo style.
```

---

## 24. Prompt base — Product / Dashboard Mockup

```text
Create a premium product/dashboard mockup visual for Xending.

Scene:
modern laptop or dual monitors showing a clean fintech dashboard for international payments, FX, treasury, beneficiaries, multi-currency accounts or quick quote.

UI style:
white and navy interface, mint turquoise highlights, subtle charts, clean tables, global map module, financial metrics, no clutter.

Environment:
premium office, skyline, executive desk, natural light, notebook or pen, modern corporate atmosphere.

Avoid:
crypto trading screens, dark overloaded dashboards, unreadable gibberish text, excessive charts, neon, gamer style, unrealistic UI, visible logos.
```

---

## 25. Prompt base — Warehouse / Operational Business

```text
Create a premium corporate logistics warehouse photograph for Xending.

Scene:
clean modern warehouse, organized pallets, shipping containers, bright white industrial space, professional business operation.

People:
professionals may appear with tablets or documents, but avoid making faces visible or central. Prefer side view, distant figures, cropped faces, back view or hands.

Style:
bright, clean, premium, corporate, international trade, operational confidence.

Colors:
white environment, navy clothing, subtle turquoise elements if naturally present, no excessive color.

Avoid:
dirty warehouse, chaotic boxes, exaggerated face, direct eye contact, visible logos, unsafe environment.
```

---

## 26. Negative prompt maestro

```text
Avoid: dark background, neon, cyberpunk, crypto look, gamer style, cartoon, childish icon, toy-like render, cheap plastic, excessive glass, heavy metal, clutter, multiple concepts, multiple options in one image, busy composition, low quality, blurry details, noisy texture, harsh shadows, overexposed faces, visible AI-looking faces, frontal portraits, fake smiles, distorted hands, extra fingers, unreadable text, gibberish text, invented logos, brand names, watermark, Xending logo unless explicitly requested, gray background for icons, dirty industrial look, chaotic warehouse, oversaturated colors, heavy gradients, dramatic cinematic lighting.
```

---

## 27. Plantilla para solicitar una imagen

```md
# Brief de imagen Xending

## Tipo de pieza
[LinkedIn / Instagram / Slide / Hero / Ad / Web / Carrusel]

## Modo visual
[Corporate Photography / 3D Iconography / Hybrid / Dashboard Mockup / Global Globe / Trade Photography]

## Objetivo de negocio
[Qué debe comunicar]

## Audiencia
[CFO / tesorería / importadores / exportadores / operaciones / dirección general]

## Concepto principal
[Una sola idea]

## Objeto o escena principal
[Hero visual]

## Elementos secundarios
[Máximo 1–3]

## Color y acentos
[Navy / mint / coral / banderas / otros]

## Texto permitido en imagen
[Exactamente qué texto puede aparecer]

## Composición
[1:1 / 4:5 / 16:9 / 9:16 / izquierda-derecha / centrado / etc.]

## Reglas especiales
[Sin rostros / sin logo / sin base / con pedestal / con globo / con dashboard / etc.]

## No hacer
[Restricciones específicas]

## Referencias aprobadas
[Nombrar 2–4 referencias]
```

---

## 28. Prompts operativos por categoría

### 28.1 Conversión USD/MXN

```text
Create a premium ultra-clean 3D icon showing USD to MXN currency conversion for Xending.

Main objects:
two white premium coins, same size, same thickness, slightly tilted, facing each other.

Details:
left coin shows USD in navy raised letters with an extremely thin coral inner ring.
right coin shows MXN in navy raised letters with an extremely thin mint turquoise inner ring.
Add two elegant curved navy arrows indicating bidirectional conversion.
Use a tiny coral detail on one arrow tip and a tiny mint detail on the other.

Background:
pure white, soft studio shadow, no pedestal.

Avoid:
extra text, logos, charts, thick arrows, saturated colors, multiple options.
```

### 28.2 Globo de red global

```text
Create a premium Xending-style white 3D globe showing a global payments network.

The globe should be a white sphere with continents made of uniform light gray dots. Add thin elegant curved routes connecting North America to Europe, Asia and Latin America. Use small mint turquoise nodes and one coral main node.

Style:
clean, institutional, premium fintech, soft studio lighting, white background.

Avoid:
black dots, thick lines, text labels, excessive routes, distorted geography, dark background.
```

### 28.3 Corredor México–USA

```text
Create a premium white 3D globe focused on North America, showing Mexico and the United States as a cross-border financial corridor.

Highlight Mexico and the United States using their official flag colors, but keep the rest of the globe white and subtle. Add one or two thin curved navy routes between Mexico and the United States with small mint and coral nodes.

Style:
clean, premium, institutional, global trade, soft white background.

Avoid:
country labels, excessive flags, many routes, logos, text, clutter.
```

### 28.4 Factura internacional

```text
Create a premium 3D icon of an international invoice for Xending.

Main object:
vertical white invoice document with rounded corners and a folded top corner.

Details:
navy raised title INVOICE, navy USD symbol, subtle gray information lines, minimal table, small mint check badge, optional coral PAID stamp if requested.

Style:
white ceramic paper, premium financial object, soft shadow, pure white background.

Avoid:
company names, logos, fake tax details, long text, clutter.
```

### 28.5 Wallet USD

```text
Create a premium 3D icon of a white corporate wallet with available USD funds.

Main object:
white structured wallet, slightly open, satin finish.

Secondary objects:
white coin with navy dollar symbol partially visible inside, small navy check badge, very thin mint interior edge.

Background:
pure white, soft studio shadow.

Avoid:
credit cards, numbers, logos, excessive color, toy style.
```

### 28.6 Liquidez rápida

```text
Create a premium 3D financial icon showing fast USD liquidity.

Main object:
white USD coin with raised navy dollar symbol.

Motion:
three elegant thin speed lines behind the coin, mostly gray/navy, with one tiny coral detail and one tiny mint detail.

Style:
clean, premium, controlled movement, white background.

Avoid:
fire, particles, aggressive motion blur, sports style, neon, clutter.
```

### 28.7 Costo cero / 0%

```text
Create a premium 3D icon showing 0% cost for Xending.

Main object:
large white circular coin or badge with raised navy 0% symbol.

Details:
thin mint turquoise inner ring, subtle white rim, soft shadow.

Composition:
front-facing, centered, premium, minimal.

Background:
pure white.

Avoid:
extra text, discounts tags, loud colors, retail coupon style, pedestal unless requested.
```

### 28.8 Reloj / Same Day

```text
Create a premium 3D clock icon representing same-day speed.

Main object:
white minimal clock, round or rounded square, no numbers.

Details:
navy hour and minute hands, mint turquoise second hand or center dot, subtle mint ring if useful.

Optional:
white circular pedestal only if the brief asks for a feature badge.

Style:
premium, clean, institutional, soft studio light.

Avoid:
alarm clock cartoon style, numbers, red urgency, clutter.
```

### 28.9 Seguridad / Validación

```text
Create a premium 3D validation icon for Xending.

Main object:
white shield or rounded badge with a navy check.

Details:
very subtle mint accent, optional coral microdetail, soft white platform only if requested.

Style:
institutional, financial, clean, trustworthy.

Avoid:
cybersecurity cliché, locks everywhere, dark blue backgrounds, excessive glow.
```

### 28.10 Warehouse import/export

```text
Create a premium corporate logistics photograph for Xending.

Scene:
bright clean warehouse with organized pallets and containers. A professional may be using a tablet, but avoid visible frontal face. Focus on the operation, not the person.

Style:
white, clean, realistic, B2B, premium, international trade.

Composition:
wide frame with copy space, organized geometry, corporate confidence.

Avoid:
messy warehouse, dirty pallets, exaggerated face, direct eye contact, visible logos, unsafe environment.
```

### 28.11 Treasury dashboard

```text
Create a premium corporate office photograph with a laptop or dual monitors showing a clean Xending-style treasury dashboard.

Dashboard:
international payments, FX, balances, recent payments, global map, clean charts, navy and mint UI.

Scene:
executive desk, modern skyline, natural light, notebook and pen, professional but not cluttered.

People:
if present, show from behind or side, not as a face-focused portrait.

Avoid:
crypto trading screens, dark cluttered dashboard, gibberish text, visible logos, stock-photo smile.
```

### 28.12 Cargo ship hero

```text
Create a premium logistics hero photograph for Xending.

Scene:
large cargo ship in daylight, clean ocean or organized port, containers visible, professional global trade atmosphere.

Style:
realistic, clean, corporate, bright, enough space for copy.

Avoid:
dark dramatic ship, overly orange sunset, dirty industrial look, visible ship logos, readable ship names, stormy ocean.
```

---

## 29. Golden References logic

The agent should use references as follows:

1. Use only 2–4 references per generation.
2. Select references from the same visual mode.
3. Never mix too many subfamilies.
4. If generating a 3D icon, reference approved 3D icons only.
5. If generating photography, reference approved photography only.
6. If generating a globe, reference approved globe/map images.
7. If generating hybrid, use one photographic reference and one brand/icon reference.

### 29.1 Approved reference categories

#### 3D Icons

- bank icon;
- wallet icon;
- invoice icon;
- USD/MXN/EUR coin icons;
- 0% icon;
- check/shield;
- clock/same day;
- container China;
- global trade globe;
- liquidity / savings icons.

#### Professional Photography

- warehouse with executive/tablet;
- professionals walking in warehouse;
- executive with dashboard monitors;
- laptop dashboard with skyline;
- FX strategy documents;
- cargo ship and port.

#### Global Assets

- dotted globe with routes and nodes;
- USA/MX corridor globe;
- China/USA corridor;
- global network map.

---

## 30. Rejected references logic

Maintain a folder of rejected images with notes. Each rejected reference should include the reason:

- too dark;
- face looks AI;
- too much turquoise;
- too much coral;
- too crypto;
- too plastic;
- too stock;
- too many elements;
- wrong typography;
- map too transparent;
- wrong globe style;
- colors not from palette;
- logo included without request.

---

## 31. Quality checklist

Before delivering, verify:

### Brand

- Does it look like Xending?
- Is it premium, white, global and institutional?
- Is navy the structural color?
- Are mint and coral controlled?

### Composition

- Is there one clear idea?
- Is there enough white space?
- Is the hero object obvious?
- Can the concept be understood in under 3 seconds?

### Color

- Is white dominant?
- Is mint exact and clean?
- Is coral minimal?
- Is there no color noise?

### Photography

- Are faces avoided or non-protagonist?
- Does the scene look professional?
- Is the environment clean?
- Are logos/brands avoided?

### Iconography

- Is the icon one single composition?
- Is the object white/premium?
- Are materials refined?
- Is there no unnecessary base?
- Is any text short and intentional?

### Maps / globes

- Is the globe clean?
- Are routes elegant?
- Are nodes controlled?
- Is geography visually credible?

### Final

- No watermark.
- No invented logos.
- No Xending logo unless requested.
- No gibberish text.
- No extra concepts.
- No clutter.

If a critical rule fails, regenerate before delivering.

---

## 32. Short system prompt version

Use this when the agent needs a compact instruction.

```text
Create visuals for Xending, a B2B fintech for international payments, treasury, FX, financing and global trade.

Style: premium, white, clean, corporate, global, institutional, modern fintech.

Use white #FFFFFF as dominant surface, navy #0F1419 for structure and text, mint #2ED4C7 for activation details, and coral #FF7A4A for small accents.

Choose the right mode: corporate photography, 3D iconography, hybrid visual, dashboard mockup, globe/map, or logistics/trade photography.

Avoid visible faces as the protagonist. Prefer hands, side profiles, back view, cropped faces, dashboards, documents, warehouses, ports, cargo ships and operational context.

For 3D icons: use satin white ceramic/acrylic objects, rounded edges, navy symbols, thin mint/coral accents, pure white background, soft studio shadow, one clear hero object.

For photos: use bright corporate environments, clean warehouses, ports, offices, dashboards and FX documents. Avoid stock-photo smiles, dark scenes, logos, messy industrial look, crypto/neon style and clutter.

The final image must feel like a premium global fintech brand: clean, trustworthy, executive and easy to understand.
```

---

## 33. Final rule

When in doubt, simplify.

A Xending image should be:

- clearer;
- cleaner;
- whiter;
- more institutional;
- more global;
- more premium;
- less decorative;
- less noisy.

The strongest Xending visuals are those where the concept is obvious, the execution is clean, and the brand feels financially trustworthy.
