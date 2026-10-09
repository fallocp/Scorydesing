import { DESIGN_CANVAS_HTML_LIMITS, DesignCanvasHtmlError } from './designCanvasHtml.ts';

/** The existing document is immutable input. All anchors address that same input,
 * never text introduced by an earlier edit. No parser/serializer touches it. */
export const DESIGN_CANVAS_PATCH_LIMITS = Object.freeze({
  edits: 64,
  fragmentCharacters: 16000,
  htmlCharacters: DESIGN_CANVAS_HTML_LIMITS.htmlCharacters,
  responseCharacters: 160000,
});

export const DESIGN_CANVAS_PATCH_INSTRUCTIONS = `Edita el HTML base mediante cambios exactos y localizados. Devuelve exclusivamente JSON con esta forma:
{"edits":[{"before":"fragmento exacto del HTML base","after":"fragmento corregido"}]}
No devuelvas un documento HTML completo. Conserva todo lo que no requiere el cambio acordado: estructura, componentes, CSS, tipografía, paleta e imágenes.
Cada before debe ser no vacío y aparecer exactamente una vez en el único HTML ACTUAL entregado como base, respetando espacios, saltos de línea, comillas y mayúsculas. Conserva también sus identificadores de imágenes enmascaradas. Incluye suficiente contexto para distinguir componentes repetidos.
Todas las ediciones usan offsets del mismo HTML base ORIGINAL; no uses como before texto introducido por otra edición ni HTML de ejemplos o referencias. Los fragmentos before no pueden solaparse. Si una edición falla, corrige el parche: nunca sustituyas este protocolo por una reescritura completa del HTML.
Puedes cambiar atributos de etiquetas de apertura, reglas CSS o fragmentos de componentes. Para insertar, conserva un ancla existente dentro de after y añade el nuevo fragmento a su lado. Para eliminar un fragmento usa after vacío.
No reemplaces el documento ni bloques completos html, head, body o el contenedor raíz .slide/.lab-canvas. No añadas ni elimines esas etiquetas estructurales. Puedes ajustar los atributos de apertura del lienzo y sus componentes por separado. Cambia sólo las reglas o componentes necesarios; evita reemplazar una hoja de estilos entera para ajustar una sola propiedad.
Máximo 64 ediciones, 16000 caracteres por before o after y 160000 caracteres en la respuesta JSON. Si no se necesita ningún cambio, devuelve {"edits":[]}.`;

const invalid = (message: string): never => {
  throw new DesignCanvasHtmlError('invalid_canvas_patch', message, 502);
};
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** This is a document-boundary guard, not an HTML sanitizer. The completed HTML
 * still goes through the normal canvas validation and visual review. */
function structuralTags(fragment: string): string[] {
  return Array.from(fragment.matchAll(/<\s*(\/?)\s*(html|head|body)\b[^>]*>|<!doctype\b[^>]*>/gi), match =>
    match[2] ? `${match[1]}${match[2].toLowerCase()}` : '!doctype');
}

function protectsDocument(before: string, after: string, base: string, editNumber: number): void {
  const completeRoot = /<\s*(html|head|body)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/i;
  if (before === base || completeRoot.test(before) || completeRoot.test(after)) {
    invalid(`La edición ${editNumber} intenta reemplazar el documento o una sección completa html, head o body. Envía cambios de CSS o componentes concretos.`);
  }
  if (structuralTags(before).join('|') !== structuralTags(after).join('|')) {
    invalid(`La edición ${editNumber} cambia la estructura html, head o body. Conserva sus etiquetas y modifica sólo los atributos o componentes necesarios.`);
  }
}

/** Find the existing canvas boundary without serializing its code. Ignore raw
 * CSS/script and comments, where tag-shaped strings are not canvas elements. */
function canvasBoundary(base: string): { start: number; end: number } | undefined {
  const tokens = /<!--[\s\S]*?-->|<(style|script)\b(?:"[^"]*"|'[^']*'|[^'">])*?>[\s\S]*?<\/\1\s*>|<\/?([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  let root: { tag: string; start: number; depth: number } | undefined;
  for (const match of base.matchAll(tokens)) {
    if (!match[2]) continue;
    const token = match[0], tag = match[2].toLowerCase(), closing = /^<\//.test(token);
    if (!root) {
      const classes = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(token);
      if (!closing && ['div', 'main', 'section'].includes(tag) && classes
        && (classes[1] ?? classes[2]).split(/\s+/).some(name => name === 'slide' || name === 'lab-canvas'))
        root = { tag, start: match.index!, depth: 1 };
    } else if (tag === root.tag) {
      root.depth += closing ? -1 : 1;
      if (!root.depth) return { start: root.start, end: match.index! + token.length };
    }
  }
  return undefined;
}

export function applyDesignCanvasPatch(base: string, output: string): string {
  if (typeof base !== 'string' || !base.trim() || base.length > DESIGN_CANVAS_PATCH_LIMITS.htmlCharacters || base.includes('\0')) {
    return invalid('El HTML base no es válido o supera el límite permitido para un diseño editable.');
  }
  if (typeof output !== 'string' || output.length > DESIGN_CANVAS_PATCH_LIMITS.responseCharacters) {
    return invalid('La respuesta de edición supera el tamaño permitido. Envía únicamente los cambios necesarios.');
  }
  let json = output.trim();
  // Accept one complete Markdown code fence, never prose or trailing documents.
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(json);
  if (fenced) json = fenced[1].trim();
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch {
    return invalid('La IA no devolvió un parche JSON válido. Se esperaba {"edits":[{"before":"…","after":"…"}]}.');
  }
  if (!record(parsed) || Object.keys(parsed).some(key => key !== 'edits') || !Array.isArray(parsed.edits)
    || parsed.edits.length > DESIGN_CANVAS_PATCH_LIMITS.edits) {
    return invalid('El parche debe contener únicamente una lista edits con un máximo de 64 ediciones.');
  }

  const replacements: Array<{ start: number; end: number; after: string; number: number }> = [];
  const canvas = parsed.edits.length ? canvasBoundary(base) : undefined;
  let resultLength = base.length;
  for (let index = 0; index < parsed.edits.length; index++) {
    const edit = parsed.edits[index], number = index + 1;
    if (!record(edit) || Object.keys(edit).some(key => key !== 'before' && key !== 'after')
      || typeof edit.before !== 'string' || !edit.before.trim() || typeof edit.after !== 'string'
      || edit.before.includes('\0') || edit.after.includes('\0')
      || edit.before.length > DESIGN_CANVAS_PATCH_LIMITS.fragmentCharacters
      || edit.after.length > DESIGN_CANVAS_PATCH_LIMITS.fragmentCharacters) {
      return invalid(`La edición ${number} necesita before no vacío y after de texto, con un máximo de 16000 caracteres por fragmento.`);
    }
    protectsDocument(edit.before, edit.after, base, number);
    const start = base.indexOf(edit.before);
    if (start < 0) return invalid(`No se encontró el fragmento before de la edición ${number} en el HTML original. Cópialo exactamente, incluidos sus espacios y saltos de línea.`);
    if (base.indexOf(edit.before, start + 1) >= 0) {
      return invalid(`El fragmento before de la edición ${number} aparece más de una vez. Incluye contexto del componente para identificar una sola coincidencia.`);
    }
    const end = start + edit.before.length;
    if (canvas && start <= canvas.start && end >= canvas.end)
      return invalid(`La edición ${number} reemplaza el lienzo completo. Conserva su raíz y modifica sólo las reglas o componentes necesarios.`);
    replacements.push({ start, end, after: edit.after, number });
    resultLength += edit.after.length - edit.before.length;
  }
  if (resultLength > DESIGN_CANVAS_PATCH_LIMITS.htmlCharacters) return invalid('El HTML editado supera el límite permitido para un diseño editable. Reduce los fragmentos nuevos.');
  replacements.sort((left, right) => left.start - right.start);
  for (let index = 1; index < replacements.length; index++) {
    if (replacements[index].start < replacements[index - 1].end) {
      return invalid(`Las ediciones ${replacements[index - 1].number} y ${replacements[index].number} se solapan. Combina sus cambios en una sola edición.`);
    }
  }

  // Assemble once, so changing lengths or introducing later anchors cannot shift
  // another edit. slice preserves Unicode, CRLF, entities and all untouched bytes.
  let cursor = 0;
  const pieces: string[] = [];
  for (const edit of replacements) {
    pieces.push(base.slice(cursor, edit.start), edit.after);
    cursor = edit.end;
  }
  pieces.push(base.slice(cursor));
  return pieces.join('');
}
