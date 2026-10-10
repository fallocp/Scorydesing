import type { DesignCopy, DesignUnderstanding } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { PreparedPresentationReference, PresentationReferenceRole } from './presentationReferences';

const visualRoles: PresentationReferenceRole[] = ['image_style_reference', 'layout_reference', 'brand_reference', 'object_reference'];

const plain = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STRUCTURAL_ORDER = /^\d+\s|\b(?:cuadros?|tarjetas?|columnas?|filas?|bloques?|elementos?|cajas?|recuadros?|puntos?|items?)\b/;
/** A proposed copy line that only restates the order («3 cuadros más»), never a text to print. */
const STRUCTURAL_LINE = /^(?:\d+|un|una|dos|tres|cuatro|cinco|seis)\s+(?:cuadros?|tarjetas?|columnas?|filas?|bloques?|elementos?|cajas?|recuadros?|puntos?|items?)\b/;
const ADDITIVE = /\b(?:agrega|agregale|agregar|anade|anadele|anadir|incluye|incluir|suma|sumale|otra|otro|otras|otros)\b/;
const REPLACING = /\b(?:reemplaza|sustituye|cambia|corrige|reescribe|redacta|resume|traduce|quita|elimina|borra|solo|unicamente|en\s+(?:lugar|vez)\s+de|todo\s+el\s+texto)\b/;
export interface ConversationCopyAuthorizationContext {
  /** Exact, untruncated additions from the preceding real HTML validation error. */
  rejectedAdditions?: string[];
  brandName?: string;
}

/** Resolve a narrow permission to add a label, never permission to rewrite copy.
 * Ambiguous labels, questions and quoted/negated instructions return no additions.
 * Context identifies the label; it does not authorize it without a direct request. */
export function conversationAuthorizedCopyAdditions(userMessage: string, context: ConversationCopyAuthorizationContext = {}): string[] {
  const message = userMessage.trim(), normalized = plain(message);
  if (/[?¿]/.test(message) || /\b(?:no|nunca)\s+(?:(?:lo|la|los|las)\s+)?(?:agregues|incluyas|anadas|pongas|quiero|permito|autorizo)\b/.test(normalized)) return [];
  // Anchor to the user's own instruction. A quoted command or "the image says
  // include..." is evidence to discuss, not permission to change the copy.
  const command = message.match(/^(?:no\s+(?:me\s+)?importa\s+que\s+(?:sobre|aparezca|quede|se\s+(?:agregue|a[nñ]ada|incluya))|est[aá]\s+bien\s+que\s+(?:sobre|aparezca|quede|se\s+(?:agregue|a[nñ]ada|incluya))|(?:incluye|agrega|a[nñ]ade|mant[eé]n|conserva)(?:\s+tambi[eé]n)?)\s+(.+)$/isu);
  if (!command) return [];
  const label = (value: string) => value.trim().replace(/^[«“"']|[»”"']$/g, '').trim();
  const valid = (value: string) => !!value && value.length <= 160 && !/[\r\n\u0000\u2026]|\.{3}|[<>]/.test(value);
  const key = (value: string) => plain(value).replace(/\s+/g, ' ').trim();
  const quoted = command[1].match(/^(?:(?:el\s+)?(?:texto|nombre|marca)\s*:?\s*)?[«“"']([^»”"'\r\n]+)[»”"'](?:\s|[.,;]|$)/iu);
  const target = quoted ? quoted[1].trim() : label(command[1].split(/[.,;\n]|\s+(?:y|pero)\s+/i)[0]);
  if (!valid(target)) return [];
  const wanted = key(target), brand = label(context.brandName ?? '');
  if (/^(?:el\s+)?(?:nombre\s+de\s+(?:la\s+)?marca|nombre\s+de\s+(?:la\s+)?empresa|marca)$/.test(wanted)) return valid(brand) ? [brand] : [];
  const rejected = [...new Map((context.rejectedAdditions ?? []).map(label).filter(valid).map(value => [key(value), value])).values()];
  const exact = rejected.filter(value => key(value) === wanted);
  if (exact.length === 1) return exact;
  const mentioned = rejected.filter(value => key(value).startsWith(`${wanted} `));
  if (mentioned.length === 1) return mentioned;
  if (mentioned.length > 1) return [];
  if (valid(brand) && key(brand) === wanted) return [brand];
  // Explicit quoted text needs no brand lookup. For an unquoted name, require
  // a concrete name rather than resolving pronouns or arbitrary design prose.
  if (/^(?:eso|esto|lo\s+anterior|el\s+texto|texto|contenido|copy|el\s+nombre|un\s+poco|mas|todo)$/i.test(wanted)) return [];
  // «agrega 3 cuadros más» is a structural order, never a label to print.
  if (!quoted && STRUCTURAL_ORDER.test(wanted)) return [];
  if (quoted || /^[A-ZÁÉÍÓÚÜÑ0-9]/u.test(target) && !/^(?:el|la|los|las|un|una|otro|otra)\b/.test(wanted)) return [target];
  return [];
}

function copyWithAuthorizedAdditions(previous: DesignCopy, proposed: DesignCopy, additions: string[]): DesignCopy {
  const blocks = (text: string) => text.split('\n').map(value => value.trim()).filter(Boolean);
  const before = blocks(previous.text), missing = additions.filter(text => !before.includes(text));
  if (!missing.length) return previous;
  const expected = [...before, ...missing], after = blocks(proposed.text), remaining = [...after];
  for (const block of expected) {
    const index = remaining.indexOf(block);
    if (index >= 0) remaining.splice(index, 1);
  }
  if (proposed.status === 'literal' && after.length === expected.length && !remaining.length) return { ...previous, text: proposed.text };
  // The planner may still omit the approved addition or attempt to summarize.
  // Preserve the original bytes and add only the explicitly identified label.
  const text = `${previous.text}${previous.text.endsWith('\n') ? '' : '\n'}${missing.join('\n')}`;
  return text.length <= 4000 ? { ...previous, text } : previous;
}
/** The planner can resolve or edit copy, but a visual follow-up does not grant
 * permission to rewrite already literal text. */
export function conversationCopyForTurn(previous: DesignCopy, proposed: DesignCopy, userMessage: string,
  context: ConversationCopyAuthorizationContext = {}): DesignCopy {
  if (previous.status !== 'literal') return proposed;
  const message = plain(userMessage);
  const additions = conversationAuthorizedCopyAdditions(userMessage, context);
  if (additions.length) return copyWithAuthorizedAdditions(previous, proposed, additions);
  if (/\bsin\s+(?:cambiar|modificar|alterar|tocar|reescribir)\s+(?:(?:el|mi|nuestro)\s+)?(?:texto|contenido|copy)\b/.test(message)) return previous;
  // Lines the user wrote literally in this message are approved and join the approved copy.
  const collapse = (text: string) => plain(text).replace(/\s+/g, ' ').trim(), said = collapse(userMessage);
  const approved = new Set(previous.text.split('\n').map(line => line.trim()).filter(Boolean));
  const written = proposed.status !== 'literal' ? [] : proposed.text.split('\n').map(line => line.trim())
    .filter(line => line.length >= 3 && !approved.has(line) && said.includes(collapse(line)) && !STRUCTURAL_LINE.test(collapse(line)));
  // An additive order («agrega una tarjeta, texto: Pagos») never drops approved lines.
  if (written.length && ADDITIVE.test(message) && !REPLACING.test(message)) return copyWithAuthorizedAdditions(previous, proposed, written);
  const content = '(?:texto|contenido|informacion|copy|titulo|subtitulo|parrafo|nota|frase|encabezado|dato|cifra|plazo|precio|fecha|porcentaje)';
  if (new RegExp(`\\b${content}(?:\\s+(?:nuevo|final|correcto|exacto))?\\s*[:=]`).test(message)
    || /\b(?:pon|escribe|que diga|debe decir)\s*:?\s*[«“"']/.test(message)
    || /\b(?:que\s+diga|debe\s+decir)\s+\S/.test(message)
    || /\b(?:sin|quita|elimina|no incluyas|no quiero)\s+(?:(?:el|ningun|todo el)\s+)?(?:texto|copy|contenido)\b/.test(message)) return proposed;
  // A direct replacement can quote existing copy without naming "the text".
  // Require the old phrase to occur in the literal copy so visual commands such
  // as "cambia el color por azul" do not grant permission to rewrite it.
  for (const match of message.matchAll(/\b(?:reemplaza|cambia|sustituye)\s+(.{1,160}?)\s+por\s+([^.;\n]+)/g)) {
    const oldText = match[1].replace(/^[«“"']|[»”"']$/g, '').trim();
    if (oldText && !/^(?:(?:el|la|los|las)\s+)?(?:color|colores|fuente|tipografia|estilo|diseno|formato|tamano|posicion|margen|sombra)\b/.test(oldText)
      && plain(previous.text).includes(oldText)) return proposed;
  }
  for (const clause of message.split(/[.;,\n]|\s+y\s+(?=(?:el|la|los|las|usa|cambia|pon|reescribe|traduce)\b)/)) {
    if (/\b(?:reescribe|redacta|resume|traduce|transcribe)\b/.test(clause)) return proposed;
    const update = new RegExp(`\\b(?:corrige|reemplaza|sustituye|elimina|quita|agrega|anade|cambia|actualiza|modifica|edita|pon|usa|toma|extrae|lee|incluye)\\b.{0,80}\\b${content}\\b`);
    if (!update.test(clause)) continue;
    const visual = /\b(?:color|colores|fuente|tipografia|estilo|diseno|formato|tamano|posicion|alineacion|espacio|margen|sombra|contraste|mas grande|mas pequeno|mas legible)\b/.test(clause);
    if (!visual || /\b(?:diga|decir)\b/.test(clause)
      || new RegExp(`\\b${content}\\b.{0,60}\\b(?:por|a)\\s*[«“"']`).test(clause)) return proposed;
  }
  return written.length ? copyWithAuthorizedAdditions(previous, proposed, written) : previous;
}
/** An AI interpretation cannot silently turn a text attachment into the design.
 * A reference-specific visual request may update its visible selected role. */
export function resolveConversationReferenceUse(references: PreparedPresentationReference[], understanding: DesignUnderstanding,
  userMessage: string): { references: PreparedPresentationReference[]; understanding: DesignUnderstanding } {
  const message = plain(userMessage), clauses = message.split(/[.;,\n]|\s+y\s+(?=(?:el|la|los|las|usa|toma|copia|replica|adapta)\b)/);
  const textOnly = /\b(?:solo|solamente|unicamente)\s+(?:el\s+)?(?:texto|contenido)\b|\bno\b[^.;]{0,50}\b(?:uses|copies|tomes|sigas)\b[^.;]{0,30}\b(?:estilo|diseno|apariencia)\b/.test(message);
  const deictic = /\b(?:lo\s+que\s+te\s+(?:mande|envie|pase|adjunte)|adjunt[oa]s?|mi\s+(?:imagen|referencia|captura|foto))\b/.test(message);
  // «como» counts only before the reference («como mi imagen»), never «como te dije».
  const visualCue = /\b(?:(?:como|igual\s+(?:a|que))\s+(?:la|el|mi|esa|ese|esta|este|lo\s+que)|parecid[oa]|se\s+vea|estilo|diseno|apariencia|look|composicion|visual(?:es|mente)?)\b/;
  const updated = references.map((reference, index) => {
    if (reference.role !== 'content_source') return { ...reference };
    const proposed = understanding.references.find(item => item.reference_id === reference.id);
    if (!proposed) return { ...reference };
    const ordinal = ['(?:primera|primer[oa]?)', '(?:segunda|segundo)', '(?:tercera|tercer[oa]?)'][index];
    const targets = new RegExp(`\\b${ordinal}\\b|\\b(?:referencia|imagen|foto|captura|pagina)\\s*(?:numero\\s*)?${index + 1}\\b`);
    const namesSourceIn = (clause: string) => targets.test(clause) || clause.includes(plain(reference.id))
      || references.length === 1 && /\b(?:referencia|imagen|foto|captura|ejemplo)\b/.test(clause)
      || /\b(?:referencias|imagenes|capturas)\b/.test(clause);
    // Naming the reference is not enough: the same clause must ask for something visual.
    const named = clauses.some(clause => namesSourceIn(clause) && visualCue.test(clause)) || deictic && visualCue.test(message);
    const roles = new Set<PresentationReferenceRole>();
    for (const clause of clauses) {
      if (/\bno\b[^.!?;]{0,50}\b(?:uses|copies|tomes|cambies|sigas|repliques|recrees)\b/.test(clause)) continue;
      const namesSource = namesSourceIn(clause);
      if (!namesSource || /\b(?:solo|solamente|unicamente)\s+(?:el\s+)?(?:texto|contenido)\b/.test(clause)) continue;
      if (/\b(?:estilo|apariencia|paleta|colores|tipografia|tipografias)\b/.test(clause)) roles.add('image_style_reference');
      if (/\b(?:composicion|distribucion|acomodo|maquetacion|layout)\b/.test(clause)) roles.add('layout_reference');
      if (/\b(?:logo|logotipo|identidad)\b/.test(clause)) roles.add('brand_reference');
      if (/\b(?:objeto|icono|ilustracion|mundo|avion|fotografia)\b/.test(clause)) roles.add('object_reference');
      if (/\b(?:replica|replicar|recrea|recrear|identic[oa]|igual)\b/.test(clause)
        || /\bdiseno\s+(?:(?:de|del)\s+)?(?:(?:la|esta|esa|mi)\s+)?(?:referencia|imagen|primera|segunda|tercera)\b/.test(clause)) {
        roles.add('layout_reference'); roles.add('image_style_reference');
      }
    }
    const role = visualRoles.find(role => roles.has(role) && proposed.roles.includes(role))
      ?? (named && !textOnly ? visualRoles.find(role => proposed.roles.includes(role)) : undefined);
    return role ? { ...reference, role } : { ...reference };
  });
  return { references: updated, understanding: { ...understanding, references: understanding.references.map(reference => {
    const selected = updated.find(item => item.id === reference.reference_id);
    return selected?.role === 'content_source' ? { ...reference, roles: ['content_source'],
      instruction: 'Fuente exclusiva de texto y contenido; su apariencia no define el diseño.' } : reference;
  }) } };
}

/** Reading the copy does not consume references that also explain the design. */
export function conversationHtmlReferences(references: PreparedPresentationReference[], copy: DesignCopy,
  _understanding: DesignUnderstanding | null): PreparedPresentationReference[] {
  return references.filter(reference => reference.role !== 'content_source' || copy.status !== 'literal').map(reference => ({ ...reference }));
}

/** The normal renderer and reference normalizer provide the same pixels as export.
 * Optional vision failures must never prevent a text conversation or be described as a screenshot. */
export async function captureConversationHtml(html: string, canvas: { width: number; height: number },
  access: { businessId: string; expectedActorId?: string }): Promise<PreparedPresentationReference> {
  const [{ renderHtmlForReview }, { preparePresentationReference }, { sanitizePresentationHtml }] = await Promise.all([
    import('../../utils/xendingDesign/canvasRenderer'), import('./presentationReferences'), import('./presentationHtml'),
  ]);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  let image: string;
  try { image = (await renderHtmlForReview(sanitizePresentationHtml(html), canvas.width, canvas.height, { ...access, signal: controller.signal })).image; }
  finally { clearTimeout(timeout); }
  if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) throw Error('invalid_design_capture');
  const decoded = atob(image.slice(image.indexOf(',') + 1));
  const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
  return preparePresentationReference(new File([bytes], 'Vista del diseño actual.png', { type: 'image/png' }), 'layout_reference');
}

export function conversationVisualSummary(summary: string, captureId?: string): string {
  const visual = captureId?.startsWith('deck:')
    ? `El diseño actual aparece en la lámina de diapositivas numeradas: referencia ${captureId}. Identifícalo por su número en la presentación; las demás miniaturas son fuentes consultadas.`
    : captureId
    ? `Captura reducida del diseño actual: referencia ${captureId}. Muestra el HTML resumido a continuación; úsala para observar su composición y jerarquía.`
    : 'No hay captura visual disponible de este diseño. El contexto siguiente describe su HTML; no permite comprobar su apariencia real.';
  return `${visual}\n${summary}`.slice(0, 12000);
}
