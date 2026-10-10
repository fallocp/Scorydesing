import { assertDesignElementEdits, DESIGN_ELEMENT_LIMITS, DesignElementEditError, type DesignEditableElement, type DesignElementEdit } from '../../../supabase/functions/_shared/desaing/designElementEdits';

const editableTags = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'LI', 'LABEL', 'TD', 'TH', 'STRONG', 'B', 'EM', 'I', 'A',
  'DIV', 'SECTION', 'ARTICLE', 'FIGURE', 'FIGCAPTION', 'HEADER', 'FOOTER', 'UL', 'OL', 'TABLE', 'TR', 'IMG']);
const inlineTags = new Set(['SPAN', 'LABEL', 'STRONG', 'B', 'EM', 'I', 'A']);
const XHTML = 'http://www.w3.org/1999/xhtml';
const SKIPPED = 'svg,script,style,template,noscript,iframe,object,embed,[hidden],[aria-hidden="true"],[data-edit-locked="true"]';
const clean = (value: string, limit: number) => value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const squash = (value: string) => value.normalize('NFKC').replace(/\s+/g, '');
function parse(html: string): Document {
  if (typeof html !== 'string' || !html.trim() || html.length > 16 * 1024 * 1024) throw Error('El HTML del diseño no es válido para editar elementos.');
  return new DOMParser().parseFromString(html, 'text/html');
}
/** One filter for the catalog and the group analysis. */
function eligible(node: Element, canvas: Element | null): node is HTMLElement {
  if (!editableTags.has(node.tagName) || node === canvas || node.namespaceURI !== XHTML || node.closest(SKIPPED)) return false;
  for (let parent: HTMLElement | null = node as HTMLElement; parent; parent = parent.parentElement) {
    if (parent.style.display === 'none' || parent.style.visibility === 'hidden' || parent.style.opacity === '0') return false;
  }
  return true;
}
const isLeaf = (node: Element) => node.tagName !== 'IMG' && Array.from(node.children).every(child => child.tagName === 'BR');
const signature = (node: Element) => `${node.tagName}|${[...node.classList].sort().join(' ')}|${Array.from(node.children, child => child.tagName).join(',')}`;
const atCanvasRoot = (node: Element) => !node.parentElement || node.parentElement.matches('.slide,.lab-canvas') || node.parentElement === node.ownerDocument.body;
function pathOf(leaf: Element, member: Element): number[] {
  const steps: number[] = [];
  for (let node = leaf; node !== member && node.parentElement; node = node.parentElement) steps.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
  return steps;
}
const comparePaths = (left: number[], right: number[]) => {
  for (let index = 0; index < Math.min(left.length, right.length); index++) if (left[index] !== right[index]) return left[index] - right[index];
  return left.length - right.length;
};
type Entry = { element: HTMLElement; item: DesignEditableElement };
interface Analysis { entries: Entry[]; paths: Map<Element, number[][]> }

/** Repeated sibling containers (cards) form a group only when every member has
 * the same text leaves and those leaves hold all of its text, so a copy never
 * mixes old and new text. Two O(n) passes over the document. */
function analyze(document: Document): Analysis {
  const canvas = document.querySelector('.slide,.lab-canvas'), nodes = Array.from(document.body.querySelectorAll('*'));
  const ok = new Set<Element>(nodes.filter(node => eligible(node, canvas))), order = new Map(nodes.map((node, index) => [node, index]));
  const byParent = new Map<Element, Map<string, HTMLElement[]>>();
  for (const node of ok) {
    if (node.tagName === 'IMG' || isLeaf(node) || atCanvasRoot(node)) continue;
    const siblings = byParent.get(node.parentElement!) ?? new Map<string, HTMLElement[]>(); byParent.set(node.parentElement!, siblings);
    const key = signature(node), members = siblings.get(key) ?? []; members.push(node as HTMLElement); siblings.set(key, members);
  }
  const styles = Array.from(document.querySelectorAll('style'), style => style.textContent ?? '').join('\n');
  const escape = (id: string) => typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(id) : id;
  const candidates: Array<{ members: HTMLElement[]; paths: number[][]; leaves: HTMLElement[][] }> = [];
  for (const siblings of byParent.values()) for (const members of siblings.values()) {
    if (members.length < 2) continue;
    const found = members.map(member => {
      const leaves = new Map<string, HTMLElement>();
      for (const leaf of member.querySelectorAll('*')) if (ok.has(leaf) && isLeaf(leaf)) leaves.set(pathOf(leaf, member).join('/'), leaf as HTMLElement);
      return leaves;
    });
    // A text path holds text in at least one member; always-empty decorations are not text.
    const textPaths = new Set<string>();
    for (const leaves of found) for (const [path, leaf] of leaves) if (leaf.textContent?.trim()) textPaths.add(path);
    const paths = [...textPaths].map(path => path.split('/').map(Number)).sort(comparePaths);
    if (!paths.length || paths.length > DESIGN_ELEMENT_LIMITS.groupTexts || found.some(leaves => paths.some(path => !leaves.has(path.join('/'))))) continue;
    const leaves = found.map(map => paths.map(path => map.get(path.join('/'))!));
    if (!members.every((member, index) => squash(member.textContent ?? '') === leaves[index].map(leaf => squash(leaf.textContent ?? '')).join(''))) continue;
    // Clones receive new IDs and would silently lose #id rules.
    const ids = members.flatMap(member => [member, ...member.querySelectorAll('[id]')].map(node => node.id).filter(Boolean));
    if (ids.some(id => styles.includes(`#${escape(id)}`))) continue;
    candidates.push({ members, paths, leaves });
  }
  const first = (candidate: typeof candidates[number]) => order.get(candidate.members[0]) ?? 0;
  const kept = candidates.sort((left, right) => right.members.length - left.members.length || first(left) - first(right))
    .slice(0, DESIGN_ELEMENT_LIMITS.groups).sort((left, right) => first(left) - first(right));
  const groupOf = new Map<Element, { group: string; count: number }>(), textLeaves = new Set<Element>(), paths = new Map<Element, number[][]>();
  kept.forEach((candidate, index) => candidate.members.forEach((member, position) => {
    groupOf.set(member, { group: `g:${index + 1}`, count: candidate.paths.length }); paths.set(member, candidate.paths);
    for (const leaf of candidate.leaves[position]) textLeaves.add(leaf);
  }));
  const output: Entry[] = [];
  for (const [index, node] of nodes.entries()) {
    if (!ok.has(node)) continue;
    const element = node as HTMLElement, groupLeaf = textLeaves.has(node);
    const kind = node.tagName === 'IMG' ? 'image' : isLeaf(node) && (!!node.textContent?.trim() || groupLeaf) ? 'text' : 'container';
    const content = clean(node.textContent ?? '', 500), identity = [node.id, node.getAttribute('data-eid')].filter(Boolean).join(' · ');
    const name = kind === 'image' ? node.getAttribute('alt') || identity || 'Imagen' : identity || (kind === 'text' ? content.slice(0, 90) : content.slice(0, 65));
    const parentHint = kind === 'text' && node.tagName === 'SPAN' ? ` en ${node.parentElement?.tagName.toLowerCase() ?? ''}` : '';
    const grouped = kind === 'container' ? groupOf.get(node) : undefined;
    output.push({ element, item: { element_id: `e:${index}`, kind, label: clean(`${node.tagName.toLowerCase()}${parentHint}${name ? ` · ${name}` : ''}`, 160),
      // Empty card leaves stay text targets, so a copied card's description can be filled later.
      ...(content || kind === 'text' && groupLeaf ? { text: content } : {}), ...(grouped ? { group: grouped.group, text_count: grouped.count } : {}) } });
  }
  // Grouped containers first, then concrete text/image targets, then other wrappers.
  // IDs keep their document order independently of this sorting.
  return { paths, entries: [...output.filter(entry => entry.item.group), ...output.filter(entry => entry.item.kind !== 'container'),
    ...output.filter(entry => entry.item.kind === 'container' && !entry.item.group)].slice(0, DESIGN_ELEMENT_LIMITS.elements) };
}

/** Scoped IDs refer only to this exact HTML. The caller must bind its fingerprint
 * to the confirmed action; these IDs are never interpreted as CSS selectors. */
export function buildDesignElementCatalog(html: string): DesignEditableElement[] {
  return analyze(parse(html)).entries.map(entry => entry.item);
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
// A reflowed card leaves its old absolute geometry; it never changes font-size.
const GRID_MEMBER: Array<[string, string]> = [['position', 'relative'], ['left', 'auto'], ['top', 'auto'], ['right', 'auto'], ['bottom', 'auto'],
  ['translate', 'none'], ['width', 'auto'], ['min-width', '0'], ['max-width', 'none'], ['height', 'auto'], ['flex', 'none'], ['grid-column', 'auto'], ['grid-row', 'auto']];
const ORDER: Partial<Record<DesignElementEdit['kind'], number>> = { remove: 0, retext: 1, duplicate: 2, reflow: 3 };
const removedTarget = () => new DesignElementEditError('element_edit_target_removed', 'La operación apunta a un elemento que se quita en el mismo cambio.');

/** Apply only bounded operations to the selected targets. All validation happens
 * in an inert, detached document; failures return no partially edited result.
 * Fixed order: remove → retext → duplicate → reflow → move/resize/text/style/image. */
export function applyDesignElementEdits(html: string, edits: readonly DesignElementEdit[], options: { assets?: Record<string, string> } = {}): { html: string; changedElementIds: string[]; structural: boolean } {
  const document = parse(html), analysis = analyze(document), catalog = analysis.entries.map(entry => entry.item);
  const assets = Object.keys(options.assets ?? {}).map(asset_id => ({ asset_id, label: asset_id.slice(0, 160) }));
  assertDesignElementEdits(edits, catalog, assets);
  const byId = new Map(analysis.entries.map(entry => [entry.item.element_id, entry.element]));
  const resolved = edits.map((edit, index) => ({ edit, index, element: byId.get(edit.element_id)! }));
  const retexted = resolved.filter(entry => entry.edit.kind === 'retext').map(entry => entry.element);
  if (resolved.some(entry => entry.edit.kind === 'text' && retexted.some(container => container.contains(entry.element))))
    throw new DesignElementEditError('element_edit_conflict', 'Dos cambios de texto apuntan al mismo bloque.');
  const taken = new Set<string>();
  for (const node of document.querySelectorAll('[id],[data-eid]')) {
    if (node.id) taken.add(`id:${node.id}`);
    const eid = node.getAttribute('data-eid'); if (eid) taken.add(`eid:${eid}`);
  }
  let suffix = 0;
  const relabel = (clone: Element) => {
    const nodes = [clone, ...clone.querySelectorAll('*')];
    const collides = () => nodes.some(node => !!node.id && taken.has(`id:${node.id}-c${suffix}`)
      || !!node.getAttribute('data-eid') && taken.has(`eid:${node.getAttribute('data-eid')}-c${suffix}`));
    do suffix++; while (collides());
    for (const node of nodes) {
      if (node.id) { node.id = `${node.id}-c${suffix}`; taken.add(`id:${node.id}`); }
      const eid = node.getAttribute('data-eid');
      if (eid) { node.setAttribute('data-eid', `${eid}-c${suffix}`); taken.add(`eid:${eid}-c${suffix}`); }
      // Copy slots bind approved text exactly once; mounted images keep src and asset identity.
      node.removeAttribute('data-copy-id');
    }
  };
  const writeTexts = (container: Element, paths: number[][], texts: readonly string[]) => paths.forEach((path, index) => {
    let node: Element | undefined = container;
    for (const step of path) node = node?.children[step];
    if (node) node.textContent = texts[index];
  });
  const lastCopy = new Map<Element, Element>(), changed = new Set<string>();
  let structural = false;
  for (const { edit, element } of resolved.sort((left, right) => (ORDER[left.edit.kind] ?? 4) - (ORDER[right.edit.kind] ?? 4) || left.index - right.index)) {
    if (!element.isConnected) throw removedTarget();
    if (edit.kind === 'remove') { element.remove(); structural = true; }
    else if (edit.kind === 'retext') writeTexts(element, analysis.paths.get(element)!, edit.texts);
    else if (edit.kind === 'duplicate') {
      const clone = element.cloneNode(true) as HTMLElement;
      writeTexts(clone, analysis.paths.get(element)!, edit.texts); relabel(clone);
      (lastCopy.get(element) ?? element).after(clone); lastCopy.set(element, clone); structural = true;
    } else if (edit.kind === 'reflow') {
      const parent = element.parentElement;
      if (!parent || parent.matches('.slide,.lab-canvas') || parent === document.body)
        throw new DesignElementEditError('element_reflow_root', 'Esos elementos están sueltos en el lienzo y no se pueden reacomodar en columnas.');
      const key = signature(element);
      parent.style.setProperty('display', 'grid', 'important');
      parent.style.setProperty('grid-template-columns', `repeat(${edit.columns}, minmax(0, 1fr))`, 'important');
      parent.style.setProperty('align-items', 'stretch', 'important');
      for (const child of Array.from(parent.children) as HTMLElement[]) {
        if (['STYLE', 'SCRIPT', 'TEMPLATE'].includes(child.tagName)) continue;
        // Headings and notes beside the cards span a whole row instead of becoming a cell.
        if (signature(child) === key) for (const [name, value] of GRID_MEMBER) child.style.setProperty(name, value, 'important');
        else child.style.setProperty('grid-column', '1 / -1', 'important');
      }
      structural = true;
    } else if (edit.kind === 'move') {
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
  return { html: `<!DOCTYPE html>\n${document.documentElement.outerHTML}`, changedElementIds: [...changed], structural };
}
