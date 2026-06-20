/**
 * Layout Variation CSS System
 *
 * Provides CSS-only layout modifiers for the 3 layout variations:
 * - Layout A: Image top, copy bottom (hero → content → CTA) — DEFAULT/current layout
 * - Layout B: Card centered with internal image (logo → card[image+copy] → footer)
 * - Layout C: Split lateral (50/50 or 60/40 image|copy)
 *
 * These are injected as CSS classes on the root element (body or .story).
 * The HTML structure remains the same — only CSS changes.
 *
 * Requirements: Property 5 (Template consistency)
 */

export type LayoutVariation = 'A' | 'B' | 'C';

/**
 * CSS for Layout B — Card centered with internal image.
 * Composition: Logo → Card[Image + Copy side-by-side] → Footer
 *
 * For story/post (vertical): image becomes smaller, sits inside card alongside copy.
 * For linkedin/facebook/banner (horizontal): image moves inside the content area as a thumbnail.
 */
const LAYOUT_B_CSS = `
/* ═══ Layout B: Card centered with internal image ═══ */
/* Story format (1080x1920) */
body.layout-b .story,
.story.layout-b {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
body.layout-b .card,
.story.layout-b .card {
  position: relative;
  top: auto;
  left: auto;
  right: auto;
  margin: 0 50px;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  padding: 48px 56px;
  gap: 24px;
}
body.layout-b .logo-row,
.story.layout-b .logo-row {
  width: 100%;
  margin-bottom: 16px;
}
body.layout-b .photo-wrapper,
.story.layout-b .photo-wrapper {
  width: 45%;
  margin-bottom: 0;
}
body.layout-b .photo,
.story.layout-b .photo {
  height: 500px;
  border-radius: 16px;
}
body.layout-b .headline,
.story.layout-b .headline {
  width: 50%;
  font-size: 52px;
  margin-bottom: 12px;
}
body.layout-b .subcopy,
.story.layout-b .subcopy {
  width: 50%;
  font-size: 22px;
}
body.layout-b .stat-pill,
.story.layout-b .stat-pill {
  width: 100%;
}
body.layout-b .footer,
.story.layout-b .footer {
  position: relative;
  bottom: auto;
  left: auto;
  right: auto;
  margin-top: 40px;
  padding: 0 50px;
}
body.layout-b .punchline,
.story.layout-b .punchline {
  font-size: 40px;
}
`;

/**
 * CSS for Layout C — Split lateral.
 * Composition: 50/50 or 60/40 split (image left, copy right)
 *
 * For story format: top 50% image, bottom 50% content (vertical split).
 * For post format: left/right split within the card.
 * For linkedin/facebook/banner: already split by default (Layout A ≈ Layout C for these).
 */
const LAYOUT_C_CSS = `
/* ═══ Layout C: Split lateral (image|copy) ═══ */
/* Story format (1080x1920) — vertical 50/50 split */
body.layout-c .story,
.story.layout-c {
  display: flex;
  flex-direction: column;
}
body.layout-c .card,
.story.layout-c .card {
  position: relative;
  top: auto;
  left: auto;
  right: auto;
  width: 100%;
  height: 100%;
  border-radius: 0;
  padding: 0;
  display: flex;
  flex-direction: row;
  box-shadow: none;
}
body.layout-c .photo-wrapper,
.story.layout-c .photo-wrapper {
  width: 50%;
  height: 100%;
  margin: 0;
  border-radius: 0;
}
body.layout-c .photo,
.story.layout-c .photo {
  width: 100%;
  height: 100%;
  border-radius: 0;
  object-position: center center;
}
body.layout-c .logo-row,
.story.layout-c .logo-row {
  position: absolute;
  top: 40px;
  left: 52%;
  z-index: 5;
}
body.layout-c .headline,
.story.layout-c .headline {
  position: absolute;
  top: 140px;
  left: 52%;
  right: 40px;
  font-size: 54px;
}
body.layout-c .subcopy,
.story.layout-c .subcopy {
  position: absolute;
  top: 380px;
  left: 52%;
  right: 40px;
  font-size: 22px;
}
body.layout-c .stat-pill,
.story.layout-c .stat-pill {
  display: none;
}
body.layout-c .accent-bar,
.story.layout-c .accent-bar {
  display: none;
}
body.layout-c .footer,
.story.layout-c .footer {
  position: absolute;
  bottom: 60px;
  left: 52%;
  right: 40px;
  text-align: left;
}
body.layout-c .punchline,
.story.layout-c .punchline {
  font-size: 38px;
  text-align: left;
}
body.layout-c .cta,
.story.layout-c .cta {
  font-size: 20px;
}
`;

/**
 * Returns the CSS string for a given layout variation.
 * Layout A returns empty string (it's the default/current layout).
 */
export function getLayoutCSS(layout: LayoutVariation): string {
  switch (layout) {
    case 'A':
      return ''; // Default layout — no overrides needed
    case 'B':
      return LAYOUT_B_CSS;
    case 'C':
      return LAYOUT_C_CSS;
    default:
      return '';
  }
}

/**
 * Returns the CSS class name for a layout variation.
 */
export function getLayoutClass(layout: LayoutVariation): string {
  switch (layout) {
    case 'A':
      return 'layout-a';
    case 'B':
      return 'layout-b';
    case 'C':
      return 'layout-c';
    default:
      return 'layout-a';
  }
}

/**
 * All valid layout variations.
 */
export const ALL_LAYOUTS: LayoutVariation[] = ['A', 'B', 'C'];

/**
 * Layout metadata for UI display.
 */
export const LAYOUT_METADATA: Record<LayoutVariation, { name: string; description: string; emoji: string }> = {
  A: { name: 'Hero Top', description: 'Imagen arriba, copy abajo', emoji: '⬆️' },
  B: { name: 'Card Centrada', description: 'Card con imagen interna', emoji: '🃏' },
  C: { name: 'Split Lateral', description: 'Imagen izquierda, copy derecha', emoji: '↔️' },
};
