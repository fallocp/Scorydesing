/**
 * Restyle presets — a small, EXTENSIBLE catalog of "styles" applied on top of
 * the active generator's base prompt.
 *
 * They cover two things the user thinks of as one control ("estilo"):
 *  - aesthetic flavor  (Nosotros / Profesional / …)
 *  - reference fidelity (Muy similar / Libre) — only meaningful for
 *    image-to-image, where a reference photo is uploaded.
 *
 * How it works:
 *  - `modifier` is appended (in English) to the scene before the prompt builder
 *    runs, so it steers the final gpt-image-2 prompt.
 *  - `fidelity` hints how close to keep the reference in image-to-image mode.
 *
 * To ADD a new style (e.g. one you found online), just append an entry here:
 *   { key: 'noir', label: 'Cine noir', hint: '…', modifier: '…', fidelity: 'free' }
 * No other file needs to change.
 */

export interface RestylePreset {
  /** Short stable key. */
  key: string;
  /** UI label (Spanish). */
  label: string;
  /** UI helper (Spanish). */
  hint: string;
  /** Style instruction appended to the scene (English). */
  modifier: string;
  /**
   * Image-to-image behavior: 'faithful' keeps the reference subject/composition
   * and only restyles; 'free' allows creative reinterpretation.
   */
  fidelity: 'faithful' | 'free';
}

/** Default style when none is picked. */
export const DEFAULT_RESTYLE_KEY = 'brand';

export const RESTYLE_PRESETS: RestylePreset[] = [
  {
    key: 'brand',
    label: 'Estilo nosotros',
    hint: 'Restyle a la marca Xending (blanco, navy, mint).',
    modifier:
      'Restyle into the Xending brand system: clean white or soft neutral background, navy as the dominant color, subtle mint-turquoise accents, very controlled soft coral only if useful, premium editorial finish. Keep it credible and institutional.',
    fidelity: 'faithful',
  },
  {
    key: 'professional',
    label: 'Profesional',
    hint: 'Fotografía editorial corporativa hiperrealista.',
    modifier:
      'Render as premium hyper-realistic editorial corporate photography: natural light, realistic textures and materials, real proportions, credible business context, clean premium composition. Not AI-looking, not a 3D render.',
    fidelity: 'faithful',
  },
  {
    key: 'faithful',
    label: 'Muy similar',
    hint: 'Conserva la composición del original, solo cambia el acabado.',
    modifier:
      'Keep the SAME subject, composition, camera angle and framing as the reference. Change only styling, materials, colors and finish so it looks on-brand. Do not reinvent or reframe the scene.',
    fidelity: 'faithful',
  },
  {
    key: 'free',
    label: 'Libre',
    hint: 'Reinterpreta el concepto con libertad, on-brand.',
    modifier:
      'Reinterpret the concept freely and creatively while keeping it premium and on-brand. You may change composition, angle, setting and details to produce a stronger image.',
    fidelity: 'free',
  },
];

/** Look up a preset by key. */
export function getRestylePreset(key: string | null | undefined): RestylePreset | undefined {
  return RESTYLE_PRESETS.find((p) => p.key === key);
}
