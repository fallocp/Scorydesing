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
  /** Canvas size — use the image's natural pixel size. */
  width: number
  height: number
  logoUrl?: string | null
  disclaimer?: string | null
  /** 'dark' = dark text for light pieces (default). 'light' = white text. */
  disclaimerTheme?: 'dark' | 'light'
  promoter?: PromoterOverlayInput | null
  cover?: BottomCoverInput | null
}

/** Editable/draggable elements exposed to VisualDesignEditor for this layer. */
export const BRAND_LAYER_ELEMENTS: ElementDef[] = [
  { id: 'piece-photo', label: 'Imagen base', emoji: '🖼️', color: '#14B8A6', selector: '.piece-photo', editable: false, draggable: false },
  { id: 'bottom-cover', label: 'Tapa inferior', emoji: '🩹', color: '#94A3B8', selector: '.bottom-cover', editable: false, draggable: true, kind: 'shape' },
  { id: 'brand-logo', label: 'Logo', emoji: '🎨', color: '#8B5CF6', selector: '.brand-logo', editable: false, draggable: true, kind: 'image' },
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
    logoUrl,
    disclaimer,
    disclaimerTheme = 'dark',
    promoter,
    cover,
  } = input

  // Proportional metrics (percentages of canvas width).
  const pad = Math.round(width * 0.04)
  const logoWidth = Math.round(width * 0.16)
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

  const logoBlock = logoUrl
    ? `
    <img
      class="brand-logo"
      src="${logoUrl}"
      alt="Logo"
      style="position:absolute;left:${pad}px;top:${pad}px;width:${logoWidth}px;height:auto;object-fit:contain;z-index:30;"
    />`
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
      style="position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;font-family:'Inter',sans-serif;font-size:${discFont}px;font-weight:400;line-height:1.35;color:${discColor};text-shadow:${discShadow};text-align:left;z-index:30;"
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
  .brand-canvas { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: #FFFFFF; }
  .piece-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 10; }
</style>
</head>
<body>
  <div class="brand-canvas">
    <img class="piece-photo" src="${imageUrl}" alt="Pieza" />${coverBlock}${logoBlock}${promoterBlock}${disclaimerBlock}
  </div>
</body>
</html>`
}
