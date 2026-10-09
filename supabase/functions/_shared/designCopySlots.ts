/** Text ownership for editable designs. The model lays out leaf spans; the
 * application supplies their contents. No browser or provider dependencies. */
export interface DesignCopyBlock { id: string; text: string }
export class DesignCopySlotError extends Error {}

export function designCopyBlocks(copy: string): DesignCopyBlock[] {
  return copy.split(/\r?\n/).filter(line => line.trim()).map((text, index) => ({ id: `copy-${index + 1}`, text }));
}
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Consume quoted > characters as part of the tag. Slots themselves have a
// deliberately narrow grammar: a leaf span, never script, SVG or raw markup.
const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+|</g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const NON_HTML_TEXT = new Set(['template', 'noscript', 'svg', 'math', 'iframe', 'object', 'head', 'textarea', 'title', 'select', 'option']);
const decodeAttribute = (value: string) => value.replace(/&#(x[0-9a-f]+|\d+);?|&(amp|lt|gt|quot|apos|colon|semi|Tab|NewLine);/gi,
  (original, number: string | undefined, name: string | undefined) => {
    if (number) { const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original; }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', semi: ';', tab: '\t', newline: '\n' } as Record<string, string>)[name!.toLowerCase()];
  });

/** Attributes are read at their real boundaries, never from another attribute's value. */
function tagInfo(token: string) {
  const start = /^<(\/?)([a-zA-Z][\w:-]*)/.exec(token);
  if (!start) return null;
  const attributes = new Map<string, string>(), closing = !!start[1];
  let rest = token.slice(start[0].length, -1);
  while (!closing && rest.trim() && rest.trim() !== '/') {
    const name = /^\s+([^\s=/>]+)/.exec(rest);
    if (!name) throw new DesignCopySlotError('El diseño contiene atributos de texto mal formados.');
    const key = name[1].toLowerCase(); rest = rest.slice(name[0].length);
    let value = '';
    const assignment = /^\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/.exec(rest);
    if (assignment) { value = decodeAttribute(assignment[1] ?? assignment[2] ?? assignment[3]); rest = rest.slice(assignment[0].length); }
    if (attributes.has(key) && (key === 'data-copy-id' || key === 'data-brand-name'))
      throw new DesignCopySlotError('Un bloque no puede repetir atributos de texto.');
    if (!attributes.has(key)) attributes.set(key, value);
  }
  return { name: start[2].toLowerCase(), closing, selfClosing: /\/\s*>$/.test(token), attributes };
}

const cleanCss = (css: string) => css
  // Comment-like characters inside a quoted string are visible content, not comments.
  .replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\*[\s\S]*?\*\//g, token => token.startsWith('/*') ? '' : token)
  .replace(/\\([a-f\d]{1,6})(?:\r\n|[\t\n\r\f ])?|\\([^\r\n])/gi, (_token, hex: string | undefined, character: string | undefined) =>
    hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)) : character!);

function assertNoGeneratedText(css: string) {
  const cleaned = cleanCss(css);
  for (const match of cleaned.matchAll(/(?:^|[;{])\s*content\s*:\s*([^;}]*)(?=[;} ]|$)/gi)) {
    const value = match[1].replace(/\s*!important\s*$/i, '').trim();
    if (!/^(?:""|''|none|normal)$/i.test(value))
      throw new DesignCopySlotError('El CSS no puede añadir texto mediante content; usa los bloques de texto aprobados.');
  }
}

function hidesText(attributes: Map<string, string>): boolean {
  const style = cleanCss(attributes.get('style') ?? '');
  return attributes.has('hidden') || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)|opacity\s*:\s*0(?:\.0*)?)(?:\s*!important)?\s*(?:;|$)/i.test(style);
}

export function bindDesignCopySlots(html: string, blocks: DesignCopyBlock[], brandName?: string): string {
  const known = new Map(blocks.map(block => [block.id, block.text])), used = new Set<string>();
  const result: string[] = [], stack: Array<{ name: string; blocked: boolean }> = [];
  let slot: { id: string; tag: string; brand: boolean } | null = null;
  let raw: { name: string; contents: string[] } | null = null;
  let brandUsed = false, inBody = false, bodySeen = false, bodyClosed = false;
  for (const token of html.match(TOKEN) ?? []) {
    if (raw) {
      if (new RegExp(`^</${raw.name}\\s*>$`, 'i').test(token)) {
        if (raw.name === 'style') assertNoGeneratedText(raw.contents.join(''));
        result.push(raw.contents.join(''), token); raw = null;
      } else raw.contents.push(token);
      continue;
    }
    if (slot) {
      if (/^<\/span\s*>$/i.test(token)) {
        result.push(`${slot.tag}${escape(slot.brand ? brandName! : known.get(slot.id)!)}${token}`);
        slot = null;
      } else if (token.startsWith('<') && !token.startsWith('<!--')) {
        throw new DesignCopySlotError('Cada bloque de texto debe ser un span sin otros elementos dentro.');
      }
      // Discard any model-written text: the approved source owns these bytes.
      continue;
    }
    if (token.startsWith('<!--') || token.startsWith('<!')) { result.push(token); continue; }
    if (!token.startsWith('<')) {
      // Text outside registered slots is never allowed to add labels or claims.
      if (!token.trim()) result.push(token);
      continue;
    }
    const info = tagInfo(token);
    if (!info) { if (!inBody) result.push(token); continue; }
    if (!info.closing && info.attributes.has('style')) assertNoGeneratedText(info.attributes.get('style')!);
    if (info.name === 'body') {
      if (info.closing) { if (!inBody) throw new DesignCopySlotError('El cuerpo del diseño no está bien formado.'); inBody = false; bodyClosed = true; stack.length = 0; }
      else { if (bodySeen) throw new DesignCopySlotError('El diseño debe tener un único cuerpo.'); bodySeen = true; inBody = true; stack.push({ name: 'body', blocked: hidesText(info.attributes) }); }
      result.push(token); continue;
    }
    const id = info.attributes.get('data-copy-id'), hasId = info.attributes.has('data-copy-id');
    const wordmark = info.attributes.has('data-brand-name');
    if (hasId || wordmark) {
      if (!inBody || info.closing || info.name !== 'span' || info.selfClosing || hasId && wordmark)
        throw new DesignCopySlotError('Los identificadores de texto deben estar en spans independientes.');
      if (hidesText(info.attributes) || stack.some(parent => parent.blocked))
        throw new DesignCopySlotError('Los bloques de texto deben estar en HTML visible, fuera de plantillas, SVG y elementos ocultos.');
      const copyId = id ?? '';
      if (hasId && (!known.has(copyId) || used.has(copyId))) throw new DesignCopySlotError(`Bloque de texto desconocido o repetido: ${copyId.slice(0, 80)}.`);
      if (wordmark && (!brandName || brandUsed)) throw new DesignCopySlotError('El logotipo escrito no está disponible o está repetido.');
      if (hasId) used.add(copyId); else brandUsed = true;
      slot = { id: copyId, tag: token, brand: wordmark };
    } else {
      result.push(token);
      if (!info.closing && ['style', 'script', 'textarea', 'title'].includes(info.name)) raw = { name: info.name, contents: [] };
      else if (inBody) {
        if (info.closing) { const index = stack.map(parent => parent.name).lastIndexOf(info.name); if (index >= 0) stack.splice(index); }
        else if (!info.selfClosing && !VOID.has(info.name)) stack.push({ name: info.name, blocked: NON_HTML_TEXT.has(info.name) || hidesText(info.attributes) });
      }
    }
  }
  if (!bodySeen || !bodyClosed) throw new DesignCopySlotError('Falta el cuerpo completo del diseño.');
  if (slot || used.size !== blocks.length) throw new DesignCopySlotError(`Faltan bloques de texto: ${blocks.filter(block => !used.has(block.id)).map(block => block.id).join(', ') || 'span sin cerrar'}.`);
  return result.join('');
}
