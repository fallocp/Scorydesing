/**
 * Kit de objetos del Daily Report FX.
 *
 * Los objetos de apoyo son RECURRENTES: se generan UNA vez con el image designer,
 * se guardan en Storage con nombre fijo, y cada reporte diario reutiliza esos
 * mismos PNGs en slots fijos del layout. Así el texto HTML nunca se desalinea.
 *
 * Ruta determinística por `business + object_id`
 * (`design-images/{businessId}/fx-kit/{id}.png`) → sin tabla.
 *
 * Convenciones acordadas con el usuario:
 *  - Dial de variación y compás de tendencia son INSTRUMENTOS REALES con 3 variantes
 *    por dirección. La dirección se lee por la POSICIÓN DE LA AGUJA, nunca por una
 *    flecha/símbolo (regla dura: si al quitar el símbolo el objeto deja de comunicar,
 *    hay que rediseñarlo). Acentos: SUBE = turquesa, BAJA = coral, LATERAL = navy.
 *    Nada de verde/rojo semáforo. El reporte elige la variante según el dato.
 *  - La pizarra muestra una GRÁFICA + "USD/MXN", SIN precio (ningún número de
 *    referencia se hornea; el valor va en HTML).
 *  - "En la Mira" usa minis GENÉRICOS por categoría (reutilizables entre temas).
 */

export type FxKitObjectId =
  | 'hero'
  | 'price_card'
  // Dial de variación — 3 variantes por dirección.
  | 'dial_up'
  | 'dial_down'
  | 'dial_flat'
  | 'range_instrument'
  // Compás de tendencia — 3 variantes por dirección.
  | 'compass_up'
  | 'compass_down'
  | 'compass_flat'
  | 'flag_mx'
  | 'flag_us'
  | 'entorno_globe'
  | 'magnifier'
  | 'escenario_instrument'
  // Minis de "En la Mira" por categoría (genéricos).
  | 'mira_central_bank'
  | 'mira_fiscal'
  | 'mira_geopolitics'
  | 'mira_trade'
  | 'mira_energy'
  | 'mira_data'
  | 'mira_generic';

// FxMiraCategory es canónico en los tipos edge (lo usa el report); se reexporta
// aquí por conveniencia.
export type { FxMiraCategory } from '../../../supabase/functions/_shared/fx-daily/fx-daily-types';
import type { FxMiraCategory } from '../../../supabase/functions/_shared/fx-daily/fx-daily-types';

/** Mini del kit que corresponde a cada categoría. */
export const FX_MIRA_CATEGORY_OBJECT: Record<FxMiraCategory, FxKitObjectId> = {
  central_bank: 'mira_central_bank',
  fiscal: 'mira_fiscal',
  geopolitics: 'mira_geopolitics',
  trade: 'mira_trade',
  energy: 'mira_energy',
  data: 'mira_data',
  generic: 'mira_generic',
};

export interface FxKitObject {
  id: FxKitObjectId;
  label: string;
  /** Prompt de generación (una sola vez). Fondo blanco, sin texto/número legible. */
  prompt: string;
}

/**
 * Estilo base — condensa el master "Xending Physical Editorial Objects":
 * OBJETO REAL PRIMERO. Miniatura editorial hiperreal fotografiada como producto
 * real en set blanco premium (≈90% foto de objeto real + 10% abstracción Xending
 * contenida). NUNCA un icono renderizado en metal/vidrio.
 */
const KIT_STYLE =
  'A small, physically believable premium editorial miniature for Xending financial research, photographed as a real manufactured object, instrument or document on a bright white studio set. Extremely bright high-key, pure cool-white seamless background, soft daylight plus subtle studio fill, realistic reflections and soft contact shadows, physically accurate scale, premium industrial-design quality, centered with generous negative space, slightly elevated three-quarter angle. ' +
  'Light cool-neutral materials: bright satin/brushed aluminum that reads almost white-silver, pale satin steel for fine mechanisms, matte cool-white ceramic, premium white paper with real thickness, real woven fabric for flags, and clear optical glass where the real object naturally has a lens. ' +
  'Restrained Xending turquoise (#2ED4C7) accent for favorable direction and restrained coral (#FF7A4A) for adverse movement, as a minor physical accent. No readable text or numbers.';

/**
 * Prefijo maestro común (lo dio el usuario) para que TODOS los objetos salgan en
 * la misma familia visual: miniatura editorial premium, foto real, no icono.
 */
const MASTER_PREFIX =
  'Photograph the object as a premium editorial miniature on a bright white studio set. Use cool-white lighting, soft daylight, very soft contact shadows, realistic reflections, physically accurate materials, generous negative space, and a refined high-end financial editorial aesthetic. The object must look like a real manufactured object, not an icon.';

/**
 * Instrumento analógico de precisión (dial de variación) — prompt refinado por el
 * usuario. La dirección se lee sobre todo por la POSICIÓN DE LA AGUJA; se permite
 * UN marcador direccional integrado, muy discreto y secundario. Regla dura: el
 * objeto debe seguir teniendo sentido como instrumento real si se quita el marcador.
 * VARIACIÓN es el que más se iba a "icono premium/puck", por eso el anti-puck es fuerte.
 */
function dialPrompt(direction: 'up' | 'down' | 'flat'): string {
  const marker =
    direction === 'up'
      ? 'The needle sits moderately ABOVE the neutral center. Optionally a single, extremely restrained integrated upward dial marking in Xending turquoise (#2ED4C7), secondary to the instrument. No green, no giant arrow.'
      : direction === 'down'
        ? 'The needle sits moderately BELOW the neutral center. Optionally a single, extremely restrained integrated downward dial marking in Xending coral (#FF7A4A), secondary to the instrument. No red, no giant arrow.'
        : 'The needle rests exactly at the neutral center. No directional marker; a tiny restrained dark-navy (#0A2540) accent on the needle tip only.';
  return `${MASTER_PREFIX}

Create a small premium hyper-realistic financial editorial object for Xending representing "Variación". Design a physically believable miniature analog movement indicator, like a real precision laboratory gauge or compact mechanical measuring instrument, photographed on a bright white editorial studio set. It must NOT look like an icon, button, puck, token, badge, coin, app icon, or a metallic disc with a printed arrow — it must look like a real manufactured precision device with functional construction.

Construction: compact circular precision indicator, shallow cylindrical housing, bright satin aluminum body almost white-silver, cool-white dial face, genuine optical glass cover with realistic thickness, fine engraved calibration tick marks, physically accurate central pivot and a real needle, subtle machining details, realistic edge bevel, soft contact shadow, plausible thickness and proportions, slightly elevated three-quarter angle.

Direction is expressed primarily by the physical needle position. ${marker} The object must still make sense as a real instrument if the marker is removed; realism and meaning come from the construction, not from a symbol.

Do not make it a push-button, glossy UI icon, toy, transparent-glass main body, acrylic button geometry, floating arrow or generic icon-pack style. No readable text, no numbers.`;
}

/**
 * Compás de tendencia (instrumento real) — prompt refinado por el usuario. La
 * dirección la da la AGUJA; acento turquesa (favorable) / coral (adverso) / navy
 * (lateral). Nada de icono de brújula ni botón.
 */
function compassPrompt(direction: 'up' | 'down' | 'flat'): string {
  const cfg =
    direction === 'up'
      ? { n: 'pointing clearly upward (toward north)', c: 'restrained Xending turquoise (#2ED4C7)' }
      : direction === 'down'
        ? { n: 'pointing clearly downward (toward south)', c: 'restrained Xending coral (#FF7A4A)' }
        : { n: 'resting sideways / horizontal', c: 'restrained dark-navy (#0A2540)' };
  return `${MASTER_PREFIX}

Create a small premium hyper-realistic editorial object for Xending representing "Tendencia": a real precision compass-like directional instrument, a high-end compact desk instrument — not an icon. Construction: small precision compass, bright satin aluminum or pale stainless-steel body, clean white dial, genuine optical glass lens with realistic thickness, realistic metallic rim, subtle engraved directional markings, physically plausible needle pivot, premium industrial-design finish, realistic object depth, slightly elevated three-quarter angle.

The thin needle is ${cfg.n}, with a tiny ${cfg.c} accent on the needle. The object communicates trend / directional bias only through the real needle position — not a decorative compass symbol.

Do not make it an app-icon, generic compass icon, thick pedestal, floating object, exaggerated glossy styling, oversized turquoise, toy-like proportions or fake futuristic interface. No numbers, no readable text.`;
}

/**
 * Prompt del HERO (escena fotográfica, no objeto aislado). Se genera una vez y
 * queda fijo arriba a la derecha. El chart del monitor es decorativo; el TC real
 * y editable va en HTML. Deja el lado izquierdo despejado para el texto.
 */
const HERO_PROMPT =
  'Hyper-realistic editorial photograph of a premium institutional financial research desk, shot for a high-end business publication. Bright white-dominant high-key scene by a large window with a softly-blurred modern city skyline. On a clean white desk: a professional desktop monitor showing a clean intraday USD/MXN line chart (thin blue/turquoise trajectory on a white screen, pale gray grid), a signature CLEAR GLASS globe with etched pale continents on a thin elegant base, a printed white research document, a premium pen, a white ceramic cup and 2–3 white research books. The scene is arranged to the RIGHT half of the frame; the LEFT half is clean empty white negative space (for text added later). Soft daylight, gentle shadows, realistic reflections, shallow depth of field, real materials. Restrained turquoise (#2ED4C7) chart accent only. No baked headline/body text, no logos, no icons, no cartoon 3D, no dark fintech styling, no people.';

export const FX_KIT: FxKitObject[] = [
  {
    id: 'hero',
    label: 'Hero (escena superior)',
    prompt: HERO_PROMPT,
  },
  {
    id: 'price_card',
    label: 'Pizarra (gráfica USD/MXN)',
    prompt: `A small premium desktop display card on a thin satin-aluminum stand. The white card face shows a clean intraday LINE CHART in soft blue/turquoise (#2ED4C7) with a pale gray baseline, and the label "USD/MXN" at the top in small dark-navy type. IMPORTANT: no price number, no digits, no quote anywhere — only the "USD/MXN" label and the chart line. ${KIT_STYLE}`,
  },
  { id: 'dial_up', label: 'Dial variación · sube (turquesa)', prompt: dialPrompt('up') },
  { id: 'dial_down', label: 'Dial variación · baja (coral)', prompt: dialPrompt('down') },
  { id: 'dial_flat', label: 'Dial variación · lateral (neutral)', prompt: dialPrompt('flat') },
  {
    id: 'range_instrument',
    label: 'Riel de rango',
    prompt: `A calibrated range instrument: a small measurement rail / stepped levels in matte white ceramic and bright satin aluminum, with a tiny turquoise (#2ED4C7) marker. Communicates bounded movement between two levels. No numbers, no text. ${KIT_STYLE}`,
  },
  { id: 'compass_up', label: 'Compás tendencia · arriba (turquesa)', prompt: compassPrompt('up') },
  { id: 'compass_down', label: 'Compás tendencia · abajo (coral)', prompt: compassPrompt('down') },
  { id: 'compass_flat', label: 'Compás tendencia · lateral (neutral)', prompt: compassPrompt('flat') },
  {
    id: 'flag_mx',
    label: 'Bandera México',
    prompt: `A small realistic Mexican desk flag in real fabric on a slim bright metal pole and base, official Mexican flag colors, gentle fabric folds. Not inside glass. ${KIT_STYLE}`,
  },
  {
    id: 'flag_us',
    label: 'Bandera EE.UU.',
    prompt: `A small realistic U.S. desk flag in real fabric on a slim bright metal pole and base, official U.S. flag colors, gentle fabric folds. Not inside glass. ${KIT_STYLE}`,
  },
  {
    id: 'entorno_globe',
    label: 'Globo entorno (secundario)',
    prompt: `${MASTER_PREFIX}

Create a small premium hyper-realistic editorial object for Xending representing "Entorno Global": a small physically believable global macro desk sculpture / analytical miniature. This is a SECONDARY object, not the main hero globe — keep it small, restrained and physically credible. Construction: small desktop globe sculpture, optically clear or lightly frosted glass sphere with subtle internal refraction, pale cool-white etched continents, a small pale satin-metal or cool-white base, very clean geometric finish, realistic optical behavior and contact shadow. Glass is acceptable here because the object is naturally a glass globe.

Do not make it large, do not turn it into the hero object, no glowing routes, no neon, no cyber/fintech look, no dark pedestal, no stock globe icon, no arrows or symbols. No readable text.`,
  },
  {
    id: 'magnifier',
    label: 'Lupa (lectura clave)',
    prompt: `A real magnifying glass with a pale satin-metal frame and real optical glass lens, resting naturally over a blank white printed document (illegible abstract print only). Macro editorial look. ${KIT_STYLE}`,
  },
  {
    id: 'escenario_instrument',
    label: 'Instrumento escenario central',
    prompt: `A precision measurement slider / calibrated engineering instrument in pale satin aluminum with a white calibrated surface and a tiny turquoise (#2ED4C7) marker. Not a gauge, not a target, no glass, no numbers. ${KIT_STYLE}`,
  },
  // --- Minis "En la Mira" por categoría (genéricos) ---
  {
    id: 'mira_central_bank',
    label: 'Mini · Banco central',
    prompt: `A tiny premium miniature of a neoclassical central-bank building in white stone / matte cool-white ceramic, very small and secondary. No text. ${KIT_STYLE}`,
  },
  {
    id: 'mira_fiscal',
    label: 'Mini · Fiscal / Tesoro / bonos',
    prompt: `A tiny neat stack of official-looking white treasury / bond documents (blank, illegible abstract print), premium paper. No readable text. ${KIT_STYLE}`,
  },
  {
    id: 'mira_geopolitics',
    label: 'Mini · Geopolítica / región',
    prompt: `A tiny matte white ceramic regional geographic relief fragment, pale cool-white, subtle turquoise (#2ED4C7) micro-accent. Very small. No text. ${KIT_STYLE}`,
  },
  {
    id: 'mira_trade',
    label: 'Mini · Comercio / acuerdo',
    prompt: `A tiny printed trade-agreement / customs manifest, folded premium white paper (blank, illegible print). Very small. No readable text. ${KIT_STYLE}`,
  },
  {
    id: 'mira_energy',
    label: 'Mini · Energía / commodities',
    prompt: `A tiny premium miniature energy/commodity sample — a small satin-metal barrel or a pale ceramic mineral block — clean and secondary. No text. ${KIT_STYLE}`,
  },
  {
    id: 'mira_data',
    label: 'Mini · Datos / indicador',
    prompt: `A tiny premium miniature data sheet / small chart card in white paper with a thin turquoise (#2ED4C7) chart line (no numbers). Very small and secondary. No readable text. ${KIT_STYLE}`,
  },
  {
    id: 'mira_generic',
    label: 'Mini · Genérico (fallback)',
    prompt: `A tiny premium neutral document / white paper note (blank, illegible abstract print), clean and secondary. No readable text. ${KIT_STYLE}`,
  },
];

const KIT_BUCKET = 'design-images';

/** Ruta determinística del objeto en Storage. */
export function fxKitStoragePath(businessId: string, id: FxKitObjectId): string {
  return `${businessId}/fx-kit/${id}.png`;
}

/** URL pública determinística (existe tras generarse una vez). */
export function fxKitPublicUrl(publicBase: string, businessId: string, id: FxKitObjectId): string {
  return `${publicBase}/storage/v1/object/public/${KIT_BUCKET}/${fxKitStoragePath(businessId, id)}`;
}

export { KIT_BUCKET as FX_KIT_BUCKET };
