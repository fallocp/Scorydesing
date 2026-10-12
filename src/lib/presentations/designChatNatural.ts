import { versionReview, type DesignConversationState } from './designConversationStore';
import type { DesignVisualReview } from './designVisualReview';
import { describeVisualReview } from './designVisualReview';
import { describeStyleLock } from './styleLock';
import { isDesignConfirmation } from './designConversationConfirmation';

/** Steps shown in the chat thread while a turn runs («✓ Leí la diapositiva · 0.4 s»). */
export interface DesignStep { id: string; label: string; doneLabel: string; status: 'running' | 'done' | 'failed'; ms?: number }
export const formatStepTime = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const firstSentence = (text: string, max: number) => (text.trim().split(/(?<=[.!?])\s/)[0] ?? '').slice(0, max).trim().replace(/[.!?]+$/, '');
const lowerFirst = (text: string) => text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
const normalized = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¡!¿?.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();

const THANKS = /^(muchas |mil )?gracias( (de nuevo|otra vez|por todo))?( (genial|perfecto|super))?$|^(ok|vale|perfecto|genial|super) gracias$|^thanks?( you)?$/;
const WHAT_CHANGED = /^(que|cuales?) (cambiaste|cambios hiciste|has cambiado|hiciste|modificaste)( (en (la|esta) (version|diapositiva|propuesta)|exactamente))?$/;

/** What happened in the last version, built from the saved state (no model call). */
export function summarizeLastChange(state: DesignConversationState): string {
  const version = state.versions.find(item => item.id === state.selected_version_id) ?? state.versions.at(-1);
  if (!version) return 'Todavía no he cambiado nada en esta sesión. Dime qué quieres ajustar.';
  const number = state.versions.indexOf(version) + 1;
  const asked = [...state.messages].reverse().find(item => item.role === 'user' && item.turn_id === version.turn_id)?.text;
  const plan = state.understanding?.resolved_instruction;
  const lead = asked && !isDesignConfirmation(asked) ? `En la v${number} hice lo que pediste: «${asked.trim().slice(0, 160)}».`
    : plan ? `En la v${number}: ${lowerFirst(firstSentence(plan, 200))}.` : `La v${number} es la última versión del diseño.`;
  const style = version.kind === 'html' ? describeStyleLock(version.proposal.styleLock) : '';
  const reviewed = versionReview(state, version);
  const review = reviewed?.status === 'needs_review' ? describeVisualReview(reviewed) : '';
  return [lead, style, review].filter(Boolean).join(' ');
}

/** Instant answers that never need the planner: thanks, «¿qué cambiaste?» and a bare «sí» with nothing to run. */
export function localChatReply(message: string, state: DesignConversationState): string | null {
  const text = normalized(message);
  if (!text || text.length > 60) return null;
  if (THANKS.test(text)) return 'De nada. Si quieres otro ajuste, aquí sigo.';
  if (WHAT_CHANGED.test(text)) return summarizeLastChange(state);
  // A «sí» answers something: only reply locally when there is no plan, question or text pending.
  if (isDesignConfirmation(message) && !state.next_action && !state.confirmation && !state.understanding?.pending_questions.length
    && !(state.understanding && state.copy.status === 'pending')) return 'No tengo nada pendiente por hacer. Dime qué cambio quieres y lo preparo.';
  return null;
}

/** «@N» in the chat names slide N of this presentation (its source or style). */
const MENTION = /(^|[\s(«"'])@(\d{1,3})(?![\d\w])/g;
export function resolveSlideMentions(text: string, slides: ReadonlyArray<{ title: string }>): { text: string; slides: number[] } {
  const found: number[] = [];
  const resolved = text.replace(MENTION, (match, before: string, digits: string) => {
    const number = Number(digits);
    if (number < 1 || number > slides.length) return match;
    if (!found.includes(number)) found.push(number);
    const title = slides[number - 1].title?.trim();
    return `${before}la diapositiva ${number}${title ? ` («${title.slice(0, 80)}»)` : ''}`;
  });
  return { text: resolved, slides: found };
}
/** The user names other slides or the deck: only then does the turn carry the presentation summary. */
export function citesSlides(text: string): boolean {
  return /@\d|\b(diapositivas?|slides?|l[aá]minas?)\s+(\d|n[uú]mero)|\b(la|las)\s+(primera|segunda|tercera|cuarta|quinta|anterior|siguiente|demás|otras)\b|\bpresentaci[oó]n\b|\bdeck\b|\bel resto\b/i.test(text);
}

const VISUAL_WORDS = /imagen|foto|barco|color|tamañ|grande|pequeñ|chic|horizontal|vertical|acomod|composici|estilo|fondo|tarjeta|recuadro|cuadro|[ií]cono|logo|alinea|mueve|mover|posici|espacio|lado|izquierd|derech|arriba|abajo|centr|column|fila|diseñ|se ve|look|turquesa|coral|navy|sombra|borde/i;
const TEXT_WORDS = /\b(texto|t[ií]tulo|subt[ií]tulo|frase|palabra|ortograf|tradu|redacci|escribe|cambia\s+(el|la)\s+(t[ií]tulo|texto|frase))|[«"“][^«»"“”]{2,}[»"”]/i;
/** A pure text edit («cambia el título a «…»») does not need a capture of the slide for the planner. */
export function isTextOnlyRequest(text: string): boolean {
  return TEXT_WORDS.test(text) && !VISUAL_WORDS.test(text.replace(/[«"“][^«»"“”]*[»"”]/g, ''));
}

/** First message of a result shown before its review: says what changed, never that the review passed. */
export function designReadyMessage(summary: string, notices: readonly string[] = []): string {
  const what = lowerFirst(firstSentence(summary, 180));
  return [`Aquí está${what ? `: ${what}` : ' la propuesta'}. La reviso en segundo plano y te aviso si algo no cuadra.`, ...notices].join(' ');
}
/** Short note the background review adds to the chat; honest about anything the request still misses. */
export function backgroundReviewNote(review: DesignVisualReview, worse = false): string {
  const lead = worse ? 'La corrección dejó más problemas que la versión anterior; puedes volver a ella en la tira de versiones. ' : '';
  if (review.status === 'passed') return `${lead}Revisada: no vi problemas. ¿Algo más?`;
  if (review.status === 'unavailable') return `${lead}No pude terminar la revisión automática; échale un ojo antes de aplicarla.`;
  return `${lead}${describeVisualReview(review)}`;
}
