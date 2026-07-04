/**
 * Image Stock Studio — style/process catalog.
 *
 * Each entry is an image "generator process" with:
 *  - `promptType`: the master_prompts.prompt_type key where its editable prompt
 *    lives (reusable from any process via fetchMasterPromptByType).
 *  - `collection`: the design_images.collection the generated images are filed
 *    into, so they become selectable stock across the app.
 *
 * The existing navy/light_cream "design image" style (insta/linkedin content)
 * is intentionally NOT listed here — it lives in generate-design-image and is
 * left untouched.
 */

export interface ImageStyleDef {
  /** Short stable key, e.g. 'professional'. */
  key: string;
  /** master_prompts.prompt_type where the editable prompt is stored. */
  promptType: string;
  /** design_images.collection the generated images are saved into. */
  collection: string;
  /** UI label (Spanish). */
  label: string;
  /** Short UI description (Spanish). */
  description: string;
  /** Lucide icon name. */
  icon: string;
  /**
   * When true, this style exposes the professional "verticals" + human-presence
   * modules (see constants/professionalVerticals.ts) as selectable context that
   * is injected into the scene before building the final prompt.
   */
  supportsVerticals?: boolean;
}

export const IMAGE_STYLES: ImageStyleDef[] = [
  {
    key: 'professional',
    promptType: 'image_style:professional',
    collection: 'professional',
    label: 'Imágenes profesionales',
    description: 'Fotografía editorial hiperrealista para escenas de negocio.',
    icon: 'Camera',
    supportsVerticals: true,
  },
  {
    key: 'icon_3d',
    promptType: 'image_style:icon_3d',
    collection: 'icon_3d',
    label: 'Iconografía 3D',
    description: 'Render 3D estilo Tesla/Apple: objeto único, fondo limpio.',
    icon: 'Box',
  },
  {
    key: 'slide',
    promptType: 'image_style:slide',
    collection: 'slide',
    label: 'Imágenes para slides',
    description: 'Fondos y heros premium para presentaciones.',
    icon: 'Presentation',
  },
];

/** Look up a style definition by its key. */
export function getImageStyle(key: string): ImageStyleDef | undefined {
  return IMAGE_STYLES.find((s) => s.key === key);
}

/** Look up a style definition by its prompt_type. */
export function getImageStyleByPromptType(promptType: string): ImageStyleDef | undefined {
  return IMAGE_STYLES.find((s) => s.promptType === promptType);
}
