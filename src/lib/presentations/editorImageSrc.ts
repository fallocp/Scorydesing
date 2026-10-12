/**
 * Helpers puros del editor visual para cambiar el `src` de un `<img>` dentro
 * del HTML de trabajo (string), sin depender del DOM.
 *
 * Antes se hacía `html.replace(oldSrc, url)`: con `<img src="">` eso anteponía
 * la URL al documento (texto visible arriba de la slide), fallaba en silencio
 * con entidades (`&amp;`) y podía tocar el `<img>` equivocado si dos compartían
 * el mismo `src`.
 */

export interface ImgSrcTarget {
  id?: string | null;
  dataEid?: string | null;
  oldSrc?: string | null;
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const decodeAttr = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const SRC_ATTR = /(\s)src\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i;

/** Reescribe (o inserta) el atributo `src` de una etiqueta `<img ...>`. */
function setSrcOnTag(tag: string, newUrl: string): string {
  const attr = `src="${escapeAttr(newUrl)}"`;
  if (SRC_ATTR.test(tag)) return tag.replace(SRC_ATTR, (_m, ws: string) => `${ws}${attr}`);
  return tag.replace(/^<img\b/i, () => `<img ${attr}`);
}

function readSrc(tag: string): string | null {
  const m = tag.match(SRC_ATTR);
  if (!m) return null;
  const raw = m[2];
  const unquoted = raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
  return decodeAttr(unquoted);
}

function replaceTagAt(html: string, index: number, tag: string, newUrl: string): string {
  return html.slice(0, index) + setSrcOnTag(tag, newUrl) + html.slice(index + tag.length);
}

function findImgByAttr(html: string, attr: string, value: string): RegExpExecArray | null {
  const re = new RegExp(`<img\\b[^>]*?\\s${attr}\\s*=\\s*(["'])${escapeRegExp(value)}\\1[^>]*>`, 'i');
  return re.exec(html);
}

/**
 * Cambia el `src` del `<img>` indicado. Lo ubica por `id` (preferente), luego
 * por `data-eid` y, como último recurso, por el valor exacto de su `src` (sólo
 * si no está vacío). Devuelve `null` si no logra ubicarlo; nunca antepone texto.
 */
export function replaceImgSrcInHtml(html: string, img: ImgSrcTarget, newUrl: string): string | null {
  for (const [attr, value] of [['id', img.id], ['data-eid', img.dataEid]] as const) {
    if (!value) continue;
    const match = findImgByAttr(html, attr, value);
    if (match) return replaceTagAt(html, match.index, match[0], newUrl);
  }

  const oldSrc = img.oldSrc || '';
  if (!oldSrc) return null;
  const tags = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tags.exec(html))) {
    if (readSrc(m[0]) === oldSrc) return replaceTagAt(html, m.index, m[0], newUrl);
  }
  return null;
}

/**
 * Repara slides ya guardadas con texto basura (p.ej. URLs) antepuesto al
 * documento: si el HTML es un documento completo (`<!DOCTYPE` / `<html`) y
 * antes sólo hay texto plano, recorta ese prefijo. Si el prefijo contiene
 * etiquetas, o no hay documento completo, no lo toca. Además quita las URLs
 * de Storage que quedaron como primer texto del `<body>` (ver
 * `stripLeakedStorageUrlsFromBody`).
 */
export function stripLeadingGarbageBeforeDocument(html: string): string {
  const doctype = html.search(/<!doctype\b/i);
  const start = doctype >= 0 ? doctype : html.search(/<html[\s>]/i);
  const trimmed = start > 0 && !html.slice(0, start).includes('<') ? html.slice(start) : html;
  return stripLeakedStorageUrlsFromBody(trimmed);
}

const STORAGE_IMAGE_URL =
  /^https?:\/\/[^\s<>"']+\/storage\/v1\/object\/(?:public|sign)\/[^\s<>"']+\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\s<>"']*)?$/i;

/** `true` si el texto (ignorando espacios) son sólo URLs de imágenes de Storage, quizá concatenadas. */
function isOnlyStorageImageUrls(text: string): boolean {
  const compact = text.replace(/\s+/g, '');
  if (!compact) return false;
  return compact.split(/(?=https?:\/\/)/i).every((part) => STORAGE_IMAGE_URL.test(part));
}

/**
 * Al parsear/serializar (DOMParser, sanitizado) el texto que estaba antes del
 * `<!DOCTYPE` termina como primer nodo de texto del `<body>`. Si ese nodo son
 * sólo URLs de imágenes de Storage, lo elimina. Cualquier otro texto se
 * conserva. Sin `<body>` sólo aplica a fragmentos (sin `<html>`/`<head>`).
 */
export function stripLeakedStorageUrlsFromBody(html: string): string {
  const body = /<body\b[^>]*>/i.exec(html);
  let start = 0;
  if (body) start = body.index + body[0].length;
  else if (/<!doctype\b|<html[\s>]|<head[\s>]/i.test(html)) return html;
  const next = html.indexOf('<', start);
  const end = next < 0 ? html.length : next;
  if (!isOnlyStorageImageUrls(html.slice(start, end))) return html;
  return html.slice(0, start) + html.slice(end);
}
