const LIMIT = 12000;
const OMITTED = '… [resumen truncado]';
const clip = (value: string, length: number) => value.length > length ? value.slice(0, length - OMITTED.length) + OMITTED : value;
const withoutLocations = (value: string) => value
  .replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\s*\)/gi, 'url([recurso omitido])')
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
    'data-eid', 'data-asset-id', 'data-asset-version', 'data-element-id']);
  for (const node of root.querySelectorAll('*')) for (const attribute of Array.from(node.attributes)) {
    if (!attributes.has(attribute.name.toLowerCase())) node.removeAttribute(attribute.name);
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
export function buildConversationHtmlSummary(html: string): string {
  const { styles, visibleText, structure } = inert(html);
  const summary = `Resumen de HTML; no es una captura.\nTexto: ${clip(visibleText, 3800)}\nCSS: ${clip(styles, 3200)}\nEstructura: ${clip(structure, 4700)}`;
  return clip(summary, LIMIT);
}

const visibleTextOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim();
export interface DeckStyleKit { slides: Array<{ title: string; summary: string }>; examples: string[] }
/** Style kit of the presentation: up to three other slides with content, nearest to the current one.
 * The planner gets short summaries; the HTML engine gets inert markup + CSS (no scripts, URLs or image bytes). */
export function buildDeckStyleKit(slides: ReadonlyArray<{ id: string; title?: string; html: string }>, currentId: string): DeckStyleKit {
  const index = slides.findIndex(slide => slide.id === currentId);
  const picked = slides.map((slide, position) => ({ slide, distance: Math.abs(position - (index < 0 ? 0 : index)) }))
    .filter(({ slide }) => slide.id !== currentId && visibleTextOf(slide.html))
    .sort((a, b) => a.distance - b.distance).slice(0, 3).map(item => item.slide);
  return {
    slides: picked.map((slide, position) => ({ title: clip(slide.title?.trim() || `Diapositiva ${position + 1}`, 200),
      summary: clip(buildConversationHtmlSummary(slide.html), 4000) })),
    examples: picked.map(slide => { const { styles, structure } = inert(slide.html); return clip(`<style>${styles}</style>${structure}`, 40000); }),
  };
}
