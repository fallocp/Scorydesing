/** «Diseñar sobre lo que ya existe»: pure helpers shared by the conversation, the
 * HTML panel and the workspace. Every piece has its own switch; all off = current behavior. */
export const DESIGN_FROM_EXISTING_PIECES = ['escala', 'ficha_estricta', 'candado_estilo', 'no_rehace', 'referencias_por_turno',
  'revision_pedido', 'huecos_heredados', 'correccion_acotada', 'prompt_base', 'transferencia'] as const;
export type DesignFromExistingPiece = typeof DESIGN_FROM_EXISTING_PIECES[number];
export type DesignFromExistingFlags = Record<DesignFromExistingPiece, boolean>;

/** VITE_DESAING_DESIGN_FROM_EXISTING=true turns every piece on; VITE_DESAING_DESIGN_FROM_EXISTING_<PIEZA>=false turns one off. */
export function readDesignFromExistingFlags(env: Record<string, unknown>): DesignFromExistingFlags | undefined {
  if (env.VITE_DESAING_DESIGN_FROM_EXISTING !== 'true') return undefined;
  return Object.fromEntries(DESIGN_FROM_EXISTING_PIECES.map(piece =>
    [piece, env[`VITE_DESAING_DESIGN_FROM_EXISTING_${piece.toUpperCase()}`] !== 'false'])) as DesignFromExistingFlags;
}

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Changing the orientation or the internal arrangement of a component is a rewrite from the
 * style spec (a patch would keep the old geometry): «tarjetas horizontales», «ícono a la izquierda». */
export function isOrientationChange(text: string): boolean {
  return /\b(?:horizontal(?:es|mente)?|vertical(?:es|mente)?|apilad[oa]s?|lado a lado|en (?:una )?fila|en (?:una )?columna|orientacion|acomodo interno|(?:icono|imagen|numero|texto)s? (?:a|al lado) (?:la )?(?:izquierda|derecha))\b/.test(plain(text));
}

/** The user's request as a short checklist for the visual review (no new calls). */
export function requestChecklist(text: string): string[] {
  const items = text.replace(/^[^:\n]{0,60}(?:diapositiva|lamina|slide)[^:\n]{0,40}:\s*/i, '')
    .split(/\n|;|,\s+|\s+y\s+(?=[a-záéíóúñ\d])|\.\s+/i).map(item => item.trim().replace(/[.!]+$/, ''))
    .filter(item => item.length >= 6 && /\s/.test(item) && !/^(?:por favor|gracias|ok|dale|si|sí)\b/i.test(item));
  return [...new Set(items)].slice(0, 8).map(item => item.slice(0, 300));
}
export const UNMET_PREFIX = 'No cumplido:';
export const isUnmetIssue = (issue: string) => issue.startsWith(UNMET_PREFIX);

/** IDs of the attachments the user names in this message (ordinal, number, name or «la referencia» with a single one). */
export function namedReferences(text: string, references: ReadonlyArray<{ id: string; name: string }>): string[] {
  const message = plain(text), named = new Set<string>();
  if (/\b(?:las|mis|todas las) (?:referencias|imagenes|capturas|adjuntos)\b/.test(message)) return references.map(reference => reference.id);
  const ordinals = ['(?:primera|primer[oa]?|1)', '(?:segunda|segundo|2)', '(?:tercera|tercer[oa]?|3)'];
  references.forEach((reference, index) => {
    const ordinal = ordinals[index];
    if (ordinal && (new RegExp(`\\b${ordinal}\\s+(?:referencia|imagen|captura|foto|adjunto)\\b`).test(message)
      || new RegExp(`\\b(?:referencia|imagen|captura|foto|adjunto)\\s*(?:numero\\s*)?${ordinal}\\b`).test(message))) named.add(reference.id);
    const name = plain(reference.name).replace(/\.[a-z0-9]{2,4}$/, '').trim();
    if (name.length >= 4 && !/^(?:imagen|captura|referencia|image|pasted)/.test(name) && message.includes(name)) named.add(reference.id);
  });
  if (!named.size && references.length === 1 && /\b(?:la|mi|esta|esa|tu) (?:referencia|imagen|captura|foto)\b|\badjunt[oa]\b|\bla que (?:te )?(?:mande|pase|envie|subi)\b/.test(message))
    named.add(references[0].id);
  return [...named];
}
export const referenceNotUsedNotice = (names: string[]) => names.map(name => `No uso la referencia «${name}» en este ajuste; dime si la quieres.`).join(' ');

export interface ImageHole { key: string; text: string }
const ICON = /ic[oó]no|icon/i;
/** Empty <img> slots of a document, described for the user («La tarjeta 2 no tiene ícono»). */
export function imageHoles(html: string): ImageHole[] {
  if (typeof DOMParser === 'undefined' || !html) return [];
  const document = new DOMParser().parseFromString(html, 'text/html'), holes: ImageHole[] = [];
  Array.from(document.querySelectorAll('img')).forEach((image, index) => {
    if (image.getAttribute('src')?.trim()) return;
    const hint = [image.id, image.className, image.getAttribute('alt') ?? '', image.getAttribute('data-eid') ?? ''].join(' ');
    const what = ICON.test(hint) || ICON.test(image.parentElement?.className ?? '') ? 'ícono' : 'imagen';
    // A card is a repeated sibling with the same tag and first class.
    let card: Element | null = image.parentElement, position = 0;
    for (; card && !card.matches('body,.slide,.lab-canvas'); card = card.parentElement) {
      const parent = card.parentElement, signature = (node: Element) => `${node.tagName}|${node.classList[0] ?? ''}`;
      const siblings = parent ? Array.from(parent.children).filter(node => signature(node) === signature(card!)) : [];
      if (siblings.length >= 2) { position = siblings.indexOf(card) + 1; break; }
    }
    const key = image.id || image.getAttribute('data-eid') || `${position ? `card:${position}` : 'img'}:${image.getAttribute('alt') ?? ''}:${what}`;
    const alt = image.getAttribute('alt')?.trim();
    holes.push({ key: key || `img:${index}`, text: position ? `La tarjeta ${position} no tiene ${what}` : alt ? `Falta ${what}: «${alt.slice(0, 80)}»` : `Hay un${what === 'ícono' ? '' : 'a'} ${what} sin cargar` });
  });
  return holes;
}
/** Holes of the output that already existed in the base are not a defect of this proposal. */
export function inheritedImageHoles(baseHtml: string, outputHtml: string): { inherited: ImageHole[]; added: ImageHole[] } {
  const base = new Set(imageHoles(baseHtml).map(hole => hole.key)), output = imageHoles(outputHtml);
  return { inherited: output.filter(hole => base.has(hole.key)), added: output.filter(hole => !base.has(hole.key)) };
}
/** Review text that asks for missing visual resources (icons, images). */
export const isMissingResourceIssue = (issue: string) =>
  /no (?:se )?(?:pudo )?carg|falt[^.]*\b(?:imagen|imagenes|recursos?|iconos?)\b|placeholder|sin (?:iconos?|imagen)|(?:icono|imagen)[^.]{0,40}vaci[oa]|vaci[oa][^.]{0,40}(?:icono|imagen)/.test(plain(issue));

/** «Corregir composición» limited to the detected problems; keeps the original request, the spec and the lock. */
export function buildScopedRepairFeedback(issues: string[], originalRequest = ''): string {
  const list = [...new Set(issues.filter(issue => issue.trim()))].slice(0, 12);
  return [
    'Corrige SOLO los problemas detectados de esta lista; no cambies nada más.',
    list.length ? `PROBLEMAS DETECTADOS:\n${list.map(issue => `- ${issue}`).join('\n')}` : '',
    originalRequest.trim() ? `PEDIDO ORIGINAL QUE SE CONSERVA (datos): ${originalRequest.trim().slice(0, 1500)}` : '',
    'Conserva la FICHA DE ESTILO y el candado de estilo: tipografías, tamaños de letra, pesos, colores, fondos, radios y sombras actuales, el texto aprobado, la marca y los recursos con su identidad, bytes y src. Mueve o redimensiona sólo lo necesario para resolver cada problema; no ocultes texto ni cambies la orientación o la composición si ningún problema lo exige.',
  ].filter(Boolean).join('\n').slice(0, 6000);
}
const TEXT_DAMAGE = /recort|tapad|\btapa[n]?\b|\bcubre[n]?\b|superpu|solapa|fuera del lienzo|ocult/i;
/** A correction that leaves more problems, or damages text that was fine, is discarded. */
export function correctionIsWorse(before: readonly string[], after: readonly string[]): boolean {
  const damage = (issues: readonly string[]) => issues.filter(issue => TEXT_DAMAGE.test(issue)).length;
  return after.length > before.length || damage(after) > damage(before);
}
