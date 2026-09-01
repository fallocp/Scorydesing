/**
 * Compositor editorial de Xending News (spec sección 54).
 *
 * La imagen generada es SOLO la escena (sin texto ni logo, sección 39/40). Este
 * builder monta encima la capa editorial —cabecera, fecha, número de slide,
 * headline, dato + delta, subcopy y fuente— en la zona segura que el slide
 * declaró (`text_safe_area`, sección 55), con el ADN visual de News: blanco
 * dominante, navy en tipografía, turquesa de acento y coral solo para riesgo.
 *
 * Devuelve un documento HTML autónomo, del mismo estilo que `buildBrandLayerHtml`,
 * para previsualizar en iframe y renderizar a PNG/PDF con el mismo servidor de
 * render que ya usa el carrusel. Un solo builder = preview y export no divergen.
 */

// ADN de color de News (mismos hex que la marca: turquesa/coral del image agent).
const NAVY = '#0A2540';
const TURQUOISE = '#2ED4C7';
const CORAL = '#FF7A4A';
const INK = '#3A4450';
const MUTED = '#6B7683';

export interface NewsSlideHtmlInput {
  /** URL pública o data URL de la escena generada. */
  imageUrl: string;
  width: number;
  height: number;
  /** Rótulo de categoría (turquesa, mayúsculas). Ej: "BONOS / TESORO". */
  eyebrow: string;
  headline: string;
  subcopy: string;
  /** Dato principal, ej "$16.9083" o "4.36%". */
  keyData: string;
  /** Delta secundario, ej "-0.04 pp" o "+1.2%". Colorea coral si es negativo. */
  delta?: string;
  /** Fuente(s), ej "Investing.com México". */
  source: string;
  /** Fecha ya formateada, ej "22 AGO 2026". */
  dateLabel: string;
  slideNumber: number;
  totalSlides: number;
  /** Zona segura declarada por el resolver. Solo left/right cambian el layout. */
  textSafeArea: string;
  /** El cierre (Xending View) usa el rótulo XENDING VIEW. */
  isExecutiveWrap?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Headline con sus saltos de línea respetados (sección editorial). */
function headlineHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

/** El delta es coral cuando baja / presiona; turquesa cuando sube. */
function deltaColor(delta: string): string {
  const t = delta.trim();
  if (/^-/.test(t) || /baj|cae|pierde|presi|riesg/i.test(t)) return CORAL;
  return TURQUOISE;
}

function deltaArrow(delta: string): string {
  const t = delta.trim();
  if (/^-/.test(t)) return '▼ ';
  if (/^\+/.test(t)) return '▲ ';
  return '';
}

export function buildNewsSlideHtml(input: NewsSlideHtmlInput): string {
  const {
    imageUrl,
    width,
    height,
    eyebrow,
    headline,
    subcopy,
    keyData,
    delta,
    source,
    dateLabel,
    slideNumber,
    totalSlides,
    textSafeArea,
    isExecutiveWrap,
  } = input;

  // Executive wrap (Xending View) siempre lleva el texto a la izquierda,
  // sin importar qué text_safe_area haya quedado resuelta (sección 44):
  // el archetype pide la escena a la derecha, así que esto no puede depender
  // de una resolución vieja o de un valor inesperado del modelo.
  const onRight = !isExecutiveWrap && (textSafeArea === 'right' || textSafeArea === 'upper_right');
  const pad = Math.round(width * 0.06);

  // Métricas proporcionales al lienzo.
  const headlineFont = Math.round(width * 0.062);
  const eyebrowFont = Math.max(11, Math.round(width * 0.016));
  const subFont = Math.max(12, Math.round(width * 0.02));
  const dataFont = Math.round(width * 0.055);
  const metaFont = Math.max(10, Math.round(width * 0.014));

  // Scrim: degradado blanco del lado del texto para garantizar legibilidad
  // sobre la escena, sin tapar el lado visual. El bloque de texto llega hasta
  // ~56% del ancho (pad + max-width 50%), así que el velo debe seguir opaco
  // hasta ahí antes de empezar a desvanecerse; si se apaga antes (como pasaba
  // con el corte a 34–66%), la foto se ve detrás de las últimas palabras.
  const scrim = onRight
    ? `linear-gradient(270deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.94) 50%, rgba(255,255,255,0) 82%)`
    : `linear-gradient(90deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.94) 50%, rgba(255,255,255,0) 82%)`;

  const sideStyle = onRight
    ? `right:${pad}px;left:auto;align-items:flex-end;text-align:right;`
    : `left:${pad}px;right:auto;align-items:flex-start;text-align:left;`;

  const wordmark = 'XENDING NEWS';
  const num = `${String(slideNumber).padStart(2, '0')} / ${String(totalSlides).padStart(2, '0')}`;

  const eyebrowLabel = isExecutiveWrap ? 'XENDING VIEW' : eyebrow;

  const dataBlock = keyData?.trim()
    ? `
      <div style="margin-top:${Math.round(height * 0.03)}px;display:flex;flex-direction:column;gap:2px;">
        <span style="font-family:'Poppins',sans-serif;font-weight:700;font-size:${dataFont}px;color:${NAVY};line-height:1;">${escapeHtml(keyData)}</span>
        ${
          delta?.trim()
            ? `<span style="font-family:'Poppins',sans-serif;font-weight:600;font-size:${metaFont}px;color:${deltaColor(delta)};">${deltaArrow(delta)}${escapeHtml(delta)}</span>`
            : ''
        }
      </div>`
    : '';

  const subBlock = subcopy?.trim()
    ? `<p style="margin:${Math.round(height * 0.02)}px 0 0;font-family:'Poppins',sans-serif;font-weight:400;font-size:${subFont}px;line-height:1.4;color:${INK};max-width:${Math.round(width * 0.42)}px;">${escapeHtml(subcopy)}</p>`
    : '';

  const sourceBlock = source?.trim()
    ? `<div style="position:absolute;bottom:${pad}px;${onRight ? `right:${pad}px;` : `left:${pad}px;`}font-family:'Poppins',sans-serif;font-weight:500;font-size:${metaFont}px;color:${MUTED};">Fuente: ${escapeHtml(source)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; font-family: 'Poppins', Arial, sans-serif; }
  .news-canvas { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: #FFFFFF; }
  .news-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 10; }
  .news-scrim { position: absolute; inset: 0; z-index: 20; background: ${scrim}; }
  .news-layer { position: absolute; inset: 0; z-index: 30; }
</style>
</head>
<body>
  <div class="news-canvas">
    <img class="news-photo" src="${imageUrl}" alt="Escena" />
    <div class="news-scrim"></div>
    <div class="news-layer">
      <!-- Cabecera -->
      <div style="position:absolute;top:${pad}px;left:${pad}px;display:flex;align-items:center;gap:${Math.round(width * 0.012)}px;">
        <span style="font-family:'Poppins',sans-serif;font-weight:700;font-size:${eyebrowFont}px;letter-spacing:0.14em;color:${NAVY};">${wordmark}</span>
        <span style="width:${Math.round(width * 0.05)}px;height:2px;background:${TURQUOISE};display:inline-block;"></span>
      </div>
      <div style="position:absolute;top:${pad}px;right:${pad}px;font-family:'Poppins',sans-serif;font-weight:500;font-size:${metaFont}px;letter-spacing:0.06em;color:${MUTED};">
        ${escapeHtml(dateLabel)}&nbsp;&nbsp;&nbsp;${num}
      </div>

      <!-- Bloque editorial -->
      <div style="position:absolute;top:${Math.round(height * 0.2)}px;${sideStyle}max-width:${Math.round(width * 0.5)}px;display:flex;flex-direction:column;">
        <span style="font-family:'Poppins',sans-serif;font-weight:600;font-size:${eyebrowFont}px;letter-spacing:0.12em;color:${TURQUOISE};margin-bottom:${Math.round(height * 0.015)}px;">${escapeHtml(eyebrowLabel).toUpperCase()}</span>
        <h1 style="margin:0;font-family:'Poppins',sans-serif;font-weight:700;font-size:${headlineFont}px;line-height:1.08;color:${NAVY};">${headlineHtml(headline)}</h1>
        ${dataBlock}
        ${subBlock}
      </div>

      ${sourceBlock}
    </div>
  </div>
</body>
</html>`;
}
