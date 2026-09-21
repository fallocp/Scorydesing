import {
  assertHtmlCompositionResult, CompositionError, type CompositionBox, type HtmlCompositionRequest, type HtmlCompositionResult,
} from '../../../supabase/functions/_shared/desaing/composition';
import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';
import type { PresentationMountedAsset } from './presentationDocument';
import { DESIGN_FONT_OPTIONS } from '../../../supabase/functions/_shared/desaing/compositionFonts';

export type CompositionSlotBinding = { asset: AssetVersion; dataUrl: string; altText: string } | { omitted: true };
export type CompositionSlotBindings = Record<string, CompositionSlotBinding>;
export type CompositionBindings = CompositionSlotBindings;
export interface RenderedHtmlComposition {
  html: string;
  mountedAssets: PresentationMountedAsset[];
  unresolvedSlots: string[];
}
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const styleBox = (box: CompositionBox, z: number) => `position:absolute;left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;z-index:${z};`;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const assetIdentity = (a: AssetVersion, b: AssetVersion) => a.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;
function check(condition: unknown, code: string): asserts condition { if (!condition) throw new CompositionError(code); }

/**
 * Compile a validated composition without provider calls, DOM mutation or external URLs.
 * The caller resolves authorized exact asset bytes and validates/decodes their PNG before binding.
 * Review/hash verification and target revision checking are performed by the apply boundary.
 */
export function renderHtmlComposition(request: HtmlCompositionRequest, result: HtmlCompositionResult,
  bindings: CompositionSlotBindings, options: { allowUnresolved?: boolean } = {}): RenderedHtmlComposition {
  assertHtmlCompositionResult(result, request);
  check(bindings && typeof bindings === 'object' && !Array.isArray(bindings), 'invalid_composition_bindings');
  const spec = result.composition;
  check(Object.keys(bindings).every(key => spec.slots.some(slot => slot.id === key)), 'unknown_composition_slot');
  const unresolvedSlots: string[] = [], mountedAssets: PresentationMountedAsset[] = [];
  const shapes = spec.shapes.map(shape => `<div data-eid="${shape.id}" data-composition-kind="shape" aria-hidden="true" style="${styleBox(shape.box, shape.z_index)}background:${shape.fill};border:${shape.border_width}px solid ${shape.border_color ?? 'transparent'};border-radius:${shape.shape === 'ellipse' ? '50%' : `${shape.radius}px`};"></div>`);
  const images = spec.slots.map(slot => {
    const binding = own(bindings, slot.id) ? bindings[slot.id] : undefined;
    if (binding === undefined) {
      unresolvedSlots.push(slot.id);
      return `<div data-eid="${slot.id}" data-composition-kind="unresolved-slot" role="img" aria-label="${escape(`Pieza pendiente: ${slot.label}`)}" style="${styleBox(slot.box, slot.z_index)}display:flex;align-items:center;justify-content:center;padding:12px;border:2px dashed #64748b;background:#f1f5f9;color:#334155;font:16px Arial;text-align:center;">${escape(`Pieza pendiente: ${slot.label}`)}</div>`;
    }
    check(binding !== null && typeof binding === 'object' && !Array.isArray(binding), 'invalid_composition_binding');
    if ('omitted' in binding) {
      check(binding.omitted === true && Object.keys(binding).length === 1, 'invalid_composition_binding');
      return '';
    }
    check(Object.keys(binding).length === 3 && ['asset', 'dataUrl', 'altText'].every(key => own(binding, key)), 'invalid_composition_binding');
    const { asset, dataUrl, altText } = binding;
    check(asset !== null && typeof asset === 'object' && Object.keys(asset).length === 3
      && ['business_id', 'asset_id', 'version_id'].every(key => own(asset, key) && typeof asset[key as keyof AssetVersion] === 'string'
        && !!asset[key as keyof AssetVersion].trim() && asset[key as keyof AssetVersion].length <= 200
        && !Array.from(asset[key as keyof AssetVersion]).some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)), 'invalid_composition_asset');
    check(asset.business_id === request.context.business_id, 'composition_asset_business_mismatch');
    check(!assetIdentity(asset, request.design_reference), 'composition_reference_is_not_piece');
    // Raster signature and syntax are checked here; the resolver verifies all actual PNG bytes.
    check(typeof dataUrl === 'string' && dataUrl.length <= Math.ceil(8 * 1024 * 1024 / 3) * 4 + 22
      && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(dataUrl), 'invalid_composition_asset_data');
    check(typeof altText === 'string' && altText.length <= 500 && !altText.includes('\0'), 'invalid_composition_asset_alt');
    mountedAssets.push({ element_id: slot.id, asset: { ...asset }, region: { ...slot.box }, fit: slot.fit, alt_text: altText, z_index: slot.z_index });
    return `<img data-eid="${slot.id}" data-composition-kind="image" data-asset-id="${escape(asset.asset_id)}" data-asset-version="${escape(asset.version_id)}" data-mount-x="${slot.box.x}" data-mount-y="${slot.box.y}" data-mount-width="${slot.box.width}" data-mount-height="${slot.box.height}" data-mount-fit="${slot.fit}" data-mount-z-index="${slot.z_index}" src="${dataUrl}" alt="${escape(altText)}" style="${styleBox(slot.box, slot.z_index)}object-fit:${slot.fit};max-width:none;margin:0;transform:none;" />`;
  });
  check(options.allowUnresolved || !unresolvedSlots.length, 'composition_slots_unresolved');
  const texts = spec.texts.map(element => {
    const copy = request.copy.blocks.find(block => block.id === element.copy_id)!;
    const tag = copy.role === 'title' ? 'h1' : copy.role === 'stat' ? 'strong' : 'p';
    const font = DESIGN_FONT_OPTIONS.find(option => option.family === element.font_family)!;
    return `<${tag} data-eid="${element.id}" data-composition-kind="text" data-copy-id="${copy.id}" style="${styleBox(element.box, element.z_index)}font-family:'${element.font_family}',${font.fallback};font-size:${element.font_size}px;font-weight:${element.font_weight};line-height:1.18;white-space:pre-wrap;overflow-wrap:break-word;text-align:${element.align};color:${element.color};margin:0;">${escape(copy.text)}</${tag}>`;
  });
  const families = DESIGN_FONT_OPTIONS.filter(font => font.google && spec.texts.some(text => text.font_family === font.family))
    .map(font => `family=${font.google}`).join('&');
  const fonts = families ? `<link rel="stylesheet" href="${escape(`https://fonts.googleapis.com/css2?${families}&display=swap`)}" />` : '';
  // Leaves alone carry data-eid: VisualDesignEditor treats those nodes as atomic.
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data:; font-src https://fonts.gstatic.com; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" />
${fonts}
<style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:${spec.canvas.width}px;height:${spec.canvas.height}px;background:${spec.background}}.lab-canvas{position:relative;width:${spec.canvas.width}px;height:${spec.canvas.height}px;overflow:hidden;background:${spec.background}}</style>
</head><body><main class="lab-canvas" data-copy-version="${request.copy.version_id}" data-composition-version="1">
${[...shapes, ...images, ...texts].filter(Boolean).join('\n')}
</main></body></html>`;
  return { html, mountedAssets, unresolvedSlots };
}
