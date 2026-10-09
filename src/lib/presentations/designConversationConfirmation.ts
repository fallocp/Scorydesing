import type { DesignConversationState } from './designConversationStore';
import type { UseDesignConversationOptions } from './useDesignConversation';

export const isDesignGeneration = (kind?: string) => !!kind && !['discuss', 'explore_ideas', 'inspect_slides'].includes(kind);

/** A brief affirmative authorizes only a concrete plan already shown. A reply
 * containing a correction ("sí, pero...") must go back through understanding. */
export function isDesignConfirmation(message: string): boolean {
  const text = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    .replace(/[.!¡¿?]+/g, '').replace(/\s+/g, ' ');
  return /^(?:(?:si|ok|okay|vale|va|adelante|de acuerdo|perfecto|confirmo)(?:,?\s+(?:si|ok|adelante|hazlo|creala|crealo|generala|generalo|asi|esta bien|por favor))*|hazlo|creala|crealo|generala|generalo)(?:\s+por favor)?$/.test(text);
}

/** Revisions/immutable version IDs identify the exact source reviewed by the user.
 * The key is durable, so reopening a conversation never reinterprets approval. */
export function designConfirmationKey(state: DesignConversationState, options: Pick<UseDesignConversationOptions,
  'format' | 'base' | 'settings' | 'deckSlides' | 'slide'>): string {
  return JSON.stringify({ target: state.target, version: state.selected_version_id, format: options.format ?? null,
    base: options.base ?? null, settings: options.settings, copy: state.copy, brand: state.brand_key,
    references: state.references.map(ref => [ref.id, ref.role, ref.sha256]),
    deck: options.deckSlides?.map(slide => [slide.id, slide.revision, slide.title]) ?? [],
    consulted: state.inspected_slide_ids ?? [], source: state.design_source ?? null, action: state.next_action });
}

export function canConfirmDesign(state: DesignConversationState, options: Parameters<typeof designConfirmationKey>[1]): boolean {
  return !!state.confirmation && !state.pending && isDesignGeneration(state.next_action?.kind)
    && state.copy.status !== 'pending' && !state.understanding?.pending_questions.length
    && state.confirmation.context_key === designConfirmationKey(state, options);
}
