import { getFormatPreset, resolveFormatPlan, type FormatPresetId, type PixelSize } from '../../../supabase/functions/_shared/desaing/formats';

export type DesignFormatGroup = 'social' | 'linkedin' | 'documents';
export interface DesignFormatOption {
  id: FormatPresetId;
  group: DesignFormatGroup;
  label: string;
  canvas: PixelSize;
  /** Single render at `generation_size`, or ultrawide canvases composed from pieces. */
  mode: 'single_image' | 'compose_assets';
}
export const DESIGN_FORMAT_GROUPS: Record<DesignFormatGroup, string> = { social: 'Redes', linkedin: 'LinkedIn', documents: 'Documentos' };
/** Ultrawide covers exceed the 3:1 render limit: render this band, then crop to the final canvas. */
export const COVER_SOURCE_CANVAS: PixelSize = Object.freeze({ width: 1536, height: 512 });
/** Share of the source height that survives the centered crop to `canvas`. */
export function coverVisibleHeight(canvas: PixelSize): number {
  return Math.min(1, COVER_SOURCE_CANVAS.width * canvas.height / canvas.width / COVER_SOURCE_CANVAS.height);
}

// One entry per distinct canvas. Facebook (1200×628) and LinkedIn (1200×627) horizontal
// posts share a single "Horizontal para redes" option on the LinkedIn preset.
const OPTIONS: { id: FormatPresetId; group: DesignFormatGroup; label: string }[] = [
  { id: 'instagram_square', group: 'social', label: 'Post cuadrado' },
  { id: 'instagram_portrait', group: 'social', label: 'Post vertical 4:5' },
  { id: 'instagram_story', group: 'social', label: 'Story / Reel' },
  { id: 'linkedin_landscape', group: 'social', label: 'Horizontal para redes' },
  { id: 'linkedin_personal_cover', group: 'linkedin', label: 'Portada de perfil' },
  { id: 'linkedin_page_cover', group: 'linkedin', label: 'Portada de página de empresa' },
  { id: 'cover_16_9', group: 'documents', label: 'Portada / Banner 16:9' },
  { id: 'page_portrait', group: 'documents', label: 'Página vertical' },
  { id: 'presentation_16_9', group: 'documents', label: 'Diapositiva 16:9' },
];

export const DESIGN_FORMAT_OPTIONS: readonly DesignFormatOption[] = Object.freeze(OPTIONS.map(option => {
  const plan = resolveFormatPlan(option.id), preset = getFormatPreset(option.id);
  if (preset.generation.mode === 'blocked' || preset.generation.mode === 'custom') throw new Error(`format_not_selectable:${option.id}`);
  return Object.freeze({ ...option, canvas: Object.freeze({ ...plan.canvas }), mode: plan.generation_mode });
}));

export function designFormatOption(id: FormatPresetId): DesignFormatOption {
  const found = DESIGN_FORMAT_OPTIONS.find(option => option.id === id);
  if (!found) throw new Error('unknown_design_format');
  return found;
}
