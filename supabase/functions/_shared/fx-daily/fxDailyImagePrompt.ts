/**
 * Prompt del HERO del Daily Report FX.
 *
 * Cambio de enfoque (v3): la AI ya NO genera el póster completo. Genera SOLO la
 * banda superior (el escritorio de investigación: monitor + globo de vidrio +
 * documentos), en formato horizontal, con el sujeto a la DERECHA y luz de ventana
 * suave y limpia a la IZQUIERDA como zona segura de texto.
 *
 * Todo lo demás del reporte (Pulso, drivers, bottom cards) se arma en HTML con el
 * KIT de objetos (imágenes individuales fijas) — ver fxDailyKit.ts / buildFxDailyHtml.
 * Así el texto nunca se encima con los objetos.
 *
 * El monitor hornea su gráfica intradía y SOLO la etiqueta "USD/MXN" — SIN precio
 * ni número (decisión del usuario: ningún precio de referencia se hornea; el valor
 * va siempre en HTML editable).
 */

import type { FxDailyReport } from './fx-daily-types.ts';

export function buildFxDailyImagePrompt(report: FxDailyReport): string {
  const pair = report.pair || 'USD/MXN';

  return `Create the HERO photograph for a premium Xending FX daily editorial — ONLY the top research-desk scene, in a horizontal (landscape) frame. Bright, institutional, hyper-realistic editorial photography.

# SCENE
A real institutional macro research desk photographed by a large window: on the RIGHT, a professional desktop monitor and a signature CLEAR GLASS globe (optically clear glass, etched pale continents, thin elegant base, real refraction and contact shadow — a real desk sculpture, not a 3D icon), plus a printed market-research document and a premium pen. Softly-blurred modern city skyline through the window. One real environment, ray-traced reflections, shallow depth of field.

# COMPOSITION — TEXT-SAFE LEFT
Keep the LEFT ~45% of the frame as bright, clean, softly-blurred window light / negative space with NO objects and NO text — headline and commentary are added later in HTML over that area. Push the monitor, globe and documents to the right half.

# LOOK
White-dominant high-key: 88–92% pure cool white / pale cool gray, bright natural daylight, very soft shadows, extremely clean surfaces. Dark navy only if any typography appears on the monitor. Metals extremely light (bright satin aluminum, pale steel) — no dark metal, no beige/cream/champagne, no dark fintech styling, no dramatic lighting.

# MONITOR (bake this only)
The monitor shows a clean intraday ${pair} chart on a WHITE screen: thin turquoise (#2ED4C7) price trajectory, very pale gray grid, and the label "${pair}" at the top in small dark-navy type. IMPORTANT: NO price number, NO digits, NO quote anywhere on the screen — only the "${pair}" label and the chart line. Real physical screen — no fake Bloomberg UI, no dark trading screen.

# ACCENTS
Only the monitor chart line carries turquoise. Maybe one tiny coral detail. 1–2% total. No glow, no neon.

# NEGATIVE
No baked headline/commentary/labels over the left area, no supporting objects other than the monitor+globe+docs (the price card, dial, compass, flags, etc. are added separately), no icons, no cartoon 3D, no toy objects, no dark background, no beige/cream, no clutter, no people, no faces, no baked Xending logo, no readable text except the monitor screen.

# TARGET
A commissioned institutional research photograph, bright and airy, with a clean text-safe left area — the top band of a premium financial newspaper page.`;
}
