/**
 * xending_news_prompt_builder (secciones 48, 49).
 *
 * Ensambla el prompt de imagen final de cada slide. Kiro NO manda solo el
 * headline al generador: arma el bloque completo
 *
 *   MASTER_STYLE + NEWS_CONTEXT + VISUAL_DIRECTION + STYLE(arquetipo)
 *   + IMPORTANT + NEGATIVE_RULES
 *
 * usando el estilo v1 (newsStyleV1) y el arquetipo resuelto. El texto, las
 * cifras, la fuente, la fecha y el branding NO van en la imagen: los compone
 * Xending Design después (sección 54). Por eso se anexa la directiva de "sin
 * marca" (para el caso en que el prompt se pegue en GPT-Image y el negative
 * prompt no viaje).
 *
 * Independiente del carrusel: solo usa cables de News.
 */

import {
  NEWS_MASTER_STYLE_PROMPT,
  NEWS_NEGATIVE_PROMPT,
  NEWS_NO_LOGO_DIRECTIVE,
  NEWS_STYLE_DIRECTIVES,
} from './newsStyleV1.ts';
import { getNewsArchetype } from './archetypes.ts';
import type {
  NewsSlidePlan,
  NewsSlideVisual,
  NewsVisualResolution,
} from './news-types.ts';

/**
 * Construye el prompt final de un slide y devuelve el `NewsSlideVisual`
 * (resolución + prompt + reglas negativas usadas).
 */
export function buildSlideVisual(
  plan: NewsSlidePlan,
  resolution: NewsVisualResolution,
): NewsSlideVisual {
  const archetype = getNewsArchetype(resolution.archetype);

  const entities = resolution.entities.length ? resolution.entities.join(', ') : '—';
  const geography = resolution.geography.length ? resolution.geography.join(', ') : '—';
  const supporting = resolution.supporting_elements.length
    ? resolution.supporting_elements.join(', ')
    : '—';

  // Señal de banderas atada al texto: solo cuando la nota nombra países. Sutil y
  // fotográfica, nunca bandera gigante de fondo (el negative sigue prohibiendo eso).
  const countryCue = resolution.geography.length
    ? `\nCountry cues: the story involves ${geography}. You MAY add small, realistic, PHOTOGRAPHIC national flag cues that fit the scene — a flag decal on a truck or container, a license plate, or small flags at a checkpoint. Keep them subtle and secondary. Never a giant flag and never a flag-filled background.`
    : '';

  // Estructura exacta de la sección 49.
  const prompt = `${NEWS_MASTER_STYLE_PROMPT}

NEWS CONTEXT
Headline: ${plan.headline}
Summary: ${plan.subcopy}
Primary data: ${plan.key_data || '—'}
Domain: ${resolution.domain}
Mechanism: ${resolution.mechanism}
Relevant entities: ${entities}
Relevant geography: ${geography}

VISUAL DIRECTION
Visual engine: ${resolution.visual_engine}
Primary subject: ${resolution.visual_subject || archetype.label}
Physical context: ${resolution.physical_context || '—'}
Supporting elements: ${supporting}
Layout family: ${resolution.layout_family}
Text-safe area: ${resolution.text_safe_area}${countryCue}

STYLE
${archetype.prompt}

${NEWS_STYLE_DIRECTIVES}

IMPORTANT
The exact headline, numerical data, source, date, slide number and branding will be added later by Xending Design.
Do not render them into the generated image.
Do not generate the Xending logo or wordmark.
If the news names a real person (official, executive, politician), do NOT depict that person or any face resembling them. Represent them only through their institution or setting — the building or headquarters, an empty podium or hall, the institutional seal, a desk or environment — never a recognizable portrait.

${NEWS_NO_LOGO_DIRECTIVE}

NEGATIVE RULES
${NEWS_NEGATIVE_PROMPT}`;

  return {
    ...resolution,
    image_prompt: prompt,
    negative_rules: NEWS_NEGATIVE_PROMPT,
  };
}

/** Arma los visuales de todo el set. */
export function buildSlideVisuals(
  slidePlan: NewsSlidePlan[],
  resolutions: NewsVisualResolution[],
): NewsSlideVisual[] {
  const byNumber = new Map(resolutions.map((r) => [r.slide_number, r]));
  return slidePlan.map((plan, i) => {
    const resolution = byNumber.get(plan.slide_number) ?? resolutions[i];
    return buildSlideVisual(plan, resolution);
  });
}
