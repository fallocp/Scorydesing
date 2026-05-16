# GPT Image Prompt Guide — Sistema de Prompts para GPT Image 2

Guía completa del sistema de dos pasos para generar imágenes on-brand con la API de GPT Image 2 (`gpt-image-2`).

---

## Arquitectura: Sistema de Dos Pasos

### Paso 1: Prompt Builder (Chat Completions)
Un modelo de chat transforma la solicitud simple del usuario en un prompt profesional optimizado para generación de imágenes.

### Paso 2: Image Generation (Images API)
El prompt profesional generado en el Paso 1 se envía a la API de imágenes con modelo `gpt-image-2`.

```
Usuario → "3 contenedores apilados para empresa de créditos"
    ↓ Paso 1 (Chat Completions)
Prompt profesional detallado con colores, composición, estilo
    ↓ Paso 2 (Images API - gpt-image-2)
Imagen generada on-brand
```

---

## Paso 1: System Prompt del Prompt Builder

Este es el system prompt EXACTO que se usa en el Edge Function `generate-design-image`:

```
You are an expert AI image prompt engineer and creative director for business advertising.

Your job is to convert user requests into production-ready prompts for AI image generation.
Always produce a clear, detailed, commercial-quality image prompt in English.

You specialize in:
- fintech advertising
- business credit and corporate finance
- logistics finance and international trade
- compliance technology
- B2B SaaS, banking and payments
- professional service companies

Rules:
- Respect the user request exactly.
- Preserve brand colors — they must dominate the main subject and visual atmosphere.
- Do not add text inside the image unless requested.
- Do not create fake logos or use copyrighted characters/brands.
- Avoid clutter. Create images that look premium, modern, realistic and ready for paid ads.
- Include composition, lighting, mood, visual hierarchy and restrictions.
- When the user provides industry context, translate it into visual metaphors.
- If the user request is vague, make a strong professional assumption and continue.
- Leave clear negative space for future advertising copy placement.

Return only valid JSON with:
{
  "prompt_final": "",
  "negative_instructions": "",
  "aspect_ratio": "",
  "recommended_use": "",
  "creative_rationale": ""
}

The prompt_final must include: main subject, business context, visual style, composition,
brand colors, lighting, mood, quality level, restrictions, and negative space instructions.
```

---

## Dynamic Prompt Template

Template interno que el Prompt Builder usa para construir el `prompt_final`:

```
Create a {style} advertising image for {business_type}.

Main visual: {main_subject}
Business context: The image should communicate {business_message}.
Brand color palette: Use strictly these colors: {brand_colors}. These colors must dominate
the main subject and visual atmosphere. Do not introduce other dominant colors.

Composition: {composition}. Leave {negative_space_position} negative space for future
advertising copy.

Lighting and style: Use {lighting_style}, realistic details, premium commercial quality,
clean shadows, strong contrast and a modern corporate aesthetic.

Mood: The image should feel {mood_keywords}.

Restrictions: No text, no logos, no people unless requested, no misspelled words,
no random brand names, no clutter, no low-quality details, no colors outside the
requested palette.

Final quality: High-resolution, professional advertising image, suitable for {platform_use}.
```

### Variables del Template

| Variable | Descripción | Default |
|----------|-------------|---------|
| `{style}` | Estilo visual general | `"hyperrealistic premium corporate"` |
| `{business_type}` | Tipo de negocio | Según marca (fintech/SOFOM) |
| `{main_subject}` | Sujeto principal de la imagen | Del request del usuario |
| `{business_message}` | Mensaje de negocio a comunicar | Del brief de campaña |
| `{brand_colors}` | Paleta de colores de la marca | Auto-inyectado (ver abajo) |
| `{composition}` | Instrucciones de composición | `"clean, centered, modern"` |
| `{negative_space_position}` | Dónde dejar espacio para texto | `"upper right"` |
| `{lighting_style}` | Estilo de iluminación | `"soft cinematic lighting"` |
| `{mood_keywords}` | Keywords de mood/tono | Según ángulo de campaña |
| `{platform_use}` | Uso final de la imagen | Según plataforma destino |

---

## Inyección de Colores por Marca

Los colores se inyectan automáticamente según la marca seleccionada:

### Xending
```
deep navy blue #0F1419, turquoise #2ED4C7, coral #FF7A4A
```

### Xending Capital
```
deep navy blue #0F1419, turquoise #2ED4C7, coral #FF7A4A
```

> Ambas marcas comparten la misma paleta. La diferenciación visual viene del brand lockup (sublabel "CAPITAL") y el tono del contenido.

---

## Ejemplos de Input → Output

### Ejemplo 1: Contenedores para Crédito

**Input del usuario:**
```
3 contenedores apilados para empresa de créditos
```

**Brand:** Xending Capital

**Output del Prompt Builder (JSON):**
```json
{
  "prompt_final": "Create a hyperrealistic premium corporate advertising image for a business credit company. Main visual: three shipping containers stacked vertically in a modern port setting, with the containers featuring deep navy blue #0F1419 and turquoise #2ED4C7 color accents. Business context: The image should communicate working capital, growth, and trade finance for Mexican businesses. Brand color palette: Use strictly these colors: deep navy blue #0F1419, turquoise #2ED4C7, coral #FF7A4A. These colors must dominate the containers and visual atmosphere. Composition: clean, centered, modern with strong vertical lines. Leave upper right negative space for future advertising copy. Lighting and style: Use soft cinematic lighting, realistic details, premium commercial quality, clean shadows, strong contrast and a modern corporate aesthetic. Mood: The image should feel trustworthy, powerful, growth-oriented. Restrictions: No text, no logos, no people, no misspelled words, no random brand names, no clutter, no low-quality details, no colors outside the requested palette. Final quality: High-resolution, professional advertising image, suitable for Instagram post and LinkedIn.",
  "negative_instructions": "No text overlays, no brand logos, no people, no unrealistic colors, no cluttered backgrounds",
  "aspect_ratio": "1:1",
  "recommended_use": "Instagram post, LinkedIn post, Facebook post",
  "creative_rationale": "Stacked containers symbolize growth and accumulated value — perfect metaphor for credit lines building business capacity. The vertical composition creates a sense of upward momentum."
}
```

### Ejemplo 2: Mapa de Rutas para Pagos

**Input del usuario:**
```
Mapa abstracto mostrando ruta de pagos de USA a México
```

**Brand:** Xending

**Output del Prompt Builder (JSON):**
```json
{
  "prompt_final": "Create a hyperrealistic premium corporate advertising image for an international payments fintech. Main visual: an abstract, stylized map showing a glowing payment route from the United States to Mexico, with luminous turquoise #2ED4C7 connection lines and nodes over a deep navy blue #0F1419 background. Business context: The image should communicate fast, reliable cross-border payments for the produce industry. Brand color palette: Use strictly these colors: deep navy blue #0F1419, turquoise #2ED4C7, coral #FF7A4A. The turquoise lines must dominate the route visualization. Composition: wide landscape format, route flowing from left (USA) to right (Mexico) with coral #FF7A4A accent at destination node. Leave left side negative space for future advertising copy. Lighting and style: Use soft cinematic lighting with glowing neon accents on the route lines, realistic map details, premium commercial quality. Mood: The image should feel connected, fast, technological, trustworthy. Restrictions: No text, no logos, no people, no country names written on map, no clutter, no colors outside the requested palette. Final quality: High-resolution, professional advertising image, suitable for Instagram Story and banner.",
  "negative_instructions": "No text on map, no country labels, no realistic satellite imagery, no people, no brand logos",
  "aspect_ratio": "9:16",
  "recommended_use": "Instagram Story, banner, presentation background",
  "creative_rationale": "Abstract map with glowing routes creates a tech-forward feel while clearly communicating cross-border connectivity. The left-to-right flow mirrors the natural reading direction and payment flow."
}
```

### Ejemplo 3: Finanzas y Crecimiento

**Input del usuario:**
```
Imagen abstracta de crecimiento financiero para factoraje
```

**Brand:** Xending Capital

**Output del Prompt Builder (JSON):**
```json
{
  "prompt_final": "Create a hyperrealistic premium corporate advertising image for a business factoring company. Main visual: abstract visualization of financial growth — ascending geometric shapes and bars in turquoise #2ED4C7 emerging from a deep navy blue #0F1419 surface, with subtle coral #FF7A4A highlights on peak elements. Business context: The image should communicate liquidity, invoice factoring, and business cash flow acceleration. Brand color palette: Use strictly these colors: deep navy blue #0F1419, turquoise #2ED4C7, coral #FF7A4A. Turquoise dominates the growth elements. Composition: centered with upward momentum, clean minimal background. Leave lower left negative space for future advertising copy. Lighting and style: Use soft cinematic lighting with volumetric light rays, realistic material textures on geometric shapes, premium commercial quality, clean shadows. Mood: The image should feel growth-oriented, stable, modern, optimistic. Restrictions: No text, no logos, no people, no currency symbols, no clutter, no colors outside the requested palette. Final quality: High-resolution, professional advertising image, suitable for LinkedIn and Facebook post.",
  "negative_instructions": "No currency symbols, no dollar signs, no charts with axes, no people, no text, no logos",
  "aspect_ratio": "1:1",
  "recommended_use": "LinkedIn post, Facebook post, Instagram post",
  "creative_rationale": "Abstract geometric growth visualization avoids cliché finance imagery while communicating upward momentum. The ascending shapes metaphorically represent invoice values being unlocked through factoring."
}
```

---

## Espacio Negativo y Composición

### Reglas de Espacio Negativo
El espacio negativo es CRÍTICO porque el texto se agrega en la capa HTML, no en la imagen.

| Plataforma | Posición Recomendada | Razón |
|------------|----------------------|-------|
| Instagram Story | Upper third o lower third | Headline arriba, CTA abajo |
| Instagram Post | Upper right o left side | Texto a un lado, imagen al otro |
| Facebook/LinkedIn | Left side (40%) | Layout dividido texto/imagen |
| Banner | Left side o center-left | Texto prominente a la izquierda |

### Instrucciones de Composición por Ángulo

| Ángulo | Composición Sugerida | Mood Keywords |
|--------|----------------------|---------------|
| Velocidad | Dynamic, motion blur, diagonal lines | fast, dynamic, energetic, modern |
| Ahorro | Clean, minimal, balanced | efficient, smart, optimized |
| Cobertura | Wide, expansive, connected | global, connected, expansive |
| Confianza | Centered, stable, symmetrical | trustworthy, solid, professional |
| Proceso | Sequential, step-by-step, flowing | simple, clear, organized |
| Financiamiento | Upward, growth, solid | growth, stability, opportunity |
| Factoraje | Flowing, liquid, transformative | liquidity, transformation, speed |
| Rapidez | Dynamic, sharp, direct | fast, immediate, efficient |
| Liquidez | Fluid, flowing, abundant | abundance, flow, freedom |

---

## Notas para el Agente

### Al Generar Prompts
- SIEMPRE inyectar los colores de la marca — son obligatorios
- SIEMPRE especificar "No text" a menos que el usuario pida texto explícitamente
- SIEMPRE incluir instrucciones de espacio negativo
- Adaptar el mood al ángulo de campaña
- Usar el template dinámico como base, personalizar según el brief
- **COHERENCIA IMAGEN-COPY**: Antes de generar, leer el headline y body. Si el copy usa una metáfora concreta (capas, desglose, flujo, puente, filtro, visible/oculto), la imagen DEBE representar esa metáfora visualmente. Nunca generar imágenes genéricas de "negocios" o "finanzas".
- **TEST DE ESPECIFICIDAD**: Preguntarse "¿Si quito el texto, alguien entendería de qué trata el ad solo con la imagen?" Si no, la imagen es demasiado genérica.
- **TENSIÓN EMOCIONAL**: La imagen debe generar la misma tensión que el copy — si expone un problema, la imagen debe hacer sentir ese problema.

### Al Revisar Resultados
- Verificar que los colores de la marca sean dominantes
- Verificar que no haya texto no solicitado en la imagen
- Verificar que haya espacio negativo suficiente para overlay
- **Verificar coherencia imagen-copy**: ¿la imagen refleja la metáfora del headline?
- **Verificar especificidad**: ¿la imagen podría ser de cualquier ad de fintech, o es específica a ESTE mensaje?
- Si la imagen no cumple, modificar el prompt y regenerar

### Temas Comunes para Stock
- Contenedores y logística
- Barcos y puertos
- Personas en negocios
- Dinero y finanzas
- Mapas y rutas
- Industria del produce
- Almacenes y bodegas
- Tecnología y digital
- Crecimiento y gráficas abstractas
