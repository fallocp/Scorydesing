import { getSlideDimensions, type PresentationSlide } from './presentationDocument';
import { measureInFrame, type StyleSamples, type RoleSheet } from './styleSpec';
import { DECK_STRUCTURE_LABELS, measureDeckSystem, signatureOf, stratifiedSample, supported, type DeckSystem, type DeckSystemFlags } from './deckSystem';
import { effectiveTokens, runStyleTransfer, syntheticSourceSheet, type StyleTransferReport } from './styleTransfer';

/** «Agregar slide» with the presentation's system: «Nueva con IA», «En blanco» and templates adapted without AI.
 * VITE_DESAING_ADD_SLIDE_NEW=true turns the new options on; any other value keeps the current menu. */
export function isAddSlideNewEnabled(env: Record<string, unknown>): boolean {
  return env.VITE_DESAING_ADD_SLIDE_NEW === 'true';
}
export const NEW_SLIDE_PROMPT = '¿Qué va en esta diapositiva? Escribe el contenido y te propongo el diseño.';

// ── «Usar plantilla tal cual» (remembered in this browser) ───────────────────
export const TEMPLATE_AS_IS_KEY = 'scory-add-slide-template-as-is';
export function readTemplateAsIs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try { return storage?.getItem(TEMPLATE_AS_IS_KEY) === 'true'; } catch { return false; }
}
export function writeTemplateAsIs(value: boolean, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try { storage?.setItem(TEMPLATE_AS_IS_KEY, String(value)); } catch { /* The choice still applies in this session. */ }
}

// ── Empty slide ──────────────────────────────────────────────────────────────
/** No visible text (same test the design workspace uses to start from «presentación» or «nueva» instead of the current slide). */
export const isBlankSlide = (html: string) => !html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, '').trim();
export interface DeckLogo { src: string; alt: string; x: number; y: number; width: number; height: number; slides: number }
export interface SlideBackground { color: string; image: string }
const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i;
const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A measured CSS value never closes the rule or the <style> element.
const cssValue = (value: string) => value.replace(/[<>{}]/g, '').trim();
/** Empty slide of the deck's canvas, with the system's background and, for «En blanco», the deck's logo where the deck puts it. No text. */
export function blankSlideHtml(input: { canvas: { width: number; height: number }; background?: SlideBackground | null; logo?: DeckLogo | null }): string {
  const { width, height } = input.canvas, color = input.background && COLOR.test(input.background.color.trim()) ? input.background.color.trim() : '#FFFFFF';
  const image = input.background?.image && input.background.image !== 'none' ? cssValue(input.background.image) : '';
  const logo = input.logo ? `<img class="scory-deck-logo" src="${attribute(input.logo.src)}" alt="${attribute(input.logo.alt)}" style="position:absolute;`
    + `left:${Math.round(input.logo.x)}px;top:${Math.round(input.logo.y)}px;width:${Math.round(input.logo.width)}px;height:${Math.round(input.logo.height)}px;object-fit:contain">` : '';
  return `<!DOCTYPE html>\n<html lang="es"><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { margin: 0; overflow: hidden; background: ${color}; }
.slide { width: ${width}px; height: ${height}px; position: relative; overflow: hidden; background-color: ${color};${image ? ` background-image: ${image}; background-size: cover;` : ''} }
</style></head><body><div class="slide">${logo}</div></body></html>`;
}
/** The new slide goes right after `index` (the slide on screen), with its own identity. */
export function insertSlideAfter<T>(slides: readonly T[], index: number, item: T): T[] {
  const at = Math.min(Math.max(index, -1), slides.length - 1);
  return [...slides.slice(0, at + 1), item, ...slides.slice(at + 1)];
}
/** Where «Nueva con IA» opens the design: the full screen (VITE_DESAING_DESIGN_SCREEN) on the new slide, otherwise the popup. */
export function newSlideDesignTarget(input: { screen: boolean; index: number; path(slideNumber: number): string }): { kind: 'screen'; path: string } | { kind: 'popup' } {
  return input.screen ? { kind: 'screen', path: input.path(input.index + 1) } : { kind: 'popup' };
}

// ── The presentation's system, only from the open presentation of the active business ──
export type DeckSystemLookup = { system: DeckSystem; flags: DeckSystemFlags } | { system: null; reason: 'off' | 'none' | 'failed' };
/** `key` is `business:presentation`: the system never comes from another business or presentation. Needs ≥2 slides with content. */
export async function deckSystemFor(input: { flags: DeckSystemFlags | undefined; key: string; slides: readonly PresentationSlide[]; current: number;
  measure(html: string): Promise<StyleSamples> }): Promise<DeckSystemLookup> {
  if (!input.flags) return { system: null, reason: 'off' };
  if (input.slides.filter(slide => !isBlankSlide(slide.html)).length < 2) return { system: null, reason: 'none' };
  try {
    const { system } = await measureDeckSystem({ key: input.key, slides: input.slides, current: input.current, measure: input.measure });
    return system && system.slides >= 2 ? { system, flags: input.flags } : { system: null, reason: 'none' };
  } catch { return { system: null, reason: 'failed' }; }
}
/** The deck's most common background (the content slides' one). */
export const deckBackground = (system: DeckSystem | null): SlideBackground | null => {
  const found = system?.tokens.backgrounds[0];
  return found ? { color: found.color, image: found.image } : null;
};

// ── The deck's logo, measured ────────────────────────────────────────────────
const LOGO_WORD = /logo|marca|brand|isotipo|imagotipo/i;
type LogoRect = { x: number; y: number; width: number; height: number; alt: string };
/** Rect of the <img> with exactly `src`, relative to the slide's canvas. */
export function measureLogoIn(html: string, src: string): Promise<LogoRect | null> {
  const canvas = getSlideDimensions(html);
  return measureInFrame(html, canvas, 6000, doc => {
    const root = doc.querySelector('.slide, .lab-canvas') ?? doc.body, origin = root.getBoundingClientRect();
    const image = Array.from(doc.querySelectorAll('img')).find(item => item.getAttribute('src') === src);
    if (!image) return null;
    const rect = image.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height, alt: image.alt } : null;
  });
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
/** The image the deck repeats as its logo (named logo/marca or repeated small near an edge, on ≥2 slides or ≥40 %), at its median position. */
export async function measureDeckLogo(slides: readonly PresentationSlide[], current: number,
  measure: (html: string, src: string) => Promise<LogoRect | null> = measureLogoIn): Promise<DeckLogo | null> {
  const indexes = stratifiedSample(slides, current).filter(index => !isBlankSlide(slides[index].html));
  const parser = new DOMParser(), seen = new Map<string, { slides: number[]; named: boolean }>();
  for (const index of indexes) {
    const doc = parser.parseFromString(slides[index].html, 'text/html'), own = new Set<string>();
    for (const image of Array.from(doc.querySelectorAll('img[src]'))) {
      const src = image.getAttribute('src')!.trim();
      if (!src || own.has(src)) continue;
      own.add(src);
      const found = seen.get(src) ?? { slides: [], named: false };
      found.slides.push(index); found.named ||= LOGO_WORD.test([image.getAttribute('class'), image.id, image.getAttribute('alt'), src.slice(0, 300)].join(' '));
      seen.set(src, found);
    }
  }
  const candidates = [...seen].filter(([, item]) => supported(item.slides.length, indexes.length) && (item.named || item.slides.length >= 2))
    .sort((a, b) => Number(b[1].named) - Number(a[1].named) || b[1].slides.length - a[1].slides.length).slice(0, 2);
  for (const [src, item] of candidates) {
    const canvas = getSlideDimensions(slides[item.slides[0]].html), area = canvas.width * canvas.height;
    const rects = (await Promise.all(item.slides.slice(0, 3).map(index => measure(slides[index].html, src).catch(() => null)))).filter((rect): rect is LogoRect => !!rect);
    // A logo is small; an unnamed repeated image also sits near an edge (an icon in the middle is not a logo).
    const fits = rects.filter(rect => rect.width * rect.height <= area * 0.08 && (item.named || rect.x < canvas.width * 0.2 || rect.y < canvas.height * 0.2
      || rect.x + rect.width > canvas.width * 0.8 || rect.y + rect.height > canvas.height * 0.8));
    if (!fits.length) continue;
    return { src, alt: fits[0].alt || 'Logo', x: median(fits.map(rect => rect.x)), y: median(fits.map(rect => rect.y)),
      width: median(fits.map(rect => rect.width)), height: median(fits.map(rect => rect.height)), slides: item.slides.length };
  }
  return null;
}

// ── Templates adapted to the system, without AI ──────────────────────────────
export interface TemplateAdaptation { html: string; adapted: boolean; notice: string; report?: StyleTransferReport }
const textOf = (html: string) => { const doc = new DOMParser().parseFromString(html, 'text/html');
  return ((doc.querySelector('.slide, .lab-canvas') ?? doc.body).textContent ?? '').replace(/\s+/g, ' ').trim(); };
const listed = (items: readonly string[]) => items.slice(0, 3).join('; ') + (items.length > 3 ? `; y ${items.length - 3} más` : '');
const AS_IS: Record<'off' | 'none' | 'failed', string> = {
  off: 'La inserté tal cual: la detección del estilo de la presentación está apagada.',
  none: 'La inserté tal cual: todavía no hay suficientes diapositivas para reconocer el estilo de la presentación.',
  failed: 'La inserté tal cual: no pude medir el estilo de la presentación.',
};
/** The template keeps its arrangement and its text; the deck's tokens (per arrangement with ≥2 exemplars, like the generator's)
 * are applied and checked (checkTransfer, inside runStyleTransfer). Anything that would change the text or the canvas keeps the original. */
export async function adaptTemplate(input: { html: string; lookup: DeckSystemLookup; canvas: { width: number; height: number };
  position: { index: number; count: number }; brand: string; measureSamples(html: string): Promise<StyleSamples>;
  measureSheet(html: string, brand: string): Promise<RoleSheet> }): Promise<TemplateAdaptation> {
  const original = { html: input.html, adapted: false };
  const lookup = input.lookup;
  if (!('flags' in lookup)) return { ...original, notice: AS_IS[lookup.reason] };
  if (!lookup.flags.tokens) return { ...original, notice: AS_IS.off };
  const size = getSlideDimensions(input.html);
  if (size.width !== input.canvas.width || size.height !== input.canvas.height)
    return { ...original, notice: `La inserté tal cual: la plantilla es de ${size.width}×${size.height} y tu presentación de ${input.canvas.width}×${input.canvas.height}.` };
  const system = lookup.system;
  try {
    const structure = signatureOf(await input.measureSamples(input.html), input.position).structure;
    const own = lookup.flags.arquetipo ? system.archetypes.find(item => item.id === structure && item.tokens) : undefined;
    // A lone cover, section or closing keeps its own background and sizes (same rule as the generator).
    const lone = !own && ['cover', 'section', 'closing'].includes(structure);
    const label = own ? `el sistema de la presentación (acomodo ${DECK_STRUCTURE_LABELS[own.id]}, ${own.members.length} diapositivas)`
      : `el sistema de la presentación (${system.slides} diapositivas)`;
    const { html, report } = await runStyleTransfer({ html: input.html, sourceHtml: '', sourceNumber: 0, request: '', brand: { name: input.brand }, label,
      scale: lone ? {} : effectiveTokens(system, own?.id).scale,
      sourceSheet: target => syntheticSourceSheet(system, { archetype: own?.id, target, keepBackground: lone }), measure: input.measureSheet });
    if (!report.checked) return { ...original, notice: 'La inserté tal cual: no encontré elementos equivalentes que adaptar.', report };
    const after = getSlideDimensions(html);
    if (after.width !== size.width || after.height !== size.height) return { ...original, notice: 'La inserté tal cual: adaptarla cambiaba el tamaño del lienzo.', report };
    if (textOf(html) !== textOf(input.html)) return { ...original, notice: 'La inserté tal cual: adaptarla cambiaba su texto.', report };
    const notice = `Adapté la plantilla al estilo de tu presentación (${report.checked} puntos).`
      + (report.failed.length ? ` No pude aplicar: ${listed(report.failed)}.` : '');
    return { html, adapted: true, notice, report };
  } catch {
    return { ...original, notice: AS_IS.failed };
  }
}
