import type { DesignContext } from './contracts.ts';
import { assertConversationNextAction, assertConversationTurn, DECK_ARCHETYPE_IDS, DECK_CARD_LIMIT, DECK_CARD_ORIENTATIONS, DECK_IMAGE_SIDES } from './conversationActions.ts';
import type { ConversationNextAction } from './conversationActions.ts';
import { FULL_DESIGN_MARKER, fullDesignImmutables, readPresentationFullDesign } from './presentationFullDesign.ts';
import type { DesignCopy, DesignUnderstanding, ExplorationDesignBrief, ExplorationRequest, ExplorationResult, ExplorationScope, ExplorationSession, IdeaContent, IdeaSelection, IdeaSource, TextIdea, TextIdeaSet } from './explorationContracts.ts';

export const IDEA_ASPECTS = ['subject', 'composition', 'style', 'palette'] as const;
export const EXPLORATION_REFERENCE_ROLES = ['layout_reference', 'image_style_reference', 'object_reference', 'content_source', 'brand_reference', 'target_render', 'placement_context'] as const;
export const PENDING_EXPLORATION_COPY_MARKER = 'Pendiente de resolver el texto literal del diseño. Las indicaciones sobre referencias no son texto para imprimir.';
export class ExplorationError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'ExplorationError'; }
}
function check(value: unknown, code = 'invalid_exploration_state'): asserts value { if (!value) throw new ExplorationError(code); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown, max = 4000, empty = false): value is string => typeof value === 'string' && value.length <= max
  && (empty || !!value.trim()) && !value.includes('\0');
const id = (value: unknown): value is string => text(value, 256) && !/[\x00-\x1f\x7f]/.test(value);
const keys = (value: unknown, names: string[], required = names): value is Record<string, unknown> => record(value)
  && Object.keys(value).every(key => names.includes(key)) && required.every(key => key in value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : record(value) ? `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value) ?? 'undefined';
const selectionKey = (selection: IdeaSelection) => canonical([selection.set_id, selection.idea_id, selection.version]);
const identity = (context: DesignContext) => canonical([context.actor_id, context.business_id, context.session_id]);
const contextKey = (context: DesignContext) => { const { interaction_mode: _, ...rest } = context; return canonical(rest); };
function assertDesignCopy(value: unknown, context: DesignContext): asserts value is DesignCopy {
  check(keys(value, ['status', 'text', 'source_reference_ids']) && ['pending', 'literal', 'none'].includes(String(value.status))
    && text(value.text, 4000, true), 'invalid_exploration_copy');
  check(value.status === 'literal' ? !!String(value.text).trim() : value.text === '', 'invalid_exploration_copy');
  check(Array.isArray(value.source_reference_ids) && value.source_reference_ids.length <= 4
    && new Set(value.source_reference_ids).size === value.source_reference_ids.length
    && value.source_reference_ids.every(ref => context.references.some(reference => reference.reference_id === ref)), 'invalid_exploration_copy');
  check(value.status !== 'none' || !value.source_reference_ids.length, 'invalid_exploration_copy');
}
export const STYLE_UNLOCKS = ['typography', 'colors', 'components', 'layout'] as const;
export const ACCENT_PLAN_LIMIT = 12;
export function assertDesignUnderstanding(value: unknown, context: DesignContext): asserts value is DesignUnderstanding {
  check(keys(value, ['intent', 'resolved_instruction', 'copy', 'references', 'preserve', 'pending_questions', 'unlock', 'accent_plan', 'archetype_id', 'variation'],
    ['intent', 'resolved_instruction', 'copy', 'references', 'preserve', 'pending_questions'])
    && ['recreate', 'variation', 'explore'].includes(String(value.intent)) && text(value.resolved_instruction, 6000), 'invalid_design_understanding');
  check(value.archetype_id === undefined || DECK_ARCHETYPE_IDS.includes(value.archetype_id as typeof DECK_ARCHETYPE_IDS[number]), 'invalid_design_understanding');
  check(value.variation === undefined || keys(value.variation, ['card_count', 'orientation', 'image_side'])
    && Number.isSafeInteger(value.variation.card_count) && (value.variation.card_count as number) >= 0 && (value.variation.card_count as number) <= DECK_CARD_LIMIT
    && DECK_CARD_ORIENTATIONS.includes(value.variation.orientation as typeof DECK_CARD_ORIENTATIONS[number])
    && DECK_IMAGE_SIDES.includes(value.variation.image_side as typeof DECK_IMAGE_SIDES[number]), 'invalid_design_understanding');
  check(value.unlock === undefined || Array.isArray(value.unlock) && value.unlock.length <= STYLE_UNLOCKS.length
    && new Set(value.unlock).size === value.unlock.length
    && value.unlock.every(item => STYLE_UNLOCKS.includes(item as typeof STYLE_UNLOCKS[number])), 'invalid_design_understanding');
  check(value.accent_plan === undefined || Array.isArray(value.accent_plan) && value.accent_plan.length <= ACCENT_PLAN_LIMIT
    && value.accent_plan.every(item => keys(item, ['element', 'words', 'color', 'italic']) && text(item.element, 200) && text(item.words, 400)
      && text(item.color, 40) && typeof item.italic === 'boolean'), 'invalid_design_understanding');
  assertDesignCopy(value.copy, context);
  check(Array.isArray(value.references) && value.references.length <= 4, 'invalid_design_understanding');
  const seen = new Set<string>();
  for (const reference of value.references) {
    check(keys(reference, ['reference_id', 'roles', 'instruction']) && id(reference.reference_id)
      && context.references.some(ref => ref.reference_id === reference.reference_id) && !seen.has(reference.reference_id)
      && text(reference.instruction, 1200) && Array.isArray(reference.roles) && reference.roles.length > 0 && reference.roles.length <= 7
      && new Set(reference.roles).size === reference.roles.length
      && reference.roles.every(role => EXPLORATION_REFERENCE_ROLES.includes(role as typeof EXPLORATION_REFERENCE_ROLES[number])), 'invalid_design_understanding');
    seen.add(reference.reference_id);
  }
  check(Array.isArray(value.preserve) && value.preserve.length <= 30 && value.preserve.every(item => text(item, 1200))
    && Array.isArray(value.pending_questions) && value.pending_questions.length <= 8 && value.pending_questions.every(item => text(item, 1200)), 'invalid_design_understanding');
}
function assertDesignBrief(value: unknown, context: DesignContext): asserts value is ExplorationDesignBrief {
  check(keys(value, ['copy', 'brand', 'selected_instruction', 'preserve', 'previous_understanding'], ['copy', 'brand', 'selected_instruction', 'preserve'])
    && text(value.selected_instruction, 6000, true) && Array.isArray(value.preserve) && value.preserve.length <= 30
    && value.preserve.every(item => text(item, 1200)), 'invalid_exploration_brief');
  assertDesignCopy(value.copy, context);
  if (value.brand !== null) {
    const brand = value.brand;
    check(keys(brand, ['brand_id', 'name', 'summary', 'palette', 'typography']) && brand.brand_id === context.brand_id
      && text(brand.name, 200) && text(brand.summary, 6000, true)
      && Array.isArray(brand.palette) && brand.palette.length <= 16 && brand.palette.every(item => text(item, 200))
      && Array.isArray(brand.typography) && brand.typography.length <= 16 && brand.typography.every(item => text(item, 200)), 'invalid_exploration_brand');
  }
  if (value.previous_understanding !== undefined) assertDesignUnderstanding(value.previous_understanding, context);
  check(context.references.length <= 4, 'exploration_reference_limit');
}
function assertContext(value: unknown): asserts value is DesignContext {
  check(keys(value, ['actor_id', 'business_id', 'brand_id', 'project_id', 'session_id', 'workspace', 'interaction_mode', 'target', 'instruction',
    'immutable_elements', 'copy_version_id', 'base_asset', 'references', 'placement', 'direction_approval'],
  ['actor_id', 'business_id', 'brand_id', 'project_id', 'session_id', 'workspace', 'interaction_mode', 'target', 'instruction', 'immutable_elements', 'references']));
  for (const key of ['actor_id', 'business_id', 'brand_id', 'project_id', 'session_id']) check(id(value[key]));
  check(['onboarding', 'presentations', 'free_design', 'production'].includes(String(value.workspace))
    && ['execute_change', 'explore_design'].includes(String(value.interaction_mode)) && text(value.instruction, 16000, true));
  check(keys(value.target, ['document_type', 'document_id', 'revision', 'slide_id', 'page_id', 'element_id'], ['document_type', 'document_id', 'revision']));
  check(Object.values(value.target).every(id) && ['image', 'carousel', 'presentation', 'cover', 'page', 'special'].includes(String(value.target.document_type)));
  if (['presentation', 'carousel'].includes(String(value.target.document_type))) check(id(value.target.slide_id));
  check(Array.isArray(value.immutable_elements) && value.immutable_elements.length <= 50 && value.immutable_elements.every(item => text(item)));
  check(Array.isArray(value.references) && value.references.length <= 16);
  const referenceIds = new Set<string>();
  for (const reference of value.references) {
    check(keys(reference, ['business_id', 'asset_id', 'version_id', 'reference_id', 'mime_type', 'roles']));
    check(reference.business_id === value.business_id && ['asset_id', 'version_id', 'reference_id', 'mime_type'].every(key => id(reference[key])));
    check(!referenceIds.has(reference.reference_id as string)); referenceIds.add(reference.reference_id as string);
    check(Array.isArray(reference.roles) && reference.roles.length > 0 && reference.roles.length <= 7
      && new Set(reference.roles).size === reference.roles.length && reference.roles.every(role =>
        ['layout_reference', 'image_style_reference', 'object_reference', 'content_source', 'brand_reference', 'target_render', 'placement_context'].includes(String(role))));
    check(reference.roles.every(role => role === 'content_source') || String(reference.mime_type).startsWith('image/'));
  }
  if (value.copy_version_id !== undefined) check(id(value.copy_version_id));
  const asset = (entry: unknown) => check(keys(entry, ['business_id', 'asset_id', 'version_id'])
    && entry.business_id === value.business_id && id(entry.asset_id) && id(entry.version_id));
  if (value.base_asset !== undefined) asset(value.base_asset);
  if (value.direction_approval !== undefined) {
    check(keys(value.direction_approval, ['candidate', 'immutable_elements']));
    const candidate = value.direction_approval.candidate;
    check(keys(candidate, ['business_id', 'asset_id', 'version_id', 'candidate_id']) && id(candidate.candidate_id));
    const { candidate_id: _, ...version } = candidate; asset(version);
    check(Array.isArray(value.direction_approval.immutable_elements) && value.direction_approval.immutable_elements.every(item => text(item)));
  }
  if (value.placement !== undefined) {
    const placement = value.placement;
    check(keys(placement, ['capture_reference_id', 'document_revision', 'canvas', 'region']) && referenceIds.has(String(placement.capture_reference_id))
      && placement.document_revision === value.target.revision && keys(placement.canvas, ['width', 'height'])
      && keys(placement.region, ['x', 'y', 'width', 'height', 'units']));
    check([placement.canvas.width, placement.canvas.height].every(v => count(v) && v > 0));
    const region = placement.region;
    check(['px', 'normalized'].includes(String(region.units)) && [region.x, region.y, region.width, region.height].every(v => typeof v === 'number' && Number.isFinite(v)));
    check(Number(region.x) >= 0 && Number(region.y) >= 0 && Number(region.width) > 0 && Number(region.height) > 0
      && Number(region.x) + Number(region.width) <= (region.units === 'px' ? Number(placement.canvas.width) : 1)
      && Number(region.y) + Number(region.height) <= (region.units === 'px' ? Number(placement.canvas.height) : 1));
  }
}
function assertSelection(value: unknown): asserts value is IdeaSelection {
  check(keys(value, ['set_id', 'idea_id', 'version']) && id(value.set_id) && id(value.idea_id) && count(value.version) && value.version > 0);
}
function assertContent(value: unknown, context: DesignContext): asserts value is IdeaContent {
  check(keys(value, ['title', 'rationale', 'aspects', 'render_instruction', 'reference_ids']));
  check(text(value.title, 160) && text(value.rationale, 2000) && text(value.render_instruction, 6000)
    && keys(value.aspects, [...IDEA_ASPECTS]) && Object.values(value.aspects).every(item => text(item, 1200)));
  check(Array.isArray(value.reference_ids) && value.reference_ids.length <= 16 && new Set(value.reference_ids).size === value.reference_ids.length
    && value.reference_ids.every(ref => context.references.some(reference => reference.reference_id === ref)));
}
const content = ({ idea_id: _, version: __, sources: ___, feedback: ____, ...value }: TextIdea): IdeaContent => value;
function locate(session: ExplorationSession, selection: IdeaSelection) {
  assertSelection(selection);
  const set = session.sets.find(item => item.set_id === selection.set_id), idea = set?.ideas.find(item => item.idea_id === selection.idea_id && item.version === selection.version);
  check(set && idea, 'exploration_idea_not_found'); return { set, idea };
}
function currentIdea(session: ExplorationSession, selection: IdeaSelection) {
  const found = locate(session, selection);
  check(contextKey(found.set.context) === contextKey(session.context) && found.set.scope === session.scope, 'exploration_context_changed');
  check(latestTextIdeas(found.set).find(idea => idea.idea_id === selection.idea_id)?.version === selection.version, 'exploration_idea_version_changed');
  return found;
}
function changed(session: ExplorationSession): ExplorationSession { assertExplorationSession(session); const next = structuredClone(session); next.revision++; return next; }
function finish(next: ExplorationSession) { assertExplorationSession(next); return next; }

export function assertExplorationRequest(value: unknown): asserts value is ExplorationRequest {
  check(keys(value, ['request_key', 'kind', 'scope', 'context', 'message', 'history', 'design_brief', 'conversation'], ['request_key', 'kind', 'scope', 'context', 'message', 'history']), 'invalid_exploration_request');
  check(id(value.request_key) && String(value.request_key).length <= 200 && ['directions', 'discussion'].includes(String(value.kind))
    && ['asset_in_region', 'full_design'].includes(String(value.scope)) && text(value.message), 'invalid_exploration_request');
  assertContext(value.context);
  if (value.design_brief !== undefined) assertDesignBrief(value.design_brief, value.context);
  if (value.conversation !== undefined) {
    check(value.design_brief !== undefined, 'invalid_conversation_turn');
    assertConversationTurn(value.conversation, value.context);
  }
  check(Array.isArray(value.history) && value.history.length <= 40 && value.history.every(entry => keys(entry, ['role', 'text'])
    && ['user', 'assistant'].includes(String(entry.role)) && text(entry.text, 6000)), 'invalid_exploration_request');
  check(new TextEncoder().encode(JSON.stringify(value)).length <= 65536, 'exploration_request_too_large');
}
export function assertExplorationResult(value: unknown, request: ExplorationRequest): asserts value is ExplorationResult {
  assertExplorationRequest(request);
  check(keys(value, ['request_key', 'message', 'ideas', 'response_id', 'usage', 'design_understanding', 'next_action'], ['request_key', 'message', 'ideas', 'response_id', 'usage']) && value.request_key === request.request_key
    && text(value.message, 6000) && (value.response_id === null || id(value.response_id)), 'invalid_exploration_result');
  check(value.usage === null || keys(value.usage, ['input_tokens', 'output_tokens', 'total_tokens']) && Object.values(value.usage).every(count)
    && value.usage.total_tokens === Number(value.usage.input_tokens) + Number(value.usage.output_tokens), 'invalid_exploration_usage');
  if (request.conversation) {
    check(value.design_understanding !== undefined && value.next_action !== undefined, 'invalid_conversation_action');
    assertDesignUnderstanding(value.design_understanding, request.context);
    assertConversationNextAction(value.next_action, request, value.design_understanding);
  } else check(value.next_action === undefined, 'invalid_conversation_action');
  const nextAction = value.next_action as ConversationNextAction | undefined;
  const ideaCount = request.conversation
    ? (nextAction?.kind === 'explore_ideas' && nextAction.intent === 'requested' ? 5 : 0)
    : (request.kind === 'directions' ? 5 : 0);
  check(Array.isArray(value.ideas) && value.ideas.length === ideaCount, 'invalid_exploration_ideas');
  value.ideas.forEach(idea => assertContent(idea, request.context));
  const normalized = (v: string) => v.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  for (const field of ['title', 'render_instruction'] as const) check(new Set(value.ideas.map(idea => normalized(idea[field]))).size === value.ideas.length, 'duplicate_exploration_ideas');
  check(new Set(value.ideas.map(idea => canonical(idea.aspects))).size === value.ideas.length, 'duplicate_exploration_ideas');
  if (value.design_understanding !== undefined) assertDesignUnderstanding(value.design_understanding, request.context);
}
/** The admitted request stays immutable. A directions response may resolve its pending literal copy
 * for the returned idea set, using only the exact referenced images and an explicitly bound canvas. */
export function expectedExplorationContext(request: ExplorationRequest, result: ExplorationResult): DesignContext {
  assertExplorationResult(result, request);
  const original = structuredClone(request.context), copy = result.design_understanding?.copy;
  if (request.kind !== 'directions' || request.scope !== 'full_design' || !['presentations', 'free_design'].includes(original.workspace)
    || request.design_brief?.copy.status !== 'pending' || copy?.status !== 'literal' || !copy.source_reference_ids.length
    || original.copy_version_id !== undefined || original.direction_approval !== undefined
    || original.immutable_elements.includes(FULL_DESIGN_MARKER)
    || original.immutable_elements.filter(item => item === PENDING_EXPLORATION_COPY_MARKER).length !== 1
    || copy.source_reference_ids.some(id => !original.references.some(reference => reference.reference_id === id
      && reference.mime_type === 'image/png' && /^[a-f0-9]{64}$/.test(reference.version_id)))) return original;
  const canvasMarkers = original.immutable_elements.filter(item => item.startsWith('Lienzo completo: '));
  const dimensions = canvasMarkers.length === 1 && /^Lienzo completo: (\d+)×(\d+)\.$/.exec(canvasMarkers[0]);
  if (!dimensions) return original;
  const canvas = { width: Number(dimensions[1]), height: Number(dimensions[2]) };
  // Do not reinterpret pre-existing copy locks or any other immutable constraint.
  if (original.immutable_elements.some(item => item.startsWith('Texto aprobado, conservar literalmente:')
    || item.startsWith('ScoryDesign: modo de texto del diseño '))) return original;
  try {
    const resolved = { ...original, immutable_elements: [...fullDesignImmutables(copy.text, canvas), ...original.immutable_elements
      .filter(item => item !== PENDING_EXPLORATION_COPY_MARKER && item !== canvasMarkers[0])] };
    assertContext(resolved);
    if (!readPresentationFullDesign(resolved)) return original;
    return resolved;
  } catch { return original; }
}
export function assertExplorationSession(value: unknown): asserts value is ExplorationSession {
  check(keys(value, ['schema_version', 'revision', 'context', 'scope', 'messages', 'sets', 'attempts', 'selected', 'render_bindings'])
    && value.schema_version === 1 && count(value.revision) && ['asset_in_region', 'full_design'].includes(String(value.scope)));
  assertContext(value.context);
  check(Array.isArray(value.messages) && value.messages.length <= 200 && Array.isArray(value.attempts) && value.attempts.length <= 100
    && Array.isArray(value.sets) && value.sets.length <= 100 && Array.isArray(value.render_bindings) && value.render_bindings.length <= 200);
  const session = value as unknown as ExplorationSession, attempts = new Map<string, typeof session.attempts[number]>();
  for (const attempt of session.attempts) {
    check(keys(attempt, ['request', 'status', 'result'], ['request', 'status']) && ['running', 'completed', 'uncertain'].includes(attempt.status));
    assertExplorationRequest(attempt.request);
    check(identity(attempt.request.context) === identity(session.context) && attempt.request.scope === session.scope && !attempts.has(attempt.request.request_key));
    check((attempt.status === 'completed') === (attempt.result !== undefined));
    if (attempt.result) assertExplorationResult(attempt.result, attempt.request);
    attempts.set(attempt.request.request_key, attempt);
  }
  check(session.attempts.filter(attempt => attempt.status === 'running').length <= 1);
  const seen = new Set<string>(), sets = new Set<string>();
  for (const set of session.sets) {
    check(keys(set, ['set_id', 'request_key', 'context', 'scope', 'ideas', 'response_id', 'usage']) && set.set_id === set.request_key && !sets.has(set.set_id));
    const attempt = attempts.get(set.request_key);
    check(attempt?.status === 'completed' && attempt.request.kind === 'directions' && canonical(expectedExplorationContext(attempt.request, attempt.result!)) === canonical(set.context)
      && set.scope === attempt.request.scope && canonical(set.usage) === canonical(attempt.result!.usage) && set.response_id === attempt.result!.response_id);
    sets.add(set.set_id); check(Array.isArray(set.ideas) && set.ideas.length >= 5 && set.ideas.length <= 100);
    const versions = new Map<string, number>();
    for (const [index, idea] of set.ideas.entries()) {
      check(keys(idea, ['idea_id', 'version', 'sources', 'feedback', 'title', 'rationale', 'aspects', 'render_instruction', 'reference_ids'])
        && id(idea.idea_id) && count(idea.version) && idea.version === (versions.get(idea.idea_id) ?? 0) + 1
        && Array.isArray(idea.sources) && idea.sources.length <= 4 && Array.isArray(idea.feedback)
        && idea.feedback.length <= 20 && idea.feedback.every(item => text(item, 2000)));
      assertContent(content(idea), set.context);
      if (index < 5) check(idea.idea_id === `${set.request_key}:idea:${index + 1}` && idea.version === 1 && !idea.sources.length && !idea.feedback.length
        && canonical(content(idea)) === canonical(attempt.result!.ideas[index]));
      else check(idea.sources.length > 0);
      for (const source of idea.sources) {
        check(keys(source, ['set_id', 'idea_id', 'version', 'aspects']) && Array.isArray(source.aspects) && source.aspects.length > 0
          && new Set(source.aspects).size === source.aspects.length && source.aspects.every(aspect => IDEA_ASPECTS.includes(aspect)));
        const { aspects: _, ...selection } = source; assertSelection(selection); check(seen.has(selectionKey(selection)));
      }
      versions.set(idea.idea_id, idea.version); seen.add(selectionKey({ set_id: set.set_id, idea_id: idea.idea_id, version: idea.version }));
    }
  }
  for (const attempt of attempts.values()) check(attempt.status !== 'completed' || attempt.request.kind !== 'directions' || sets.has(attempt.request.request_key));
  const messages = new Set<string>();
  for (const message of session.messages) {
    check(keys(message, ['role', 'text', 'request_key']) && ['user', 'assistant'].includes(message.role));
    const attempt = attempts.get(message.request_key), key = `${message.request_key}:${message.role}`;
    check(attempt && !messages.has(key) && message.text === (message.role === 'user' ? attempt.request.message : attempt.result?.message)); messages.add(key);
  }
  for (const attempt of attempts.values()) check(messages.has(`${attempt.request.request_key}:user`)
    && (attempt.status !== 'completed' || messages.has(`${attempt.request.request_key}:assistant`)));
  if (session.selected !== null) currentIdea(session, session.selected);
  const bound = new Set<string>(), operations = new Set<string>();
  for (const binding of session.render_bindings) {
    check(keys(binding, ['selection', 'operation_key', 'asset'], ['selection', 'operation_key']) && id(binding.operation_key));
    locate(session, binding.selection); const key = selectionKey(binding.selection);
    check(!bound.has(key) && !operations.has(binding.operation_key)); bound.add(key); operations.add(binding.operation_key);
    if (binding.asset) check(keys(binding.asset, ['business_id', 'asset_id', 'version_id']) && binding.asset.business_id === session.context.business_id
      && id(binding.asset.asset_id) && id(binding.asset.version_id));
  }
  check(new TextEncoder().encode(JSON.stringify(value)).length <= 2097152, 'exploration_session_too_large');
}
export function createExplorationSession(context: DesignContext, scope: ExplorationScope): ExplorationSession {
  return finish({ schema_version: 1, revision: 0, context: structuredClone(context), scope, messages: [], sets: [], attempts: [], selected: null, render_bindings: [] });
}
export function beginExploration(session: ExplorationSession, request: ExplorationRequest): ExplorationSession {
  assertExplorationSession(session); assertExplorationRequest(request);
  check(identity(session.context) === identity(request.context) && contextKey(session.context) === contextKey(request.context)
    && session.scope === request.scope, 'exploration_context_changed');
  const previous = session.attempts.find(attempt => attempt.request.request_key === request.request_key);
  if (previous) {
    check(canonical(previous.request) === canonical(request), 'exploration_request_key_conflict');
    check(previous.status !== 'uncertain', 'exploration_request_uncertain'); return structuredClone(session);
  }
  check(!session.attempts.some(attempt => attempt.status === 'running'), 'exploration_busy');
  const next = changed(session); next.attempts.push({ request: structuredClone(request), status: 'running' });
  next.messages.push({ role: 'user', text: request.message, request_key: request.request_key }); return finish(next);
}
export function finishExploration(session: ExplorationSession, result: ExplorationResult): ExplorationSession {
  assertExplorationSession(session); const attempt = session.attempts.find(item => item.request.request_key === result.request_key);
  check(attempt, 'exploration_request_not_found'); assertExplorationResult(result, attempt.request);
  if (attempt.status === 'completed') { check(canonical(attempt.result) === canonical(result), 'exploration_result_conflict'); return structuredClone(session); }
  const next = changed(session), saved = next.attempts.find(item => item.request.request_key === result.request_key)!;
  saved.status = 'completed'; saved.result = structuredClone(result);
  next.messages.push({ role: 'assistant', text: result.message, request_key: result.request_key });
  if (saved.request.kind === 'directions') {
    const context = expectedExplorationContext(saved.request, result);
    next.sets.push({ set_id: result.request_key, request_key: result.request_key, context,
      scope: saved.request.scope, ideas: result.ideas.map((idea, index) => ({ ...structuredClone(idea), idea_id: `${result.request_key}:idea:${index + 1}`, version: 1, sources: [], feedback: [] })),
      response_id: result.response_id, usage: structuredClone(result.usage) });
    if (contextKey(next.context) === contextKey(saved.request.context) && contextKey(context) !== contextKey(next.context)) {
      next.context = { ...structuredClone(context), interaction_mode: next.context.interaction_mode }; next.selected = null;
    }
  }
  return finish(next);
}
export function markExplorationUncertain(session: ExplorationSession, requestKey: string): ExplorationSession {
  assertExplorationSession(session); const attempt = session.attempts.find(item => item.request.request_key === requestKey);
  check(attempt, 'exploration_request_not_found'); if (attempt.status !== 'running') return structuredClone(session);
  const next = changed(session); next.attempts.find(item => item.request.request_key === requestKey)!.status = 'uncertain'; return finish(next);
}
/** Use only after an explicit server refusal that proves this request was not
 * admitted. An absent recovery result or a lost response is not such proof. */
export function discardUnsubmittedExploration(session: ExplorationSession, requestKey: string): ExplorationSession {
  assertExplorationSession(session);
  const attempt = session.attempts.find(item => item.request.request_key === requestKey);
  check(attempt && attempt.status !== 'completed' && attempt.result === undefined, 'exploration_request_not_discardable');
  const next = changed(session);
  next.attempts = next.attempts.filter(item => item.request.request_key !== requestKey);
  next.messages = next.messages.filter(item => item.request_key !== requestKey);
  return finish(next);
}
export function selectTextIdea(session: ExplorationSession, selection: IdeaSelection): ExplorationSession {
  assertExplorationSession(session); currentIdea(session, selection);
  if (canonical(session.selected) === canonical(selection)) return structuredClone(session);
  const next = changed(session); next.selected = structuredClone(selection); return finish(next);
}
export function latestTextIdeas(set: TextIdeaSet): TextIdea[] {
  const byId = new Map<string, TextIdea>(); for (const idea of set.ideas) if ((byId.get(idea.idea_id)?.version ?? 0) < idea.version) byId.set(idea.idea_id, idea);
  return structuredClone([...byId.values()]);
}
export function selectedTextIdea(session: ExplorationSession): TextIdea | null {
  assertExplorationSession(session); return session.selected ? structuredClone(locate(session, session.selected).idea) : null;
}
/** Supply semantic text-idea context, not just the planner's short conversational acknowledgement.
 * This derived history is never written back to messages and never claims to describe inspected pixels.
 * Whole identities survive budgeting; only descriptive prose is shortened. */
export function explorationDiscussionHistory(session: ExplorationSession): ExplorationRequest['history'] {
  assertExplorationSession(session);
  const encoder = new TextEncoder(), size = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
  // Reserve a maximal request key and worst-case JSON escaping for the next allowed 4000-character message.
  const baseline = { request_key: 'r'.repeat(200), kind: 'discussion', scope: session.scope, context: session.context,
    message: '\u0001'.repeat(4000), history: [] };
  const budget = Math.max(0, Math.min(24000, 65536 - size(baseline) - 1024));
  if (budget < 1000) return [];
  const relevant = session.sets.filter(set => contextKey(set.context) === contextKey(session.context) && set.scope === session.scope);
  const selectedSet = session.selected && relevant.find(set => set.set_id === session.selected!.set_id);
  const sets = [...new Set([...(selectedSet ? [selectedSet] : []), ...relevant.slice(-1)])];
  const candidates = sets.flatMap(set => latestTextIdeas(set).map(idea => ({ set, idea,
    selection: { set_id: set.set_id, idea_id: idea.idea_id, version: idea.version } })));
  const isSelected = (selection: IdeaSelection) => !!session.selected && selectionKey(selection) === selectionKey(session.selected);
  const ordered = [...candidates].sort((a, b) => Number(isSelected(b.selection)) - Number(isSelected(a.selection))
    || Number(b.idea.sources.length > 0) - Number(a.idea.sources.length > 0));
  const header = { kind: 'saved_text_ideas', note: 'Ideas textuales guardadas; no son imágenes ni observaciones de píxeles.',
    selected: session.selected, available_ideas: candidates.length, included_ideas: 0, omitted_ideas: candidates.length };
  const contextHistory: ExplorationRequest['history'] = [{ role: 'assistant', text: JSON.stringify(header) }];
  if (size(contextHistory) > budget) return [];
  const clip = (value: string, limit: number) => value.length <= limit ? value : `${value.slice(0, limit)}…`;
  for (const { idea, selection } of ordered) {
    if (contextHistory.length >= 25) break;
    const make = (limit: number) => ({ kind: 'saved_text_idea', selection, selected: isSelected(selection),
      title: clip(idea.title, Math.min(limit, 160)), rationale: clip(idea.rationale, limit),
      aspects: Object.fromEntries(IDEA_ASPECTS.map(aspect => [aspect, clip(idea.aspects[aspect], limit)])),
      render_instruction: clip(idea.render_instruction, limit * 2),
      feedback: idea.feedback.slice(-4).map(value => clip(value, Math.min(limit, 200))), feedback_count: idea.feedback.length,
      sources: idea.sources,
      source_notes: idea.sources.map(source => {
        const { aspects, ...parentSelection } = source, parent = locate(session, parentSelection).idea;
        return { selection: parentSelection, aspects, render_instruction: clip(parent.render_instruction, limit),
          feedback: parent.feedback.slice(-4).map(value => clip(value, Math.min(limit, 200))), feedback_count: parent.feedback.length };
      }), reference_ids: idea.reference_ids });
    let serialized = JSON.stringify(make(400));
    // A large source/reference identity list can exceed an entry. Keep all identity text intact;
    // describe any omitted references explicitly instead of cutting an identifier in half.
    if (serialized.length > 6000) serialized = JSON.stringify({ ...make(120), reference_ids: [], omitted_reference_count: idea.reference_ids.length });
    if (serialized.length > 6000) serialized = JSON.stringify({ kind: 'saved_text_idea', selection, selected: isSelected(selection),
      title: clip(idea.title, 80), sources: idea.sources, description_omitted: true });
    if (serialized.length > 6000) continue;
    const entry = { role: 'assistant' as const, text: serialized };
    if (size([...contextHistory, entry]) > budget - 256) continue;
    contextHistory.push(entry); header.included_ideas++;
  }
  header.omitted_ideas = candidates.length - header.included_ideas; contextHistory[0].text = JSON.stringify(header);
  const requestKeys = new Set(session.attempts.filter(attempt => contextKey(attempt.request.context) === contextKey(session.context))
    .map(attempt => attempt.request.request_key));
  const conversation: ExplorationRequest['history'] = [];
  for (const message of session.messages.filter(item => requestKeys.has(item.request_key)).slice(-8).reverse()) {
    const entry = { role: message.role, text: clip(message.text, 1800) };
    if (size([entry, ...conversation, ...contextHistory]) <= budget) conversation.unshift(entry);
  }
  return [...conversation, ...contextHistory];
}
export function refineTextIdea(session: ExplorationSession, selection: IdeaSelection, feedback: string): ExplorationSession {
  assertExplorationSession(session); const { idea } = currentIdea(session, selection); check(text(feedback, 2000), 'invalid_exploration_feedback');
  const next = changed(session), refined: TextIdea = { ...structuredClone(idea), version: idea.version + 1,
    render_instruction: `${idea.render_instruction}\nAjuste solicitado: ${feedback.trim()}`, feedback: [...idea.feedback, feedback.trim()], sources: [{ ...selection, aspects: [...IDEA_ASPECTS] }] };
  next.sets.find(set => set.set_id === selection.set_id)!.ideas.push(refined); next.selected = { ...selection, version: refined.version }; return finish(next);
}
export function combineTextIdeas(session: ExplorationSession, sources: IdeaSource[], newIdeaId: string): ExplorationSession {
  assertExplorationSession(session); check(id(newIdeaId) && Array.isArray(sources) && sources.length >= 2 && sources.length <= 4, 'invalid_exploration_combination');
  const setId = sources[0].set_id, assignments = sources.flatMap(source => source.aspects);
  check(sources.every(source => source.set_id === setId) && new Set(sources.map(source => source.idea_id)).size === sources.length
    && assignments.length === IDEA_ASPECTS.length && IDEA_ASPECTS.every(aspect => assignments.filter(item => item === aspect).length === 1), 'invalid_exploration_combination');
  const parts = sources.map(source => { const { aspects, ...selection } = source; check(aspects.length > 0, 'invalid_exploration_combination'); return { source, ...currentIdea(session, selection) }; });
  check(!session.sets.some(set => set.ideas.some(idea => idea.idea_id === newIdeaId)), 'exploration_idea_id_conflict');
  const aspects = Object.fromEntries(IDEA_ASPECTS.map(aspect => [aspect, parts.find(part => part.source.aspects.includes(aspect))!.idea.aspects[aspect]])) as TextIdea['aspects'];
  const notes = parts.map(part => `Fuente ${part.idea.idea_id}, versión ${part.idea.version}. Aplicar únicamente a los aspectos ${part.source.aspects.join(', ')}; no heredar otros aspectos:\n${part.idea.render_instruction}`);
  const idea: TextIdea = { idea_id: newIdeaId, version: 1, title: 'Combinación de ideas', rationale: 'Combinación explícita de los aspectos elegidos; conserva las ideas originales.', aspects,
    render_instruction: [...IDEA_ASPECTS.map(aspect => `${aspect}: ${aspects[aspect]}`), 'Notas textuales de las versiones de origen; no son ajustes reinterpretados:', ...notes].join('\n'),
    reference_ids: [...new Set(parts.flatMap(part => part.idea.reference_ids))],
    sources: structuredClone(sources), feedback: [] };
  const next = changed(session); next.sets.find(set => set.set_id === setId)!.ideas.push(idea); next.selected = { set_id: setId, idea_id: newIdeaId, version: 1 }; return finish(next);
}
export function updateExplorationContext(session: ExplorationSession, context: DesignContext): ExplorationSession {
  assertExplorationSession(session); assertContext(context); check(identity(session.context) === identity(context), 'exploration_scope_mismatch');
  if (canonical(session.context) === canonical(context)) return structuredClone(session);
  const next = changed(session); next.context = structuredClone(context); if (contextKey(session.context) !== contextKey(context)) next.selected = null; return finish(next);
}
export function ideaRenderInstruction(session: ExplorationSession, selection: IdeaSelection, currentContext: DesignContext): string {
  assertExplorationSession(session); assertContext(currentContext); const { set, idea } = currentIdea(session, selection);
  check(session.scope === 'asset_in_region' && set.scope === 'asset_in_region', 'exploration_full_design_requires_composition');
  check(contextKey(session.context) === contextKey(currentContext), 'exploration_context_changed');
  return [`Crear una única pieza visual independiente para la zona indicada. No producir una diapositiva completa ni incorporar sus textos.`,
    `Encargo: ${currentContext.instruction}`, `Idea elegida: ${idea.title}`, idea.render_instruction,
    ...IDEA_ASPECTS.map(aspect => `${aspect}: ${idea.aspects[aspect]}`),
    ...currentContext.immutable_elements.map(element => `Conservar: ${element}`)].join('\n');
}
/** Full composition is an explicit path; the original piece-only guard remains intact. */
export function fullDesignRenderInstruction(session: ExplorationSession, selection: IdeaSelection, currentContext: DesignContext): string {
  assertExplorationSession(session); assertContext(currentContext); const { set, idea } = currentIdea(session, selection);
  check(session.scope === 'full_design' && set.scope === 'full_design', 'exploration_scope_mismatch');
  check(contextKey(session.context) === contextKey(currentContext), 'exploration_context_changed');
  const full = readPresentationFullDesign(currentContext);
  check(full, 'exploration_full_design_requires_composition');
  return [full.copyMode === 'none'
    ? 'Diseñar el lienzo completo sin texto: no añadir titulares, etiquetas, letras, URLs ni marcas de agua.'
    : currentContext.workspace === 'production'
    ? 'Diseñar la imagen completa conservando su formato y el texto aprobado literal. Si el texto aprobado está vacío, no incluir texto. No inventar ni omitir texto.'
    : currentContext.workspace === 'onboarding'
    ? 'Diseñar un tablero completo de dirección de marca, con composición, paleta y jerarquía. Conservar literalmente el texto aprobado. No inventar textos ni presentar la propuesta como un perfil de marca publicado.'
    : currentContext.workspace === 'free_design'
    ? 'Diseñar un lienzo completo, con composición, jerarquía y todo el texto aprobado literal. No inventar ni omitir texto.'
    : 'Diseñar una diapositiva completa, con composición, jerarquía y todo el texto aprobado literal. No inventar ni omitir texto.',
    `Encargo: ${currentContext.instruction}`, `Idea elegida: ${idea.title}`, idea.render_instruction,
    ...IDEA_ASPECTS.map(aspect => `${aspect}: ${idea.aspects[aspect]}`),
    ...currentContext.immutable_elements.map(element => `Conservar: ${element}`)].join('\n');
}
export function bindIdeaRender(session: ExplorationSession, selection: IdeaSelection, operationKey: string): ExplorationSession {
  assertExplorationSession(session); currentIdea(session, selection); check(id(operationKey), 'invalid_exploration_render_key');
  const previous = session.render_bindings.find(binding => selectionKey(binding.selection) === selectionKey(selection));
  if (previous) { check(previous.operation_key === operationKey, 'exploration_render_already_bound'); return structuredClone(session); }
  check(!session.render_bindings.some(binding => binding.operation_key === operationKey), 'exploration_render_key_conflict');
  const next = changed(session); next.render_bindings.push({ selection: structuredClone(selection), operation_key: operationKey }); return finish(next);
}
