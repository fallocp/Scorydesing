/**
 * Brand layer — builds the HTML document that composites brand elements on top
 * of an already generated mockup: logo, legal disclaimer and an optional
 * promoter (person) block.
 *
 * The generated image itself is never modified. This layer is what feeds
 * `VisualDesignEditor` (drag/resize/edit) and then the Puppeteer render server
 * to produce the final PNG.
 *
 * Everything is sized as a percentage of the canvas width, so the same builder
 * works for a 1024x1536 story, a 1024x1024 post or a 1536x1024 banner without
 * per-format tuning.
 *
 * Class names are deliberately reused from the renderer templates
 * (`.promoter-overlay`, `.promoter-photo`, `.promoter-name`, `.promoter-role`)
 * so the editor's built-in element definitions already recognise them.
 */

import type { ElementDef } from '@/components/VisualDesignEditor'

export interface PromoterOverlayInput {
  photoUrl: string
  fullName: string
  role?: string | null
}

/**
 * Opaque band painted over the bottom of the image to hide the disclaimer the
 * model baked into older mockups. On the flat white pieces this is visually
 * identical to erasing it, with no invented pixels.
 */
export interface BottomCoverInput {
  /** Band height as a percentage of the canvas height. */
  heightPct: number
  /** Fill color — sampled from the image, white by default. */
  color: string
}

export interface BrandLayerInput {
  /** Public URL (or data URL) of the generated mockup. */
  imageUrl: string
  /**
   * Canvas size. Defaults to the image's natural pixel size; set it to the
   * platform's canonical size to letterbox the piece into that format.
   */
  width: number
  height: number
  /**
   * How the base image fills the canvas.
   * - 'cover' (default): canvas matches the image, nothing is scaled or cut.
   * - 'contain': the whole image fits and the leftover shows as bands of
   *   `canvasBackground`. Never crops.
   */
  imageFit?: 'cover' | 'contain'
  /** Canvas background — what the bands look like when fitting to a format. */
  canvasBackground?: string
  logoUrl?: string | null
  /** Brand name rendered next to the symbol, like the presentation lockup. */
  wordmark?: string | null
  disclaimer?: string | null
  /** 'dark' = dark text for light pieces (default). 'light' = white text. */
  disclaimerTheme?: 'dark' | 'light'
  promoter?: PromoterOverlayInput | null
  cover?: BottomCoverInput | null
  /** Overrides the default logo box. */
  logoBox?: { width: number; height: number }
  /** Overrides the default wordmark size. */
  wordmarkFontPx?: number
}

/**
 * Lockup defaults, in absolute px, taken from the sizing the team settled on in
 * the editor (logo 212x109, wordmark 68px, no gap between them). Absolute
 * instead of proportional on purpose: the mockups only range from 1024 to
 * 1536 px wide, and a predictable lockup beats one that shifts per format.
 */
const DEFAULT_LOGO_BOX = { width: 212, height: 109 }
const DEFAULT_WORDMARK_FONT_PX = 68
const DEFAULT_LOCKUP_GAP_PX = 0

/** Editable/draggable elements exposed to VisualDesignEditor for this layer. */
export const BRAND_LAYER_ELEMENTS: ElementDef[] = [
  { id: 'piece-photo', label: 'Imagen base', emoji: '🖼️', color: '#14B8A6', selector: '.piece-photo', editable: false, draggable: false },
  { id: 'bottom-cover', label: 'Tapa inferior', emoji: '🩹', color: '#94A3B8', selector: '.bottom-cover', editable: false, draggable: true, kind: 'shape' },
  { id: 'brand-lockup', label: 'Lockup (logo + nombre)', emoji: '🏷️', color: '#8B5CF6', selector: '.brand-lockup', editable: false, draggable: true },
  { id: 'brand-logo', label: 'Logo', emoji: '🎨', color: '#8B5CF6', selector: '.brand-logo', editable: false, draggable: true, kind: 'image' },
  { id: 'brand-wordmark', label: 'Nombre de marca', emoji: '✒️', color: '#6366F1', selector: '.brand-wordmark', editable: true, draggable: true, kind: 'text' },
  { id: 'brand-disclaimer', label: 'Disclaimer', emoji: '⚖️', color: '#CA8A04', selector: '.brand-disclaimer', editable: true, draggable: true, kind: 'text' },
  { id: 'promoter', label: 'Promotor', emoji: '👤', color: '#14B8A6', selector: '.promoter-overlay', editable: false, draggable: true },
  { id: 'promoter-name', label: 'Nombre', emoji: '✏️', color: '#0D9488', selector: '.promoter-name', editable: true, draggable: false, kind: 'text' },
  { id: 'promoter-role', label: 'Rol', emoji: '✏️', color: '#0D9488', selector: '.promoter-role', editable: true, draggable: false, kind: 'text' },
]

/** Minimal HTML escaping — the disclaimer is user text injected into the iframe. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildBrandLayerHtml(input: BrandLayerInput): string {
  const {
    imageUrl,
    width,
    height,
    imageFit = 'cover',
    canvasBackground = '#FFFFFF',
    logoUrl,
    wordmark,
    disclaimer,
    disclaimerTheme = 'dark',
    promoter,
    cover,
    logoBox = DEFAULT_LOGO_BOX,
    wordmarkFontPx = DEFAULT_WORDMARK_FONT_PX,
  } = input

  // Proportional metrics (percentages of canvas width).
  const pad = Math.round(width * 0.04)
  const discFont = Math.max(11, Math.round(width * 0.0155))
  const nameFont = Math.max(12, Math.round(width * 0.019))
  const roleFont = Math.max(10, Math.round(width * 0.015))
  const photoSize = Math.round(width * 0.075)

  const discColor = disclaimerTheme === 'light' ? '#FFFFFF' : '#3A4450'
  const discShadow =
    disclaimerTheme === 'light' ? '0 1px 2px rgba(0,0,0,0.45)' : 'none'

  // Sits above the photo (z 10) and below every brand element (z 30), so the
  // new disclaimer reads on top of the patch.
  const coverBlock =
    cover && cover.heightPct > 0
      ? `
    <div
      class="bottom-cover"
      style="position:absolute;left:0;right:0;bottom:0;height:${Math.round((height * cover.heightPct) / 100)}px;background:${cover.color};z-index:20;"
    ></div>`
      : ''

  // Logo and brand name travel together in a lockup, same as the presentation
  // templates (`.logo-row` + `.wordmark`), so dragging moves both at once.
  const logoImg = logoUrl
    ? `<img class="brand-logo" src="${logoUrl}" alt="Logo" style="width:${logoBox.width}px;height:${logoBox.height}px;object-fit:contain;" />`
    : ''

  const wordmarkSpan = wordmark?.trim()
    ? `<span class="brand-wordmark" style="font-family:'Poppins','Inter',sans-serif;font-size:${wordmarkFontPx}px;font-weight:600;letter-spacing:-0.02em;color:#0F1419;line-height:1;white-space:nowrap;">${escapeHtml(wordmark.trim())}</span>`
    : ''

  const logoBlock =
    logoImg || wordmarkSpan
      ? `
    <div
      class="brand-lockup"
      style="position:absolute;left:${pad}px;top:${pad}px;display:flex;align-items:center;gap:${DEFAULT_LOCKUP_GAP_PX}px;z-index:30;"
    >${logoImg}${wordmarkSpan}</div>`
      : ''

  const promoterBlock = promoter
    ? `
    <div
      class="promoter-overlay"
      style="position:absolute;right:${pad}px;bottom:${pad + discFont * 3}px;display:flex;align-items:center;gap:${Math.round(photoSize * 0.25)}px;z-index:30;"
    >
      <img
        class="promoter-photo"
        src="${promoter.photoUrl}"
        alt=""
        style="width:${photoSize}px;height:${photoSize}px;border-radius:50%;object-fit:cover;"
      />
      <div style="display:flex;flex-direction:column;gap:2px;text-align:left;">
        <span class="promoter-name" style="font-size:${nameFont}px;font-weight:600;color:#0F1419;line-height:1.2;">${escapeHtml(promoter.fullName)}</span>
        ${promoter.role ? `<span class="promoter-role" style="font-size:${roleFont}px;font-weight:400;color:#6B7683;line-height:1.2;">${escapeHtml(promoter.role)}</span>` : ''}
      </div>
    </div>`
    : ''

  const disclaimerBlock = disclaimer?.trim()
    ? `
    <div
      class="brand-disclaimer"
      style="position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;font-family:'Inter',sans-serif;font-size:${discFont}px;font-weight:400;line-height:1.35;color:${discColor};text-shadow:${discShadow};text-align:center;z-index:30;"
    >${escapeHtml(disclaimer.trim())}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #FFFFFF; }
  .brand-canvas { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: ${canvasBackground}; }
  .piece-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: ${imageFit}; z-index: 10; }
</style>
</head>
<body>
  <div class="brand-canvas">
    <img class="piece-photo" src="${imageUrl}" alt="Pieza" />${coverBlock}${logoBlock}${promoterBlock}${disclaimerBlock}
  </div>
</body>
</html>`
}

export interface BrandLayerPatch {
  logoUrl?: string | null
  wordmark?: string | null
  disclaimer?: string | null
}

/**
 * Swap the logo, the brand name or the legal text on an ALREADY EDITED layer.
 *
 * Rebuilding the document would throw away everything dragged or resized in the
 * editor, so these are surgical replacements: only the `src` of `.brand-logo`
 * and the text inside `.brand-wordmark` / `.brand-disclaimer` change. Position,
 * size and typography stay exactly as the user left them.
 *
 * `missing` lists the targets that were not present (e.g. swapping a logo into
 * a layer that was built without one), so the caller can fall back to a rebuild.
 */
export function patchBrandLayerHtml(
  html: string,
  patch: BrandLayerPatch,
): { html: string; missing: Array<keyof BrandLayerPatch> } {
  let next = html
  const missing: Array<keyof BrandLayerPatch> = []

  if (patch.logoUrl !== undefined) {
    const tagRe = /<img[^>]*class="[^"]*brand-logo[^"]*"[^>]*>/
    const tag = next.match(tagRe)?.[0]
    if (tag && patch.logoUrl) {
      next = next.replace(tagRe, tag.replace(/src="[^"]*"/, `src="${patch.logoUrl}"`))
    } else {
      missing.push('logoUrl')
    }
  }

  if (patch.wordmark !== undefined) {
    const re = /(<span[^>]*class="[^"]*brand-wordmark[^"]*"[^>]*>)([\s\S]*?)(<\/span>)/
    if (re.test(next)) {
      next = next.replace(re, `$1${escapeHtml((patch.wordmark ?? '').trim())}$3`)
    } else {
      missing.push('wordmark')
    }
  }

  if (patch.disclaimer !== undefined) {
    const re = /(<div[^>]*class="[^"]*brand-disclaimer[^"]*"[^>]*>)([\s\S]*?)(<\/div>)/
    if (re.test(next)) {
      next = next.replace(re, `$1${escapeHtml((patch.disclaimer ?? '').trim())}$3`)
    } else {
      missing.push('disclaimer')
    }
  }

  return { html: next, missing }
}
