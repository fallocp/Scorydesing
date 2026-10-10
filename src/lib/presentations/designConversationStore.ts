import type { AssetVersion, DesignContext, DesignOperation } from '../../../supabase/functions/_shared/desaing/contracts';
import type { DesignCopy, DesignUnderstanding, ExplorationRequest, IdeaContent } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { assertConversationDesignSource, type ConversationDesignSource, type ConversationNextAction } from '../../../supabase/functions/_shared/desaing/conversationActions';
import { assertDesignElementEdits } from '../../../supabase/functions/_shared/desaing/designElementEdits';
import { COMPOSITION_LIMITS } from '../../../supabase/functions/_shared/desaing/composition';
import { assertDesignUnderstanding, assertExplorationRequest } from '../../../supabase/functions/_shared/desaing/exploration';
import { parseServerRequest } from '../../../supabase/functions/_shared/desaing/serverRequest';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import type { DesignBrandContext } from './designBrandContext';
import type { PreparedPresentationReference } from './presentationReferences';
import { isDesignConversationSessionId, type DesignConversationSessionId } from '../../../supabase/functions/_shared/desaing/conversationSessions';
import { assertHtmlDesignDraft, assertHtmlDesignReferenceBytes, emptyHtmlDesignDraft,
  type HtmlDesignScope, type HtmlDesignTarget, type HtmlDesignProposal } from './htmlDesignDraft';

export type DesignConversationScope = Omit<HtmlDesignScope, 'session'> & { session?: DesignConversationSessionId };
export interface DesignConversationMessage { id: string; turn_id: string; role: 'user' | 'assistant'; text: string }
type VersionBase = { id: string; turn_id: string; parent_id?: string; target: HtmlDesignTarget; design_source?: ConversationDesignSource };
export type DesignConversationVersion = VersionBase & (
  { kind: 'image'; asset: AssetVersion } | { kind: 'html'; proposal: HtmlDesignProposal;
    composition?: { request_key: string; source: AssetVersion; unresolved_slots: string[] } }
);
export interface DesignConversationPending {
  turn_id: string; action_id: string; kind: 'understand' | 'image' | 'html'; phase: 'prepared' | 'dispatched' | 'uncertain';
  target: HtmlDesignTarget; epoch: number;
  request?: { kind: 'understand'; request: ExplorationRequest } | { kind: 'image'; operation: DesignOperation };
}
export interface DesignConversationState {
  schema_version: 1; epoch: number; target: HtmlDesignTarget; mode: 'execute_change' | 'explore_design';
  /** A reset creates a new draft namespace without recycling old operation identities. */
  session_generation?: number;
  messages: DesignConversationMessage[]; references: PreparedPresentationReference[];
  brand: DesignBrandContext | null; brand_key: string | null;
  copy: DesignCopy; understanding: DesignUnderstanding | null; ideas: IdeaContent[]; next_action: ConversationNextAction | null;
  versions: DesignConversationVersion[]; selected_version_id: string | null;
  pending: DesignConversationPending | null; completed_action_ids: string[];
  /** Optional for backwards-compatible snapshots written before explicit plans. */
  confirmation?: { context_key: string } | null;
  inspected_slide_ids?: string[];
  design_source?: ConversationDesignSource | null;
  preferences?: { format: 'html' | 'image'; base: 'current' | 'version' | 'deck' | 'new' };
  /** Consecutive affirmatives answered without an executable action (0..2); the second one gets a local reply. */
  affirmation_misses?: number;
}
export interface DesignConversationRecord { revision: number; scope: DesignConversationScope; value: DesignConversationState }
/** update must execute atomically against the last committed value, including across tabs. */
export interface DesignConversationStorage {
  read(key: string): Promise<unknown | null>;
  update(key: string, change: (previous: unknown | null) => DesignConversationRecord): Promise<DesignConversationRecord>;
  close(): void;
}
const same = (left: unknown, right: unknown) => canonicalExploration(left) === canonicalExploration(right);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: unknown, allowed: string[], required = allowed) => record(value)
  && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => key in value);
const text = (value: unknown, max: number, empty = false): value is string => typeof value === 'string'
  && value.length <= max && (empty || !!value.trim()) && !value.includes('\0');
// Scope identifiers cannot contain any ASCII control byte.
// eslint-disable-next-line no-control-regex
const id = (value: unknown): value is string => text(value, 256) && !/[\x00-\x1f\x7f]/.test(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const check = (condition: unknown, code = 'invalid_design_conversation') => { if (!condition) throw Error(code); };
function assertScope(scope: DesignConversationScope) {
  check(keys(scope, ['actor', 'business', 'document', 'slide', 'session'], ['actor', 'business', 'document', 'slide'])
    && [scope.actor, scope.business, scope.document, scope.slide].every(id)
    && (scope.session === undefined || isDesignConversationSessionId(scope.session)), 'conversation_scope_mismatch');
}
/** Preserve the exact legacy scope/key for the first conversation. */
export function canonicalDesignConversationScope(input: DesignConversationScope): DesignConversationScope {
  assertScope(input);
  const scope = structuredClone(input);
  if (scope.session === 'main') delete scope.session;
  return scope;
}
function assertTarget(target: HtmlDesignTarget, scope: DesignConversationScope) {
  check(keys(target, ['document', 'slide', 'revision']) && target.document === scope.document && target.slide === scope.slide
    && positive(target.revision), 'conversation_target_changed');
}
function assertAsset(asset: AssetVersion, scope: DesignConversationScope) {
  check(keys(asset, ['business_id', 'asset_id', 'version_id']) && asset.business_id === scope.business && id(asset.asset_id) && id(asset.version_id), 'conversation_scope_mismatch');
}
function assertBrand(brand: DesignBrandContext, scope: DesignConversationScope) {
  check(keys(brand, ['schema_version', 'business_id', 'name', 'industry', 'logo_url', 'colors', 'fonts', 'tone', 'audience', 'positioning', 'style',
    'restrictions', 'preferences', 'profile_id', 'profile_version', 'fingerprint']) && brand.schema_version === 1 && brand.business_id === scope.business
    && text(brand.name, 160, true) && text(brand.industry, 160, true)
    && [brand.tone, brand.audience, brand.positioning, brand.style].every(value => text(value, 600, true))
    && typeof brand.fingerprint === 'string' && /^[a-f0-9]{64}$/.test(brand.fingerprint)
    && Number.isSafeInteger(brand.profile_version) && brand.profile_version >= 0 && (brand.profile_id === null || id(brand.profile_id)));
  check(keys(brand.colors, ['primary', 'secondary', 'accent']) && Object.values(brand.colors).every(value => value === '' || /^#[a-f0-9]{6}$/i.test(value)));
  check(keys(brand.fonts, ['display', 'body', 'mono']) && Object.values(brand.fonts).every(value => text(value, 120, true)));
  check(keys(brand.preferences, ['increase', 'decrease']));
  for (const list of [brand.restrictions, brand.preferences.increase, brand.preferences.decrease]) check(Array.isArray(list) && list.length <= 8 && list.every(value => text(value, 160)));
  if (brand.logo_url !== null) {
    check(text(brand.logo_url, 2048)); const url = new URL(brand.logo_url);
    check(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash);
  }
}
function contextFor(value: DesignConversationState, scope: DesignConversationScope): DesignContext {
  return { actor_id: scope.actor, business_id: scope.business, brand_id: scope.business, project_id: scope.document, session_id: 'conversation-validation',
    workspace: 'free_design', interaction_mode: 'explore_design', target: { document_type: 'page', document_id: scope.document, page_id: scope.slide, revision: String(value.target.revision) },
    instruction: '', immutable_elements: [], references: [
      ...value.references.map(reference => ({ reference_id: reference.id, business_id: scope.business,
        asset_id: reference.id, version_id: reference.sha256, mime_type: 'image/png', roles: [reference.role] })),
      ...value.versions.filter(version => version.kind === 'image').map(version => ({ ...version.asset,
        reference_id: `image:${version.asset.asset_id}:${version.asset.version_id}`, mime_type: 'image/png', roles: ['object_reference' as const] })),
    ] };
}
function assertNextAction(action: ConversationNextAction, refs: string[]) {
  check(keys(action, ['kind', 'intent', 'instruction', 'reference_ids', 'reason', ...['from_slide', 'slide_ids', 'design_source', 'element_edits', 'element_html_hash', 'rewrite'].filter(key => key in action)])
    && (action.from_slide === undefined || action.from_slide === true && action.kind === 'refine_html')
    && (action.rewrite === undefined || action.rewrite === true && action.kind === 'refine_html' && action.design_source === undefined)
    && ['discuss', 'generate_image', 'edit_image', 'create_html', 'refine_html', 'convert_image_to_html', 'explore_ideas', 'inspect_slides', 'edit_elements'].includes(action.kind)
    && ['requested', 'suggested', 'clarify'].includes(action.intent) && text(action.instruction, 6000, action.kind === 'discuss') && text(action.reason, 1200)
    && (action.intent !== 'clarify' || action.kind === 'discuss') && (action.kind !== 'discuss' || action.intent !== 'requested')
    && Array.isArray(action.reference_ids) && action.reference_ids.length <= 4 && new Set(action.reference_ids).size === action.reference_ids.length
    && action.reference_ids.every(value => refs.includes(value)));
  if (action.kind === 'inspect_slides') check(Array.isArray(action.slide_ids) && action.slide_ids.length > 0 && action.slide_ids.length <= 12
    && action.slide_ids.every(id) && new Set(action.slide_ids).size === action.slide_ids.length);
  else check(action.slide_ids === undefined);
  if (action.design_source !== undefined) {
    assertConversationDesignSource(action.design_source);
    check(['generate_image', 'edit_image', 'create_html', 'refine_html', 'convert_image_to_html'].includes(action.kind) && !action.from_slide);
    if (action.kind === 'convert_image_to_html') check(action.design_source.mode === 'replicate' && action.design_source.source.kind === 'asset');
  }
  if (action.kind === 'edit_elements') {
    assertDesignElementEdits(action.element_edits);
    check(typeof action.element_html_hash === 'string' && /^[a-f0-9]{64}$/.test(action.element_html_hash));
  } else check(action.element_edits === undefined && action.element_html_hash === undefined);
}
export function emptyDesignConversation(target: HtmlDesignTarget): DesignConversationState {
  return { schema_version: 1, epoch: 1, target: structuredClone(target), mode: 'execute_change', messages: [], references: [], brand: null, brand_key: null,
    copy: { status: 'pending', text: '', source_reference_ids: [] }, understanding: null, ideas: [], next_action: null,
    versions: [], selected_version_id: null, pending: null, completed_action_ids: [] };
}

/** Only typed data enters persistence: no auth sessions, arbitrary request headers or credentials. */
export function assertDesignConversation(value: DesignConversationState, scope: DesignConversationScope) {
  assertScope(scope);
  const draftScope = { actor: scope.actor, business: scope.business, document: scope.document, slide: scope.slide };
  const required = ['schema_version', 'epoch', 'target', 'mode', 'messages', 'references', 'brand', 'brand_key', 'copy', 'understanding', 'ideas', 'next_action',
    'versions', 'selected_version_id', 'pending', 'completed_action_ids'];
  check(keys(value, [...required, 'confirmation', 'inspected_slide_ids', 'preferences', 'design_source', 'session_generation', 'affirmation_misses'], required) && value.schema_version === 1 && positive(value.epoch)
    && (value.session_generation === undefined || positive(value.session_generation) && value.session_generation <= 1000000000)
    && (value.affirmation_misses === undefined || Number.isInteger(value.affirmation_misses) && value.affirmation_misses >= 0 && value.affirmation_misses <= 2)
    && ['execute_change', 'explore_design'].includes(value.mode));
  assertTarget(value.target, scope);
  const assertSource = (source: ConversationDesignSource) => {
    assertConversationDesignSource(source);
    if (source.source.kind === 'asset') assertAsset(source.source.asset, scope);
  };
  if (value.design_source !== undefined && value.design_source !== null) assertSource(value.design_source);
  if (value.confirmation != null) check(keys(value.confirmation, ['context_key']) && text(value.confirmation.context_key, 262144)
    && value.next_action && !['discuss', 'explore_ideas', 'inspect_slides'].includes(value.next_action.kind));
  if (value.inspected_slide_ids !== undefined) check(Array.isArray(value.inspected_slide_ids) && value.inspected_slide_ids.length <= 12
    && value.inspected_slide_ids.every(id) && new Set(value.inspected_slide_ids).size === value.inspected_slide_ids.length);
  if (value.preferences !== undefined) check(keys(value.preferences, ['format', 'base']) && ['html', 'image'].includes(value.preferences.format)
    && ['current', 'version', 'deck', 'new'].includes(value.preferences.base));
  assertHtmlDesignDraft({ ...emptyHtmlDesignDraft(), references: value.references }, draftScope);
  check(Array.isArray(value.messages) && value.messages.length <= 200, 'conversation_message_limit');
  const messageIds = new Set<string>();
  for (const message of value.messages) {
    check(keys(message, ['id', 'turn_id', 'role', 'text']) && id(message.id) && id(message.turn_id) && ['user', 'assistant'].includes(message.role)
      && text(message.text, 16000) && !messageIds.has(message.id)); messageIds.add(message.id);
  }
  if (value.brand !== null) { assertBrand(value.brand, scope); check(value.brand_key === value.brand.fingerprint); }
  else check(value.brand_key === null);
  const context = contextFor(value, scope), refs = context.references.map(reference => reference.reference_id);
  assertDesignUnderstanding({ intent: 'explore', resolved_instruction: 'Validación del texto resuelto', copy: value.copy,
    references: [], preserve: [], pending_questions: [] }, context);
  if (value.understanding !== null) assertDesignUnderstanding(value.understanding, context);
  check(Array.isArray(value.ideas) && value.ideas.length <= 5, 'conversation_idea_limit');
  for (const idea of value.ideas) {
    check(keys(idea, ['title', 'rationale', 'aspects', 'render_instruction', 'reference_ids']) && text(idea.title, 300) && text(idea.rationale, 2400)
      && text(idea.render_instruction, 6000) && keys(idea.aspects, ['subject', 'composition', 'style', 'palette'])
      && Object.values(idea.aspects).every(value => text(value, 2400)) && Array.isArray(idea.reference_ids) && idea.reference_ids.length <= 4
      && new Set(idea.reference_ids).size === idea.reference_ids.length && idea.reference_ids.every(ref => refs.includes(ref)));
  }
  if (value.next_action !== null) assertNextAction(value.next_action, refs);
  if (value.next_action?.design_source) assertSource(value.next_action.design_source);
  check(Array.isArray(value.versions) && value.versions.length <= 20, 'conversation_version_limit');
  const versionIds = new Set<string>();
  for (const version of value.versions) {
    check(keys(version, ['id', 'turn_id', 'parent_id', 'target', 'kind', 'design_source', ...(version.kind === 'image' ? ['asset'] : ['proposal', 'composition'])],
      ['id', 'turn_id', 'target', 'kind', ...(version.kind === 'image' ? ['asset'] : ['proposal'])])
      && id(version.id) && id(version.turn_id) && ['image', 'html'].includes(version.kind) && !versionIds.has(version.id)
      && (version.parent_id === undefined || versionIds.has(version.parent_id)));
    assertTarget(version.target, scope);
    if (version.design_source !== undefined) assertSource(version.design_source);
    if (version.kind === 'image') assertAsset(version.asset, scope);
    else {
      check(same(version.target, version.proposal.target)); assertHtmlDesignDraft({ ...emptyHtmlDesignDraft(), proposal: version.proposal }, draftScope);
      if (version.composition) {
        const composition = version.composition;
        check(keys(composition, ['request_key', 'source', 'unresolved_slots']) && id(composition.request_key)
          && Array.isArray(composition.unresolved_slots) && composition.unresolved_slots.length <= COMPOSITION_LIMITS.slots
          && composition.unresolved_slots.every(id) && new Set(composition.unresolved_slots).size === composition.unresolved_slots.length);
        assertAsset(composition.source, scope);
      }
    }
    versionIds.add(version.id);
  }
  check(value.selected_version_id === null || versionIds.has(value.selected_version_id));
  check(Array.isArray(value.completed_action_ids) && value.completed_action_ids.length <= 200
    && value.completed_action_ids.every(id) && new Set(value.completed_action_ids).size === value.completed_action_ids.length, 'conversation_action_limit');
  if (value.pending !== null) {
    const pending = value.pending;
    check(keys(pending, ['turn_id', 'action_id', 'kind', 'phase', 'target', 'epoch', 'request'], ['turn_id', 'action_id', 'kind', 'phase', 'target', 'epoch'])
      && id(pending.turn_id) && id(pending.action_id) && ['understand', 'image', 'html'].includes(pending.kind)
      && ['prepared', 'dispatched', 'uncertain'].includes(pending.phase) && pending.epoch === value.epoch && same(pending.target, value.target)
      && !value.completed_action_ids.includes(pending.action_id), 'conversation_pending_mismatch');
    if (pending.request) {
      check(pending.request.kind === pending.kind, 'conversation_pending_mismatch');
      let requestContext: DesignContext;
      if (pending.request.kind === 'understand') {
        check(keys(pending.request, ['kind', 'request'])); assertExplorationRequest(pending.request.request);
        check(pending.request.request.request_key === pending.action_id); requestContext = pending.request.request.context;
      } else {
        check(keys(pending.request, ['kind', 'operation']));
        parseServerRequest({ business_id: scope.business, command: { kind: 'enqueue', operation: pending.request.operation } });
        check(pending.request.operation.operation_key === pending.action_id); requestContext = pending.request.operation.context;
      }
      check(requestContext.actor_id === scope.actor && requestContext.business_id === scope.business && requestContext.project_id === scope.document
        && requestContext.target.document_id === scope.document && String(requestContext.target.revision) === String(pending.target.revision)
        && (requestContext.target.slide_id ?? requestContext.target.page_id) === scope.slide, 'conversation_scope_mismatch');
    }
  }
}

function frozenContext(value: DesignConversationState) {
  return { target: value.target, epoch: value.epoch, mode: value.mode, references: value.references.map(({ blob: _blob, ...item }) => item), brand: value.brand,
    copy: value.copy, selected_version_id: value.selected_version_id, understanding: value.understanding, ideas: value.ideas, next_action: value.next_action,
    confirmation: value.confirmation, inspected_slide_ids: value.inspected_slide_ids, preferences: value.preferences, design_source: value.design_source,
    affirmation_misses: value.affirmation_misses };
}
export function assertConversationTransition(previous: DesignConversationState, next: DesignConversationState) {
  check((next.session_generation ?? 1) === (previous.session_generation ?? 1), 'conversation_session_changed');
  check(next.epoch >= previous.epoch, 'conversation_epoch_changed');
  check(next.target.revision >= previous.target.revision, 'conversation_target_changed');
  if (!same(previous.target, next.target)) check(next.epoch > previous.epoch, 'conversation_epoch_changed');
  for (const action of previous.completed_action_ids) check(next.completed_action_ids.includes(action), 'conversation_action_history_changed');
  for (const version of previous.versions) check(next.versions.some(item => same(item, version)), 'conversation_version_history_changed');
  for (const message of previous.messages) check(next.messages.some(item => same(item, message)), 'conversation_message_history_changed');
  if (previous.pending) {
    if (next.pending) {
      check(same({ ...previous.pending, phase: undefined }, { ...next.pending, phase: undefined }) && same(frozenContext(previous), frozenContext(next)), 'conversation_pending_changed');
      const phases = ['prepared', 'dispatched', 'uncertain']; check(phases.indexOf(next.pending.phase) >= phases.indexOf(previous.pending.phase), 'conversation_dispatch_replay');
    } else check(next.completed_action_ids.includes(previous.pending.action_id), 'conversation_pending_unresolved');
  }
}
export function beginConversationAction(value: DesignConversationState, pending: DesignConversationPending, message?: DesignConversationMessage): DesignConversationState {
  const next = structuredClone(value);
  if (next.completed_action_ids.includes(pending.action_id)) throw Error('conversation_action_completed');
  if (next.pending) {
    check(same({ ...next.pending, phase: undefined }, { ...pending, phase: undefined }), 'conversation_pending_unresolved'); return next;
  }
  check(pending.phase === 'prepared' && pending.epoch === value.epoch && same(pending.target, value.target), 'conversation_epoch_changed');
  if (message) { check(message.role === 'user' && message.turn_id === pending.turn_id && !next.messages.some(item => item.id === message.id)); next.messages.push(structuredClone(message)); }
  next.pending = structuredClone(pending); return next;
}
export function markConversationAction(value: DesignConversationState, actionId: string, phase: 'dispatched' | 'uncertain'): DesignConversationState {
  const next = structuredClone(value); check(next.pending?.action_id === actionId && next.pending.epoch === next.epoch, 'conversation_pending_mismatch');
  check(!(next.pending!.phase === 'uncertain' && phase === 'dispatched'), 'conversation_dispatch_replay'); next.pending!.phase = phase; return next;
}
export interface ConversationCompletion {
  message?: DesignConversationMessage; version?: DesignConversationVersion; copy?: DesignCopy;
  understanding?: DesignUnderstanding | null; ideas?: IdeaContent[]; next_action?: ConversationNextAction | null;
}
export function completeConversationAction(value: DesignConversationState, actionId: string, completion: ConversationCompletion): DesignConversationState {
  const next = structuredClone(value);
  if (next.completed_action_ids.includes(actionId)) return next;
  const pending = next.pending; check(pending?.action_id === actionId && pending.epoch === next.epoch && same(pending.target, next.target), 'conversation_pending_mismatch');
  if (completion.message) { check(completion.message.role === 'assistant' && completion.message.turn_id === pending!.turn_id
    && !next.messages.some(item => item.id === completion.message!.id)); next.messages.push(structuredClone(completion.message)); }
  if (completion.version) { check(completion.version.turn_id === pending!.turn_id && same(completion.version.target, pending!.target)
    && !next.versions.some(item => item.id === completion.version!.id)); next.versions.push(structuredClone(completion.version)); next.selected_version_id = completion.version.id; }
  for (const key of ['copy', 'understanding', 'ideas', 'next_action'] as const) if (key in completion) Object.assign(next, { [key]: structuredClone(completion[key]) });
  if ('next_action' in completion) next.confirmation = null;
  next.pending = null; next.completed_action_ids.push(actionId); return next;
}
export function advanceConversationEpoch(value: DesignConversationState, target: HtmlDesignTarget): DesignConversationState {
  check(!value.pending, 'conversation_pending_unresolved'); check(value.epoch < Number.MAX_SAFE_INTEGER, 'conversation_epoch_overflow');
  return { ...structuredClone(value), epoch: value.epoch + 1, target: structuredClone(target) };
}

/** Explicit user reset only. The CAS revision survives so stale tabs cannot resurrect deleted chat. */
export function resetDesignConversation(previous: DesignConversationState, target: HtmlDesignTarget): DesignConversationState {
  check(!previous.pending, 'conversation_pending_unresolved');
  check(target.document === previous.target.document && target.slide === previous.target.slide
    && target.revision >= previous.target.revision, 'conversation_target_changed');
  check(previous.epoch < Number.MAX_SAFE_INTEGER && (previous.session_generation ?? 1) < 1000000000, 'conversation_epoch_overflow');
  return { ...emptyDesignConversation(target), epoch: previous.epoch + 1, session_generation: (previous.session_generation ?? 1) + 1 };
}
export function assertConversationReset(previous: DesignConversationState, next: DesignConversationState) {
  check(same(next, resetDesignConversation(previous, next.target)), 'invalid_conversation_reset');
}

export function createDesignConversationStore(inputScope: DesignConversationScope, storage: DesignConversationStorage) {
  const scope = canonicalDesignConversationScope(inputScope);
  const key = JSON.stringify([scope.actor, scope.business, scope.document, scope.slide, ...(scope.session ? [scope.session] : [])]);
  let closed = false;
  function validateRecord(value: unknown): asserts value is DesignConversationRecord {
    const saved = value as DesignConversationRecord;
    check(keys(saved, ['revision', 'scope', 'value']) && positive(saved.revision)
      && same(canonicalDesignConversationScope(saved.scope), scope), 'conversation_scope_mismatch'); assertDesignConversation(saved.value, scope);
  }
  const assertOpen = () => check(!closed, 'conversation_store_closed');
  return {
    async read(): Promise<DesignConversationRecord | null> {
      assertOpen(); const saved = await storage.read(key); assertOpen(); if (saved === null) return null;
      validateRecord(saved); await assertHtmlDesignReferenceBytes(saved.value.references); assertOpen(); return structuredClone(saved);
    },
    async write(revision: number, value: DesignConversationState): Promise<DesignConversationRecord> {
      assertOpen(); check(Number.isSafeInteger(revision) && revision >= 0 && revision < Number.MAX_SAFE_INTEGER, 'invalid_conversation_revision');
      const frozen = structuredClone(value); assertDesignConversation(frozen, scope); await assertHtmlDesignReferenceBytes(frozen.references); assertOpen();
      const saved = await storage.update(key, previous => {
        assertOpen(); if (previous !== null) validateRecord(previous);
        const prior = previous as DesignConversationRecord | null;
        check((prior?.revision ?? 0) === revision, 'conversation_revision_conflict');
        if (prior) assertConversationTransition(prior.value, frozen);
        return { revision: revision + 1, scope: structuredClone(scope), value: frozen };
      });
      assertOpen(); validateRecord(saved); return structuredClone(saved);
    },
    async reset(revision: number, target: HtmlDesignTarget): Promise<DesignConversationRecord> {
      assertOpen(); check(positive(revision) && revision < Number.MAX_SAFE_INTEGER, 'invalid_conversation_revision');
      const frozenTarget = structuredClone(target); assertTarget(frozenTarget, scope);
      const saved = await storage.update(key, previous => {
        assertOpen(); validateRecord(previous);
        check(previous.revision === revision, 'conversation_revision_conflict');
        const value = resetDesignConversation(previous.value, frozenTarget); assertDesignConversation(value, scope);
        return { revision: revision + 1, scope: structuredClone(scope), value };
      });
      assertOpen(); validateRecord(saved); return structuredClone(saved);
    },
    close() { closed = true; storage.close(); },
  };
}

export async function openDesignConversationStore(scope: DesignConversationScope) {
  const frozenScope = canonicalDesignConversationScope(scope);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false; const request = indexedDB.open('scory-design-conversation-v1', 1);
    request.onupgradeneeded = () => { if (failed) request.transaction?.abort(); else request.result.createObjectStore('conversations'); };
    request.onerror = request.onblocked = () => { failed = true; reject(Error('conversation_store_unavailable')); };
    request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
  });
  let closed = false; db.onversionchange = () => { closed = true; db.close(); };
  const transact = (key: string, change?: (previous: unknown | null) => DesignConversationRecord) => new Promise<unknown | null>((resolve, reject) => {
    if (closed) { reject(Error('conversation_store_closed')); return; }
    const tx = db.transaction('conversations', change ? 'readwrite' : 'readonly'), bucket = tx.objectStore('conversations');
    let result: unknown | null = null, failure: unknown;
    tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(failure ?? tx.error ?? Error('conversation_store_unavailable'));
    const read = bucket.get(key); read.onsuccess = () => { try {
      result = read.result ?? null;
      if (change) { result = change(result); bucket.put(result, key); }
    } catch (problem) { failure = problem; tx.abort(); } };
  });
  return createDesignConversationStore(frozenScope, { read: key => transact(key), update: (key, change) => transact(key, change) as Promise<DesignConversationRecord>,
    close() { closed = true; db.close(); } });
}
