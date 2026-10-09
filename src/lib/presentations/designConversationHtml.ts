const LIMIT = 12000;
const OMITTED = '… [resumen truncado]';
const clip = (value: string, length: number) => value.length > length ? value.slice(0, length - OMITTED.length) + OMITTED : value;
const withoutLocations = (value: string) => value
  .replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi, url => /^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(url) ? url : 'url([recurso omitido])')
  .replace(/@import\b[^;]*(?:;|$)/gi, '')
  .replace(/data:[^\s"'<>)]*/gi, '[datos omitidos]')
  // Preserve tab, line feed and carriage return while stripping unsafe control bytes.
  // eslint-disable-next-line no-control-regex
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

function inert(html: string) {
  const document = new DOMParser().parseFromString('', 'text/html');
  // Template contents remain inert, including image/resource elements, and are
  // never connected to a document or an iframe.
  const template = document.createElement('template'); template.innerHTML = html;
  const root = template.content;
  root.querySelectorAll('script,link,meta,base,iframe,object,embed,noscript,template').forEach(node => node.remove());
  const comments = document.createTreeWalker(root, 128 /* SHOW_COMMENT */), remove: Node[] = [];
  while (comments.nextNode()) remove.push(comments.currentNode);
  remove.forEach(node => node.parentNode?.removeChild(node));
  const attributes = new Set(['id', 'class', 'style', 'alt', 'title', 'aria-label', 'width', 'height', 'viewbox',
    'data-eid', 'data-asset-id', 'data-asset-version', 'data-element-id',
    'd', 'points', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'transform',
    'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'clip-path', 'clip-rule', 'mask',
    'gradientunits', 'gradienttransform', 'spreadmethod', 'offset', 'stop-color', 'stop-opacity',
    'preserveaspectratio', 'vector-effect', 'pathlength']);
  for (const node of root.querySelectorAll('*')) for (const attribute of Array.from(node.attributes)) {
    const localLink = ['href', 'xlink:href'].includes(attribute.name.toLowerCase()) && /^#[\w:.-]+$/.test(attribute.value);
    if (!attributes.has(attribute.name.toLowerCase()) && !localLink) node.removeAttribute(attribute.name);
    else node.setAttribute(attribute.name, withoutLocations(attribute.value));
  }
  const styles = Array.from(root.querySelectorAll('style'), node => withoutLocations(node.textContent ?? '')).join('\n');
  root.querySelectorAll('style').forEach(node => node.remove());
  const visibleText = withoutLocations(root.textContent ?? '').replace(/\s+/g, ' ').trim();
  const structure = withoutLocations(template.innerHTML).replace(/>\s+</g, '><').trim();
  return { styles, visibleText, structure };
}

/** Detached structural context for planning. Image bytes go through registered
 * references; this summary neither loads resources nor renders a screenshot. */
export function buildConversationHtmlSummary(html: string, maxLength = LIMIT): string {
  const { styles, visibleText, structure } = inert(html);
  const limit = Math.min(LIMIT, Math.max(200, maxLength)), scale = Math.min(1, (limit - 100) / 11700);
  const summary = `Resumen de HTML; no es una captura.\nTexto: ${clip(visibleText, Math.floor(3800 * scale))}\nCSS: ${clip(styles, Math.floor(3200 * scale))}\nEstructura: ${clip(structure, Math.floor(4700 * scale))}`;
  return clip(summary, limit);
}

/** Inert reusable structure for an explicitly consulted slide; no scripts, resource URLs or image bytes. */
export function buildConversationHtmlExample(html: string, maxLength = 40000): string {
  const { styles, structure } = inert(html), limit = Math.max(200, Math.min(40000, maxLength));
  const available = limit - '<style></style>'.length;
  if (styles.length + structure.length <= available) return `<style>${styles}</style>${structure}`;
  // Give either half the other's unused space. Keep complete CSS rules when a
  // large source still exceeds the budget, rather than sending broken syntax.
  const cssBudget = Math.max(Math.floor(available * .35), available - structure.length);
  let css = styles;
  if (styles.length > cssBudget) {
    const marker = `/* ${OMITTED} */`, sheet = new CSSStyleSheet();
    sheet.replaceSync(styles); css = '';
    for (const rule of Array.from(sheet.cssRules)) {
      if (css.length + rule.cssText.length + 1 + marker.length > cssBudget) break;
      css += `${rule.cssText}\n`;
    }
    css += marker;
  }
  return `<style>${css}</style>${clip(structure, available - css.length)}`;
}

const visibleTextOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim();
export interface DeckStyleKit { slides: Array<{ title: string; summary: string }>; examples: string[]; ids: string[] }
/** Style kit of the presentation: up to three other slides with content, nearest to the current one.
 * The planner gets short summaries; the HTML engine gets inert markup + CSS (no scripts, URLs or image bytes). */
export function buildDeckStyleKit(slides: ReadonlyArray<{ id: string; title?: string; html: string }>, currentId: string): DeckStyleKit {
  const index = slides.findIndex(slide => slide.id === currentId);
  const picked = slides.map((slide, position) => ({ slide, number: position + 1, distance: Math.abs(position - (index < 0 ? 0 : index)) }))
    .filter(({ slide }) => slide.id !== currentId && visibleTextOf(slide.html))
    .sort((a, b) => a.distance - b.distance).slice(0, 3);
  return {
    slides: picked.map(({ slide, number }) => ({ title: clip(slide.title?.trim() || `Diapositiva ${number}`, 200),
      summary: clip(buildConversationHtmlSummary(slide.html), 4000) })),
    examples: picked.map(({ slide }) => { const { styles, structure } = inert(slide.html); return clip(`<style>${styles}</style>${structure}`, 40000); }),
    ids: picked.map(({ slide }) => slide.id),
  };
}
