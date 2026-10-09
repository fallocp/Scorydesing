/**
 * xending_news_prompt_builder (secciones 48, 49).
 *
 * Ensambla el prompt de imagen final de cada slide. Kiro NO manda solo el
 * headline al generador: arma el bloque completo
 *
 *   MASTER_STYLE + NEWS_CONTEXT + VISUAL_DIRECTION + STYLE(arquetipo)
 *   + DATA_RULES + IMPORTANT + NEGATIVE_RULES
 *
 * usando el estilo v1 (newsStyleV1) y el arquetipo resuelto. El titular, la
 * fuente, la fecha, el número de slide y el branding NO van en la imagen: los
 * compone Xending Design después (sección 54). Las cifras solo pueden ir como
 * micro-labels del gráfico y únicamente las que vienen tal cual en el texto
 * (DATA RULES). Por eso se anexa la directiva de "sin
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
  NewsArchetypeId,
  NewsSlidePlan,
  NewsSlideVisual,
  NewsVisualResolution,
} from './news-types.ts';

/**
 * Cifras permitidas en la imagen: las que aparecen TAL CUAL en titular + subcopy
 * + dato (ej. "17.99", "18.00", "18", "4.5%"), en orden de aparición y sin
 * duplicados. Nada fuera de esta lista puede aparecer como número en la imagen.
 * Las fechas no son cifras del gráfico (la fecha se compone fuera): se omiten el
 * día de "15 de agosto" y los años 19xx/20xx ("en 2026", "octubre de 2026"),
 * salvo que lleven unidad o signo de moneda ("2045 dólares", "$2045", "2045 puntos").
 */
export function extractAllowedFigures(plan: NewsSlidePlan): string[] {
  const text = `${plan.headline ?? ''}\n${plan.subcopy ?? ''}\n${plan.key_data ?? ''}`;
  const found: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*%?/g)) {
    const figure = m[0];
    const index = m.index ?? 0;
    const after = text.slice(index + figure.length);
    if (/^\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i.test(after)) continue;
    // 19xx/20xx: es nivel solo con unidad/moneda; si no, se trata como año (fecha).
    if (/^(?:19|20)\d{2}$/.test(figure)) {
      const hasUnit =
        /^\s*(?:d[oó]lares|usd|pesos|puntos|pb|bps|barriles|mxn|unidades)(?![\p{L}])/iu.test(after) ||
        /(?:[$€£]|\busd|\bmxn)\s*$/i.test(text.slice(0, index));
      if (!hasUnit) continue;
    }
    found.push(figure);
  }
  return [...new Set(found)];
}

/**
 * Bloque DATA RULES: nada de datos inventados. Las cifras del gráfico salen solo
 * de la whitelist del texto y las etiquetas de activo se limitan al arquetipo.
 */
function buildDataRules(plan: NewsSlidePlan, archetypeId: NewsArchetypeId): string {
  const figures = extractAllowedFigures(plan);
  const figuresRule = figures.length
    ? `Allowed figures (verbatim from the story): ${figures.join(', ')}
Chart numbers, axis values, labels and micro-labels may use ONLY these figures, written exactly as listed.`
    : 'The story contains no figures: the chart has NO numbers at all — lines only, no axis values, no numeric labels.';

  const lower = `${plan.headline ?? ''} ${plan.subcopy ?? ''} ${plan.key_data ?? ''}`.toLowerCase();
  let assetRule: string;
  if (archetypeId === 'fx') {
    assetRule =
      'Allowed asset labels: only the currency pair of this story (e.g. USD/MXN). No Brent, no WTI, no stock indices, no other currencies or assets.';
  } else if (archetypeId === 'energy') {
    const named = ['Brent', 'WTI'].filter((t) => lower.includes(t.toLowerCase()));
    assetRule = named.length
      ? `Allowed asset labels: ${named.join(', ')} only. No currency pairs, no stock indices, no other assets.`
      : 'Allowed asset labels: none — do not label Brent or WTI (not named in the story). No currency pairs, no stock indices, no other assets.';
  } else {
    assetRule = 'Allowed asset labels: only assets named verbatim in the story.';
  }

  return `DATA RULES (no invented data — overrides any style note above that allows readable figures)
${figuresRule}
${assetRule}
No invented figures. No invented tickers. No prices or charts of other assets. No "accompanying" or decorative data that is not in the story. Any other screen, board or document in the scene stays softly blurred and illegible.`;
}

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
  // Los lugares cubren tanto escenas de logística como de escritorio/oficina/
  // institución (ej. una nota de empleo/NPF de EE.UU. sobre un desk), para que el
  // guiño encaje aunque no haya camión ni cruce aduanal. Cuando la nota gira en
  // torno a UN país claro (dato oficial/institución), el guiño deja de ser opcional.
  const flagPlacements =
    'a small flag standing on the desk, a flag on a pole softly blurred in the background outside a window, a flag on a building facade or lobby, a small flag pin or patch on a folder or report, a flag decal on a truck or container, a license plate, or small flags at a checkpoint';
  const singleCountry = resolution.geography.length === 1;
  const countryCue = resolution.geography.length
    ? `\nCountry cues: the story involves ${geography}. ${
        singleCountry
          ? 'This story clearly centers on one country, so DO include a small'
          : 'You MAY add small,'
      } realistic, PHOTOGRAPHIC national flag cue that fits the scene — e.g. ${flagPlacements}. Keep it subtle and secondary, matching the real scene. Never a giant flag and never a flag-filled background.`
    : '';

  const isMixed = resolution.story_type === 'mixed';
  const primarySubject = resolution.visual_subject || archetype.label;

  // Bloque VISUAL DIRECTION. En historias mixtas se declara la jerarquía de dos
  // fuerzas en UNA sola foto (primario dominante + secundario subordinado), sin
  // collage. En historias simples se mantiene el bloque de un solo sujeto.
  let visualDirection: string;
  if (isMixed) {
    const secondarySubject = resolution.secondary_visual_subject || '—';
    const weightPrimary = resolution.visual_weight_primary ?? 65;
    const weightSecondary = resolution.visual_weight_secondary ?? 35;
    visualDirection = `VISUAL DIRECTION
Visual engine: ${resolution.visual_engine}
Story type: mixed macro — two essential forces combined in ONE image
Primary subject: ${primarySubject}
Secondary subject: ${secondarySubject}
Visual hierarchy: primary subject ~${weightPrimary}% of visual weight, secondary subject ~${weightSecondary}%
Physical context: ${resolution.physical_context || '—'}
Supporting elements: ${supporting}
Layout family: ${resolution.layout_family}
Text-safe area: ${resolution.text_safe_area}${countryCue}
Composition rule: Create ONE cohesive hyper-realistic editorial photograph that combines both forces in the same frame. The primary subject is the dominant visual anchor and must clearly lead the composition; the secondary subject is restrained but clearly recognizable and must stay subordinate. Do NOT create a split-screen, a collage or two separate photographs, and do NOT drop the primary subject merely because the secondary theme is also mentioned.`;
  } else {
    visualDirection = `VISUAL DIRECTION
Visual engine: ${resolution.visual_engine}
Primary subject: ${primarySubject}
Physical context: ${resolution.physical_context || '—'}
Supporting elements: ${supporting}
Layout family: ${resolution.layout_family}
Text-safe area: ${resolution.text_safe_area}${countryCue}`;
  }

  // Negativos: en mixto se añaden las prohibiciones de collage/split-screen.
  const negativeRules = isMixed
    ? `${NEWS_NEGATIVE_PROMPT}
No split-screen composition.
No collage.
No two separate photographs side by side.
No 50/50 balance between the two subjects.
No dropping or hiding the primary subject.`
    : NEWS_NEGATIVE_PROMPT;

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

${visualDirection}

STYLE
${archetype.prompt}

${NEWS_STYLE_DIRECTIVES}

${buildDataRules(plan, resolution.archetype)}

IMPORTANT
The exact headline, source, date, slide number and branding will be added later by Xending Design.
Do not render them into the generated image.
Numerical data may appear inside the image only as chart figures or micro-labels taken verbatim from the allowed figures in DATA RULES; if there are none, render no numbers.
Do not generate the Xending logo or wordmark.
If the news names a real person (official, executive, politician), do NOT depict that person or any face resembling them. Represent them only through their institution or setting — the building or headquarters, an empty podium or hall, the institutional seal, a desk or environment — never a recognizable portrait.

${NEWS_NO_LOGO_DIRECTIVE}

NEGATIVE RULES
${negativeRules}`;

  return {
    ...resolution,
    image_prompt: prompt,
    negative_rules: negativeRules,
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
