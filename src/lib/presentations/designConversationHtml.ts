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

/** Detached structural context for planning. Image bytes go through registered
 * references; this summary neither loads resources nor renders a screenshot. */
export function buildConversationHtmlSummary(html: string): string {
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
  const summary = `Resumen de HTML; no es una captura.\nTexto: ${clip(visibleText, 3800)}\nCSS: ${clip(styles, 3200)}\nEstructura: ${clip(structure, 4700)}`;
  return clip(summary, LIMIT);
}
