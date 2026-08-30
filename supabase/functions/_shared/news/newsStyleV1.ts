/**
 * xending_news_v1_style — perfil de estilo de Xending News.
 *
 * Es el ADN de marca del módulo de noticias: el master style prompt (sección 39),
 * el negative prompt general (sección 40) y las reglas de paleta, materiales y luz
 * (secciones 21–31). El "v1" es la versión: cuando la dirección visual cambie se
 * agrega `newsStyleV2` sin tocar este archivo, igual que los scene-kits comerciales
 * versionan sin romper lo anterior.
 *
 * NADA de aquí sale de los scene-kits del carrusel: News es 100% independiente.
 */

/** Identificador del perfil, tal como aparece en la config (sección 60). */
export const NEWS_STYLE_PROFILE = 'xending_news_v1' as const;

/**
 * Master style prompt (sección 39). Encabeza todo prompt de imagen de News.
 *
 * v1 salía demasiado "icono 3D" (globo de vidrio, moneda flotante) porque pedía
 * "hybrid editorial objects" como protagonista. Este master fija el ADN real de
 * Xending: FOTOGRAFÍA editorial hiperrealista de escenas y objetos REALES, con
 * la iconografía y los datos SOLO como acento sutil (líneas finas turquesa/coral,
 * etiquetas pequeñas), nunca como el sujeto central 3D.
 */
export const NEWS_MASTER_STYLE_PROMPT = `Create a premium Xending News editorial image in the style of high-end financial editorial PHOTOGRAPHY. The primary medium is real, hyper-realistic photography: either a photographed real scene, or a premium real object shot on a clean surface — like a DSLR editorial shot for a premium business magazine. Not a flat icon, not a cartoon or plastic 3D render.

Shoot a credible real-world environment, subject or object that genuinely relates to the story: trading desk with real screens, institutional building, port, clean warehouse, logistics terminal, factory floor, research desk, financial district, commodities, machinery, documents — or a single premium real object (e.g. a real glass globe, a metal component, a printed report) photographed with real materials, real light and real depth.

Use a bright white-dominant, high-key look: soft natural or studio daylight, clean whites, gentle shadows, shallow depth of field, lots of negative space, refined and airy composition. Dark navy reserved for typography areas.

Charts and labels are ONLY subtle data accents layered over the photograph, never the main subject: thin turquoise (#2ED4C7) route/chart lines, small data labels or a discreet chart, restrained coral (#FF7A4A) only for risk/decline/pressure. Maximum 2–3 accent elements. (A real photographed object CAN be the main subject — that is not iconography.)

The image must feel premium, editorial, journalistic, analytical and contemporary — like real photography for a financial outlet, elevated with a light, tasteful Xending data layer.

Realistic premium objects photographed with believable glass, metal or paper are welcome. Avoid: flat icon look, cartoon or plastic 3D, floating app-icon objects, toy-like objects, dark fintech styling, neon, clutter, generic stock, fake dashboards and generic AI render look.

Do not render the Xending logo or wordmark inside the generated image.`;

/**
 * Negative prompt general (sección 40). Todo lo que News nunca debe producir.
 * Se anexa como bloque `NEGATIVE RULES` en el prompt builder.
 */
export const NEWS_NEGATIVE_PROMPT = `No generic Instagram template.
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
No giant flags. No flag-filled background.
No generic office people.
No repeated AI faces.
No portrait of a real, named public figure.
No face resembling a specific real person (official, executive, politician).
No frontal stock-photo portrait as the main subject.
No fake newspaper headlines.
No fake institutional documents.
No Xending logo.
No Xending wordmark.`;

/**
 * Directiva de "sin marca" alineada con la del Design Studio
 * (`NO_LOGO_DIRECTIVE` en DesignStudioPage). Se anexa al prompt final para el
 * caso en que el usuario lo pegue en GPT-Image, donde el negative prompt no
 * viaja: la marca real se compone después en Xending Design (sección 54).
 */
export const NEWS_NO_LOGO_DIRECTIVE =
  'IMPORTANT — NO BRANDING: Do not render any logo, wordmark, brand name or company name (including "Xending") anywhere in the image. No text, no logos, no watermarks, no signage with readable text. Leave clean negative space in the declared text-safe area so headline, data, source, date and branding can be composited externally afterwards.';

/**
 * Reglas de paleta, materiales, luz y mapas (secciones 23–31), condensadas para
 * el prompt. Refuerzan el master style sin repetirlo.
 */
export const NEWS_STYLE_DIRECTIVES = `MEDIUM: hyper-realistic editorial PHOTOGRAPHY of a real scene or a premium real object (glass, metal, paper), shot like a DSLR editorial photograph. Charts and labels are thin, tasteful overlays, not the subject. A real photographed object can be the subject; avoid flat or cartoon icon centerpieces.
PALETTE: 80–90% neutral (white, off-white, light gray, soft steel, dark navy typography). 3–8% brand accent. Turquoise only for thin lines, routes, nodes, small charts and micro-labels. Coral only for risk, pressure, decline, friction, tariffs or alerts.
MATERIALS: real photographed materials — glass, brushed metal, paper, screens, stone, concrete, containers, packaging — with believable texture and micro-detail.
LIGHTING: soft daylight or soft studio light, high-key, clean whites, gentle contact shadows, shallow depth of field, natural reflections. No neon, no cyberpunk, no heavy glow, no dramatic dark lighting.
PEOPLE: default no face. If a person helps, keep them secondary — back, partial profile, hands, or out of focus — never a frontal stock-photo portrait.`;

/** El perfil completo, por si un consumidor quiere pasarlo como una sola pieza. */
export interface NewsStyleProfile {
  profile: typeof NEWS_STYLE_PROFILE;
  masterStyle: string;
  negativePrompt: string;
  styleDirectives: string;
  noLogoDirective: string;
}

export const newsStyleV1: NewsStyleProfile = {
  profile: NEWS_STYLE_PROFILE,
  masterStyle: NEWS_MASTER_STYLE_PROMPT,
  negativePrompt: NEWS_NEGATIVE_PROMPT,
  styleDirectives: NEWS_STYLE_DIRECTIVES,
  noLogoDirective: NEWS_NO_LOGO_DIRECTIVE,
};
