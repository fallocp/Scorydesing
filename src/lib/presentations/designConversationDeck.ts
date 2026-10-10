import { CONVERSATION_DECK_LIMITS, type ConversationInspectedSlide, type ConversationPresentationContext,
  type ConversationPresentationSlide } from '../../../supabase/functions/_shared/desaing/conversationActions';
import type { ExplorationRequest } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { PresentationSlide } from './presentationDocument';
import { buildConversationHtmlExample, buildConversationHtmlSummary } from './designConversationHtml';

const OMITTED = '… [resumen truncado]';
const clip = (value: string, length: number) => value.length > length ? value.slice(0, length - OMITTED.length) + OMITTED : value;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const clean = (value: string) => value.replace(CONTROL, '').trim();
const validId = (value: string) => !!value.trim() && value.length <= 256 && clean(value) === value;

function effectiveSlides(slides: ReadonlyArray<PresentationSlide>, currentSlide?: PresentationSlide): PresentationSlide[] {
  if (!slides.length || slides.length > CONVERSATION_DECK_LIMITS.maxSlides) throw Error('conversation_presentation_slide_limit');
  if (currentSlide && !slides.some(slide => slide.id === currentSlide.id)) throw Error('conversation_presentation_current_slide_missing');
  const ids = new Set<string>();
  return slides.map(original => {
    const slide = original.id === currentSlide?.id ? currentSlide : original;
    if (!validId(slide.id) || ids.has(slide.id) || !Number.isSafeInteger(slide.revision) || slide.revision < 1)
      throw Error('conversation_presentation_invalid_slide');
    ids.add(slide.id); return slide;
  });
}

function entry(slide: PresentationSlide, index: number): ConversationPresentationSlide {
  return { id: slide.id, number: index + 1, title: clip(clean(slide.title) || `Diapositiva ${index + 1}`, CONVERSATION_DECK_LIMITS.maxSlideTitleChars),
    revision: String(slide.revision) };
}

/** The full ordered catalog is context for reading, regardless of HTML/image or chosen design base. */
export function buildConversationPresentationContext(options: {
  projectId: string; projectName: string; documentId: string; presentationName: string;
  slides: ReadonlyArray<PresentationSlide>; currentSlideId: string; currentSlide?: PresentationSlide;
}): ConversationPresentationContext {
  const slides = effectiveSlides(options.slides, options.currentSlide);
  if (!validId(options.projectId) || !validId(options.documentId)) throw Error('conversation_presentation_invalid_identity');
  if (!slides.some(slide => slide.id === options.currentSlideId) || options.currentSlide && options.currentSlide.id !== options.currentSlideId)
    throw Error('conversation_presentation_current_slide_missing');
  return { project: { id: options.projectId, name: clip(clean(options.projectName) || 'Proyecto actual', 200) },
    presentation: { id: options.documentId, name: clip(clean(options.presentationName) || 'Presentación actual', 200) },
    current_slide_id: options.currentSlideId, slides: slides.map(entry) };
}

/** Resolve exact model-selected IDs against the current deck; never silently substitute or truncate. */
export function selectConversationInspectionSlides(slides: ReadonlyArray<PresentationSlide>, requestedIds: readonly string[],
  currentSlide?: PresentationSlide): PresentationSlide[] {
  const available = effectiveSlides(slides, currentSlide);
  if (!requestedIds.length || requestedIds.length > CONVERSATION_DECK_LIMITS.maxInspectionSlides
    || new Set(requestedIds).size !== requestedIds.length || requestedIds.some(id => !available.some(slide => slide.id === id)))
    throw Error('conversation_presentation_invalid_selection');
  const requested = new Set(requestedIds);
  return available.filter(slide => requested.has(slide.id));
}

/** Preserve actual numbers even when the selected subset is noncontiguous. Pixels, if present, share a labelled contact sheet. */
export function buildConversationInspectedSlides(slides: ReadonlyArray<PresentationSlide>, requestedIds: readonly string[],
  referenceId?: string, currentSlide?: PresentationSlide): ConversationInspectedSlide[] {
  if (referenceId !== undefined && (!validId(referenceId) || !referenceId.startsWith('deck:')))
    throw Error('conversation_presentation_invalid_capture');
  const selected = selectConversationInspectionSlides(slides, requestedIds, currentSlide), requested = new Set(selected.map(slide => slide.id));
  return effectiveSlides(slides, currentSlide).flatMap((slide, index) => requested.has(slide.id) ? [{ ...entry(slide, index),
    summary: buildConversationHtmlSummary(slide.html, CONVERSATION_DECK_LIMITS.maxSummaryChars),
    ...(referenceId ? { reference_id: referenceId } : {}) }] : []);
}

/** The HTML backend accepts three examples; group requested slides without dropping any of the twelve inspected sources. */
export function buildConversationInspectionExamples(slides: ReadonlyArray<PresentationSlide>, requestedIds: readonly string[],
  currentSlide?: PresentationSlide): string[] {
  const selected = selectConversationInspectionSlides(slides, requestedIds, currentSlide);
  const groups: string[][] = Array.from({ length: Math.min(3, selected.length) }, () => []);
  const perGroup = Math.ceil(selected.length / groups.length);
  for (const [position, slide] of selected.entries()) {
    const index = slides.findIndex(item => item.id === slide.id), source = entry(slide, index);
    groups[Math.floor(position / perGroup)].push(`DIAPOSITIVA ${source.number}: ${JSON.stringify(source)}\n${buildConversationHtmlExample(slide.html, 9000)}`);
  }
  return groups.filter(group => group.length).map(group => `DIAPOSITIVAS INSPECCIONADAS (datos consultados; reutilizar sólo lo indicado en el encargo aprobado)\n${group.join('\n\n')}`);
}

/** Fit the server's UTF-8 request budget without removing a slide from the catalog, approved copy or the pending plan.
 * History and structural evidence are lossy context; omitted evidence is always marked.
 * `historyComplete`: the caller sent every message. Only then, and only while nothing
 * of the history or the catalog texts is trimmed, the server may check edit texts. */
export function fitConversationPresentationRequest(request: ExplorationRequest, maxBytes = 65536, historyComplete = false): ExplorationRequest {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2048 || maxBytes > 65536) throw Error('conversation_presentation_invalid_budget');
  const next = structuredClone(request), encoder = new TextEncoder();
  const fits = () => encoder.encode(JSON.stringify(next)).length <= maxBytes;
  // Set first, so its own bytes are budgeted; trimming only removes it.
  if (historyComplete && next.conversation?.supports_structural_edits === 1 && next.conversation.editable_elements?.length)
    next.conversation.editable_text_complete = 1;
  if (fits()) return next;
  while (next.history.length && !fits()) { next.history.shift(); delete next.conversation?.editable_text_complete; }
  if (fits()) return next;
  // The editor catalog is optional assistance, unlike the agreed copy or
  // source identity. Shorten descriptions before reducing the offered targets.
  const turn = next.conversation;
  if (turn?.editable_elements) {
    delete turn.editable_text_complete;
    for (const [textLimit, labelLimit] of [[160, 80], [80, 40], [40, 24], [0, 24]]) {
      for (const element of turn.editable_elements) {
        element.label = clip(element.label, labelLimit);
        if (element.text !== undefined) {
          if (textLimit) element.text = clip(element.text, textLimit);
          else delete element.text;
        }
      }
      for (const asset of turn.editable_assets ?? []) asset.label = clip(asset.label, labelLimit);
      if (fits()) return next;
    }
    for (const count of [40, 20, 10, 0]) {
      if (turn.editable_elements.length <= count && count !== 0) continue;
      if (count) turn.editable_elements = turn.editable_elements.slice(0, count);
      else {
        delete turn.editable_elements; delete turn.editable_assets; delete turn.editable_html_hash;
        turn.available_actions = turn.available_actions.filter(action => action !== 'edit_elements');
      }
      if (fits()) return next;
      if (!turn.editable_elements) break;
    }
  }
  const deck = next.conversation?.presentation;
  for (const limit of [1000, 600, 300, 200]) {
    for (const slide of deck?.inspected_slides ?? []) slide.summary = clip(slide.summary, limit);
    if (fits()) return next;
  }
  for (const limit of [64, 40, 24]) {
    for (const slide of deck?.slides ?? []) slide.title = clip(slide.title, limit);
    for (const slide of deck?.inspected_slides ?? []) slide.title = deck!.slides.find(indexed => indexed.id === slide.id)!.title;
    if (fits()) return next;
  }
  for (const limit of [6000, 3000, 1500, 600]) {
    for (const slide of next.conversation?.deck_style?.slides ?? []) slide.summary = clip(slide.summary, limit);
    if (next.conversation?.current_html) next.conversation.current_html.summary = clip(next.conversation.current_html.summary, limit);
    if (next.conversation?.slide_html) next.conversation.slide_html.summary = clip(next.conversation.slide_html.summary, limit);
    if (fits()) return next;
  }
  throw Error('conversation_presentation_context_too_large');
}
