import { assertDesignElementEdits, DESIGN_ELEMENT_LIMITS, type DesignEditableElement, type DesignElementEdit } from '../../../supabase/functions/_shared/desaing/designElementEdits';

const editableTags = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'LI', 'LABEL', 'TD', 'TH', 'STRONG', 'B', 'EM', 'I', 'A',
  'DIV', 'SECTION', 'ARTICLE', 'FIGURE', 'FIGCAPTION', 'HEADER', 'FOOTER', 'UL', 'OL', 'TABLE', 'TR', 'IMG']);
const inlineTags = new Set(['SPAN', 'LABEL', 'STRONG', 'B', 'EM', 'I', 'A']);
const clean = (value: string, limit: number) => value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
function parse(html: string): Document {
  if (typeof html !== 'string' || !html.trim() || html.length > 16 * 1024 * 1024) throw Error('El HTML del diseño no es válido para editar elementos.');
  return new DOMParser().parseFromString(html, 'text/html');
}
function entries(document: Document): Array<{ element: HTMLElement; item: DesignEditableElement }> {
  const canvas = document.querySelector('.slide,.lab-canvas');
  const output: Array<{ element: HTMLElement; item: DesignEditableElement }> = [];
  for (const [index, node] of Array.from(document.body.querySelectorAll('*')).entries()) {
    if (!editableTags.has(node.tagName) || node === canvas || node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      || node.closest('svg,script,style,template,noscript,iframe,object,embed,[hidden],[aria-hidden="true"],[data-edit-locked="true"]')) continue;
    const element = node as HTMLElement;
    let hidden = false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      if (parent.style.display === 'none' || parent.style.visibility === 'hidden' || parent.style.opacity === '0') { hidden = true; break; }
    }
    if (hidden) continue;
    const leafText = node.tagName !== 'IMG' && !!node.textContent?.trim() && Array.from(node.children).every(child => child.tagName === 'BR');
    const kind = node.tagName === 'IMG' ? 'image' : leafText ? 'text' : 'container';
    const content = clean(node.textContent ?? '', 500), identity = [node.id, node.getAttribute('data-eid')].filter(Boolean).join(' · ');
    const name = kind === 'image' ? node.getAttribute('alt') || identity || 'Imagen' : identity || (kind === 'text' ? content.slice(0, 90) : content.slice(0, 65));
    const parentHint = kind === 'text' && node.tagName === 'SPAN' ? ` en ${node.parentElement?.tagName.toLowerCase() ?? ''}` : '';
    output.push({ element, item: { element_id: `e:${index}`, kind, label: clean(`${node.tagName.toLowerCase()}${parentHint}${name ? ` · ${name}` : ''}`, 160),
      ...(content ? { text: content } : {}) } });
  }
  // Prefer concrete text and image targets over large wrapper containers when a
  // document is complex. IDs retain their document order independently of sorting.
  return [...output.filter(entry => entry.item.kind !== 'container'), ...output.filter(entry => entry.item.kind === 'container')]
    .slice(0, DESIGN_ELEMENT_LIMITS.elements);
}

/** Scoped IDs refer only to this exact HTML. The caller must bind its fingerprint
 * to the confirmed action; these IDs are never interpreted as CSS selectors. */
export function buildDesignElementCatalog(html: string): DesignEditableElement[] {
  return entries(parse(html)).map(entry => entry.item);
}

function authorTranslate(element: HTMLElement, document: Document): boolean {
  // Do not silently overwrite a stylesheet-based translate while moving. The
  // ordinary transform property remains independent and is always preserved.
  if (typeof CSSStyleSheet === 'undefined' || typeof CSSStyleSheet.prototype.replaceSync !== 'function')
    return [...document.querySelectorAll('style')].some(style => /\btranslate\s*:/i.test(style.textContent ?? ''));
  const matches = (rules: CSSRuleList): boolean => Array.from(rules).some(rule => {
    if (rule instanceof CSSStyleRule && rule.style.getPropertyValue('translate')) {
      try { return element.matches(rule.selectorText); } catch { return true; }
    }
    return 'cssRules' in rule && matches((rule as CSSGroupingRule).cssRules);
  });
  for (const style of document.querySelectorAll('style')) {
    try { const sheet = new CSSStyleSheet(); sheet.replaceSync(style.textContent ?? ''); if (matches(sheet.cssRules)) return true; }
    catch { if (/\btranslate\s*:/i.test(style.textContent ?? '')) return true; }
  }
  return false;
}
function movedTranslate(element: HTMLElement, dx: number, dy: number, document: Document): string {
  const value = element.style.getPropertyValue('translate').trim();
  if ((!value || element.style.getPropertyPriority('translate') !== 'important') && authorTranslate(element, document))
    throw Error('Este elemento usa un desplazamiento de su hoja de estilo. Muévelo desde el editor para conservarlo.');
  if (!value || value === 'none') return `${dx}px ${dy}px`;
  const parts = value.split(/\s+/);
  if (parts.length > 2 || parts.some(part => !/^-?(?:\d+\.?\d*|\.\d+)(?:px|%)?$/.test(part)))
    throw Error('Este elemento tiene un desplazamiento compuesto. Muévelo desde el editor para conservarlo.');
  const add = (part: string, delta: number) => part.endsWith('%') ? `calc(${part} + ${delta}px)` : `${parseFloat(part) + delta}px`;
  return `${add(parts[0], dx)} ${add(parts[1] || '0', dy)}`;
}
function assetSource(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 16 * 1024 * 1024) throw Error('El recurso autorizado no está disponible.');
  if (/^data:image\/(?:png|jpeg|webp|avif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)) return value;
  try { const url = new URL(value); if (['https:', 'http:', 'blob:'].includes(url.protocol) && !url.username && !url.password) return value; } catch { /* Reject invalid sources. */ }
  throw Error('El recurso autorizado no es una imagen válida.');
}

/** Apply only bounded operations to the selected targets. All validation happens
 * in an inert, detached document; failures return no partially edited result. */
export function applyDesignElementEdits(html: string, edits: readonly DesignElementEdit[], options: { assets?: Record<string, string> } = {}): { html: string; changedElementIds: string[] } {
  const document = parse(html), targets = entries(document), catalog = targets.map(entry => entry.item);
  const assets = Object.keys(options.assets ?? {}).map(asset_id => ({ asset_id, label: asset_id.slice(0, 160) }));
  assertDesignElementEdits(edits, catalog, assets);
  const changed = new Set<string>();
  for (const edit of edits) {
    const { element } = targets.find(entry => entry.item.element_id === edit.element_id)!;
    if (edit.kind === 'move') {
      element.style.setProperty('translate', movedTranslate(element, edit.dx, edit.dy, document), 'important');
      if (inlineTags.has(element.tagName)) element.style.setProperty('display', 'inline-block', 'important');
    } else if (edit.kind === 'resize') {
      element.style.setProperty('width', `${edit.width}px`, 'important'); element.style.setProperty('height', `${edit.height}px`, 'important');
      element.style.setProperty('min-width', '0', 'important'); element.style.setProperty('min-height', '0', 'important');
      element.style.setProperty('max-width', 'none', 'important'); element.style.setProperty('max-height', 'none', 'important');
      if (inlineTags.has(element.tagName)) element.style.setProperty('display', 'inline-block', 'important');
    } else if (edit.kind === 'text') element.textContent = edit.text;
    else if (edit.kind === 'style') element.style.setProperty(edit.property === 'font_size' ? 'font-size' : edit.property === 'align' ? 'text-align' : 'color',
      edit.property === 'font_size' ? `${edit.value}px` : edit.value, 'important');
    else if (edit.kind === 'image') {
      const source = Object.prototype.hasOwnProperty.call(options.assets ?? {}, edit.asset_id) ? options.assets![edit.asset_id] : undefined;
      element.setAttribute('src', assetSource(source));
      // The replacement is authorized by the host, never the old asset's bytes.
      for (const attribute of Array.from(element.attributes)) if (attribute.name === 'srcset' || attribute.name === 'sizes'
        || attribute.name === 'data-asset-id' || attribute.name === 'data-asset-version' || attribute.name.startsWith('data-mount-')) element.removeAttribute(attribute.name);
      if (edit.asset_id === 'brand-logo') element.style.setProperty('object-fit', 'contain', 'important');
    }
    changed.add(edit.element_id);
  }
  return { html: `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, changedElementIds: [...changed] };
}
