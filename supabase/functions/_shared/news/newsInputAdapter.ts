/**
 * Input Adapter + parseo determinístico (secciones 3–7, 10, 11).
 *
 * Detecta el formato del contenido crudo y, cuando la estructura es clara
 * (JSON o el markdown canónico de la sección 4), lo lleva al esquema normalizado
 * SIN llamar al modelo: es más barato, más rápido y —lo importante— no reescribe
 * nada (sección 8). El contenido estructurado se RESPETA tal cual.
 *
 * Para texto pegado o markdown irregular, este módulo no adivina: devuelve `null`
 * y deja que el slide_planner use el modelo para extraer (newsSlidePlanner.ts).
 */

import type {
  NewsEditionType,
  NewsInputFormat,
  NewsNormalizedEdition,
  NewsNormalizedSlide,
} from './news-types.ts';

// ---------------------------------------------------------------------------
// Detección de formato (sección 10)
// ---------------------------------------------------------------------------

/**
 * Decide el formato del input. Si el llamador ya lo sabe, se respeta; si no, se
 * infiere. `morning_brief` no se infiere solo (es una variante de markdown/json
 * que el llamador declara): al detectar, cae en markdown o json según su forma.
 */
export function detectInputFormat(
  raw: string,
  hint?: NewsInputFormat,
): NewsInputFormat {
  if (hint) return hint;
  const text = raw.trim();
  if (!text) return 'paste';

  if ((text.startsWith('{') || text.startsWith('[')) && looksLikeJson(text)) {
    return 'json';
  }

  // Marcadores del markdown canónico de la sección 4.
  if (
    /^#{1,3}\s+/m.test(text) &&
    (/##\s+slide/i.test(text) ||
      /\*\*headline:\*\*/i.test(text) ||
      /\*\*dato:\*\*/i.test(text))
  ) {
    return 'markdown';
  }

  return 'paste';
}

function looksLikeJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Normalización determinística: JSON (secciones 5, 7)
// ---------------------------------------------------------------------------

/**
 * Convierte un JSON de entrada al esquema normalizado. Acepta tanto la forma
 * "amigable" de la sección 5 (`slide`, `data`, `editorial_type`) como el propio
 * esquema normalizado de la sección 7 (`slide_number`, `key_data`, …).
 *
 * Devuelve `null` si el JSON no trae un array de slides utilizable: el caller
 * decide si cae al modelo.
 */
export function parseJsonEdition(raw: string): NewsNormalizedEdition | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    return null;
  }

  const obj = (Array.isArray(parsed) ? { slides: parsed } : parsed) as Record<string, unknown>;
  const rawSlides = obj.slides;
  if (!Array.isArray(rawSlides) || rawSlides.length === 0) return null;

  const slides: NewsNormalizedSlide[] = rawSlides.map((s, i) =>
    normalizeSlideObject(s as Record<string, unknown>, i + 1),
  );

  return {
    date: str(obj.date) || '',
    edition: normalizeEditionType(obj.edition ?? obj.edition_type),
    slides,
    executive_commentary: str(obj.executive_commentary ?? obj.executiveCommentary ?? obj.comment) || '',
  };
}

function normalizeSlideObject(s: Record<string, unknown>, fallbackNumber: number): NewsNormalizedSlide {
  return {
    slide_number: num(s.slide_number ?? s.slide) ?? fallbackNumber,
    headline: str(s.headline) || '',
    subcopy: str(s.subcopy ?? s.body) || '',
    key_data: str(s.key_data ?? s.data ?? s.stat) || '',
    data_label: str(s.data_label ?? s.dato_label ?? s.stat_label ?? s.label) || '',
    secondary_data: str(s.secondary_data ?? s.delta) || '',
    source: toStringArray(s.source),
    source_urls: toStringArray(s.source_urls ?? s.urls),
    editorial_type: str(s.editorial_type ?? s.template ?? s.type) || 'market_update',
    reference_images: toStringArray(s.reference_images ?? s.images),
    notes: str(s.notes) || '',
  };
}

// ---------------------------------------------------------------------------
// Normalización determinística: markdown canónico (sección 4)
// ---------------------------------------------------------------------------

/**
 * Parsea el markdown canónico: bloques `## Slide N` con campos en negrita
 * (`**Dato:**`, `**Headline:**`, `**Subcopy:**`, `**Fuente:**`, `**Plantilla:**`)
 * y un `## Comentario final` opcional.
 *
 * Devuelve `null` si no encuentra ningún slide reconocible, para que el caller
 * caiga al modelo en lugar de producir una edición vacía.
 */
export function parseStructuredMarkdown(raw: string): NewsNormalizedEdition | null {
  const text = raw.replace(/\r\n/g, '\n');

  const date = matchField(text, /·\s*(.+)$/m) || matchField(text, /fecha[:\s]+(.+)$/im) || '';

  // Cada slide arranca en un encabezado "## Slide N".
  const slideRegex = /##\s*slide\s*(\d+)([\s\S]*?)(?=\n##\s|\n#\s|$)/gi;
  const slides: NewsNormalizedSlide[] = [];
  let m: RegExpExecArray | null;
  while ((m = slideRegex.exec(text)) !== null) {
    const number = parseInt(m[1], 10);
    const block = m[2];
    slides.push({
      slide_number: Number.isFinite(number) ? number : slides.length + 1,
      headline: fieldFromBlock(block, 'headline') || '',
      subcopy: fieldFromBlock(block, 'subcopy') || '',
      key_data: fieldFromBlock(block, 'dato') || fieldFromBlock(block, 'data') || '',
      data_label:
        fieldFromBlock(block, 'rotulo') ||
        fieldFromBlock(block, 'rótulo') ||
        fieldFromBlock(block, 'dato_label') ||
        fieldFromBlock(block, 'data_label') ||
        '',
      secondary_data: fieldFromBlock(block, 'delta') || '',
      source: splitSources(fieldFromBlock(block, 'fuente') || fieldFromBlock(block, 'source') || ''),
      source_urls: [],
      editorial_type: normalizeEditorialType(
        fieldFromBlock(block, 'plantilla') || fieldFromBlock(block, 'editorial_type') || '',
      ),
      reference_images: [],
      notes: '',
    });
  }

  if (slides.length === 0) return null;

  const commentaryBlock =
    matchField(text, /##\s*comentario final\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i) ||
    matchField(text, /##\s*(?:xending view|executive)\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i) ||
    '';

  const { options, chosen } = parseCommentaryOptions(commentaryBlock);
  // Si vino como lista de opciones (A/B/C), el cierre por defecto es la marcada
  // con [x] o, si ninguna, la primera. Si no hay opciones, el bloque es el cierre.
  const executive = chosen || options[0] || commentaryBlock.trim();

  const caption = matchField(text, /##\s*caption\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i).trim();

  return {
    date,
    edition: 'daily',
    slides,
    executive_commentary: executive,
    commentary_options: options.length > 0 ? options : undefined,
    caption: caption || undefined,
  };
}

/**
 * Extrae opciones de cierre de un bloque tipo "## Comentario final" con
 * checkboxes `- [ ] **A · Título** — frase`. Devuelve la FRASE limpia (tras el
 * em-dash) de cada opción y cuál está marcada con [x], si alguna.
 */
function parseCommentaryOptions(block: string): { options: string[]; chosen: string } {
  const options: string[] = [];
  let chosen = '';
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/);
    if (!m) continue;
    const checked = m[1].toLowerCase() === 'x';
    const stripped = m[2].replace(/\*\*/g, '').trim();
    // La frase útil es lo que va tras el primer em-dash; si no hay, todo el texto.
    const parts = stripped.split(/\s+—\s+/);
    const clean = parts.length > 1 ? parts.slice(1).join(' — ').trim() : stripped;
    options.push(clean);
    if (checked) chosen = clean;
  }
  return { options, chosen };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extrae el valor de un campo en negrita dentro de un bloque de slide. */
function fieldFromBlock(block: string, label: string): string {
  // Ej: **Dato:** `$16.9083`   →   $16.9083
  const re = new RegExp(`\\*\\*${label}:?\\*\\*\\s*\`?([^\\n\`]+)\`?`, 'i');
  const found = block.match(re);
  return found ? found[1].trim() : '';
}

function matchField(text: string, re: RegExp): string {
  const found = text.match(re);
  return found ? found[1].trim() : '';
}

function splitSources(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEditionType(value: unknown): NewsEditionType {
  const v = str(value).toLowerCase();
  return v === 'flash' ? 'flash' : 'daily';
}

/**
 * Mapea etiquetas de plantilla (que a veces vienen en kebab: `market-update`)
 * al enum editorial en inglés/snake_case (sección 18). Deja pasar lo que no
 * conoce: el enum es extensible.
 */
function normalizeEditorialType(value: string): string {
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return v || 'market_update';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}
