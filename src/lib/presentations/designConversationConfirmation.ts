import type { ConversationNextAction } from '../../../supabase/functions/_shared/desaing/conversationActions';
import type { DesignConversationState } from './designConversationStore';
import type { UseDesignConversationOptions } from './useDesignConversation';

export const isDesignGeneration = (kind?: string) => !!kind && !['discuss', 'explore_ideas', 'inspect_slides'].includes(kind);
/** The only client predicate for «copy must be resolved first»; it matches the server's exemption. */
export const needsResolvedCopy = (kind?: string) => isDesignGeneration(kind) && kind !== 'edit_elements';

/** Whole-word tokens without accents, punctuation, emojis or stretched letters (siii → si). */
export function confirmationTokens(message: string): string[] {
  return message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, ' ').replace(/[.,!¡¿?;:]/g, ' ')
    .replace(/(\p{L})\1{2,}/gu, '$1').split(/\s+/).filter(Boolean);
}
export const CHANGE_WORDS = new Set(['no', 'pero', 'aunque', 'cambia', 'cambiar', 'quita', 'quitar', 'agrega', 'pon', 'mejor', 'sin', 'mas', 'menos', 'resume']);
const AFF = 'si|sii|sik|sip|sep|simon|ok|okay|okey|oki|va|vale|dale|adelante|de acuerdo|perfecto|confirmo|claro|correcto|hazlo|hazlo ya|haz lo|hacelo|creala|crealo|generala|generalo|aplicalo|aplicala|procede';
const CREATE = 'crea|crear|genera|generar|hazlo|haz|hacelo|aplica|aplicalo|crealo|creala|generalo|generala';
const FILL = 'asi|esta bien|por favor|porfa|ya|ahora|como dijiste|como lo acordamos|como quedamos|tal cual';
const AFFIRMATIVE = new RegExp(`^(?:${AFF})(?: (?:${AFF}|${FILL}))*$|^(?:(?:${AFF}) )*(?:${CREATE})(?: (?:el|la|lo) (?:diseno|diapositiva|propuesta|cambio|ajuste))?(?: (?:nuevo|nueva|${FILL}))*$`);
const APPROVAL = new RegExp(`^(?:me (?:parece|late) bien|me gusta|asi (?:esta|queda) bien|esta (?:bien|perfecto)|eso es|exacto|asi mero|va que va)(?: (?:${FILL}))*$`);
const INSIST = /(?:^|\s)no\s+(?:veo|aparece|sale|se\s+(?:ve|creo|genero|hizo)|lo\s+(?:hiciste|creaste|generaste|veo))(?=\s+(?:el|la|lo|los|las|ningun|ninguna|nada|cambio|diseno|diapositiva|nuevo|nueva|resultado|hagas|que)\b|\s*$)/;
const words = (message: string) => message.trim().split(/\s+/).filter(Boolean).length;

/** A brief affirmative, tolerant to typos («sik», «siii», «créalo», «sí, está bien»). A reply
 * with a correction («sí, pero…»), a question or more than 8 words goes back to understanding. */
export function isDesignConfirmation(message: string): boolean {
  if (message.length > 80 || words(message) > 8 || /[?¿]/.test(message)) return false;
  const tokens = confirmationTokens(message);
  return !tokens.some(token => CHANGE_WORDS.has(token)) && AFFIRMATIVE.test(tokens.join(' '));
}
/** An affirmative, or a complaint that nothing was created («no veo el diseño nuevo»). Never executes by itself. */
export function isDesignInsistence(message: string): boolean {
  if (isDesignConfirmation(message)) return true;
  if (words(message) > 15 || /[?¿]/.test(message)) return false;
  const tokens = confirmationTokens(message), text = tokens.join(' '), match = INSIST.exec(text);
  if (!match) return false;
  const position = text.slice(0, match.index + (match[0].startsWith(' ') ? 1 : 0)).split(' ').filter(Boolean).length;
  return tokens.every((token, index) => index === position || !CHANGE_WORDS.has(token));
}
/** Closed set of approvals that are not affirmatives («me parece bien», «exacto»). Never executes by itself. */
export function isDesignApproval(message: string): boolean {
  if (/[?¿]/.test(message)) return false;
  const tokens = confirmationTokens(message);
  return tokens.length <= 6 && APPROVAL.test(tokens.join(' '));
}

/** Plan identity without wording: a rephrased instruction or reason is the same plan. */
export function designPlanIdentity(action: ConversationNextAction | null | undefined): string {
  if (!action) return 'null';
  return JSON.stringify({ kind: action.kind, design_source: action.design_source ?? null, from_slide: action.from_slide ?? false,
    rewrite: action.rewrite ?? false, reference_ids: [...action.reference_ids].sort(), element_html_hash: action.element_html_hash ?? null,
    element_edits: action.element_edits ?? null });
}
type KeyOptions = Pick<UseDesignConversationOptions, 'format' | 'base' | 'settings' | 'deckSlides' | 'slide'>;
function confirmationParts(state: DesignConversationState, options: KeyOptions) {
  const consulted = new Set(state.inspected_slide_ids ?? []);
  return { target: state.target, version: state.selected_version_id, format: options.format ?? null, base: options.base ?? null,
    copy: [state.copy.status, state.copy.text], brand: state.brand_key, references: state.references.map(ref => [ref.id, ref.role, ref.sha256]),
    consulted: (options.deckSlides ?? []).filter(slide => consulted.has(slide.id)).map(slide => [slide.id, slide.revision]),
    source: state.design_source ?? null, plan: designPlanIdentity(state.next_action) };
}
/** Revisions/immutable version IDs identify the exact source reviewed by the user. Model, quality
 * and unrelated slides do not change the plan; the key is durable across devices. */
export function designConfirmationKey(state: DesignConversationState, options: KeyOptions): string {
  return `v2:${JSON.stringify(confirmationParts(state, options))}`;
}
const CHANGE_LABELS: Record<keyof ReturnType<typeof confirmationParts>, string> = { target: 'la diapositiva', format: 'el formato', base: 'la base',
  references: 'las referencias', version: 'la versión', copy: 'el texto', brand: 'la marca', consulted: 'las diapositivas consultadas',
  source: 'la fuente', plan: 'la propuesta' };
const list = (items: string[]) => items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items.at(-1)}` : items[0] ?? '';
/** What changed between two confirmation keys, in Spanish. */
export function designConfirmationChanges(before: string, after: string): string {
  if (!before.startsWith('v2:') || !after.startsWith('v2:')) return 'la versión de la aplicación';
  try {
    const left = JSON.parse(before.slice(3)) as Record<string, unknown>, right = JSON.parse(after.slice(3)) as Record<string, unknown>;
    const changed = (Object.keys(CHANGE_LABELS) as Array<keyof typeof CHANGE_LABELS>)
      .filter(key => JSON.stringify(left[key] ?? null) !== JSON.stringify(right[key] ?? null)).map(key => CHANGE_LABELS[key]);
    return list(changed) || 'las opciones del diseño';
  } catch { return 'la versión de la aplicación'; }
}
export type DesignPlanBlocker = { reason: 'none' | 'busy' | 'copy' | 'question' | 'stale'; detail?: string };
/** Why the plan in the state cannot run now; null means nothing blocks it (it may still be unarmed). */
export function designPlanBlocker(state: DesignConversationState, options: KeyOptions): DesignPlanBlocker | null {
  const kind = state.next_action?.kind;
  if (!isDesignGeneration(kind)) return { reason: 'none' };
  if (state.pending) return { reason: 'busy' };
  if (needsResolvedCopy(kind) && state.copy.status === 'pending') return { reason: 'copy' };
  const question = state.understanding?.pending_questions[0];
  if (question) return { reason: 'question', detail: question };
  if (state.confirmation) {
    const key = designConfirmationKey(state, options);
    if (state.confirmation.context_key !== key) return { reason: 'stale', detail: designConfirmationChanges(state.confirmation.context_key, key) };
  }
  return null;
}
export function canConfirmDesign(state: DesignConversationState, options: KeyOptions): boolean {
  return !!state.confirmation && designPlanBlocker(state, options) === null;
}
const significant = (text: string) => new Set(confirmationTokens(text).filter(token => token.length >= 3));
/** Same operation and an equivalent instruction (Jaccard ≥ 0.6 over words of 3+ letters). */
export function samePlan(left: ConversationNextAction | null | undefined, right: ConversationNextAction | null | undefined): boolean {
  if (!left || !right || designPlanIdentity(left) !== designPlanIdentity(right)) return false;
  const a = significant(left.instruction), b = significant(right.instruction), union = new Set([...a, ...b]);
  if (!union.size) return true;
  return [...a].filter(token => b.has(token)).length / union.size >= 0.6;
}
/** Local replies for a plan that cannot run (no model call). */
export function designBlockerText(blocker: DesignPlanBlocker): string {
  if (blocker.reason === 'stale') return `No lo creé: después del plan cambiaste ${blocker.detail || 'las opciones del diseño'}. Pulsa «Actualizar propuesta» y lo preparo con lo nuevo.`;
  if (blocker.reason === 'busy') return 'Todavía estoy terminando la solicitud anterior. Cuando acabe, responde «sí» otra vez.';
  if (blocker.reason === 'copy') return 'No lo creé: falta el texto exacto del diseño. Escríbelo aquí o pulsa «Resolver texto».';
  if (blocker.reason === 'question') return `Todavía no puedo crearlo: necesito tu respuesta a «${blocker.detail ?? ''}».`;
  return 'No tengo un cambio listo para crear. Dime en una frase qué quieres (por ejemplo «agrega 3 cuadros con estos textos: …») y lo hago en ese turno.';
}
/** Label of the button that executes the armed plan. */
export function designActionLabel(action: Pick<ConversationNextAction, 'kind' | 'rewrite'> | null | undefined): string {
  if (action?.kind === 'edit_elements') return 'Hacer el cambio';
  if (action?.kind === 'refine_html' && action.rewrite) return 'Rehacer diapositiva';
  if (action?.kind === 'refine_html' || action?.kind === 'edit_image') return 'Crear ajuste';
  return 'Crear diseño';
}
