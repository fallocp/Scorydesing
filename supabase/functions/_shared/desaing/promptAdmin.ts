import type { AssetVersion, DesignOperation, DesignReference } from './contracts.ts';
import { canonicalExploration } from './explorationRepository.ts';
import { materialHash } from './materials.ts';

export interface PromptAdminCapabilities { governed: boolean; can_manage: boolean }
export interface PromptAdminBase { id: string; version: number; text: string; hash: string }
export interface PromptAdminVersion extends PromptAdminBase { created_at: string | null }
export interface PromptAdminDraft { schema_version: 1; id: string; business_id: string; actor_id: string; prompt_type: string;
  revision: number; base: PromptAdminBase; new_text: string; diagnosis: 'copy' | 'reference' | 'prompt' | 'render' | 'composition' | 'export';
  repeat: string; avoid: string; hypothesis: string; benefit: string; risks: string; evidence_asset: AssetVersion;
  status: 'draft' | 'published' | 'discarded' }
export interface PromptAdminEvidence { asset: AssetVersion; operation_key: string; effective_prompt: string; revised_prompt: string | null; master_origin: 'unknown' }
export interface PromptAdminVisualCase { instruction: string; approved_copy: string; references: DesignReference[] }
export interface PromptAdminCorpus { version: 'prompt-admin-v1'; checks: { id: string; passed: boolean; message: string }[] }
export interface PromptAdminTest { id: string; business_id: string; actor_id: string; draft_id: string; draft_revision: number;
  base_hash: string; candidate_hash: string; corpus: PromptAdminCorpus; corpus_hash: string; visual_case: PromptAdminVisualCase;
  executor: 'image_api' | 'responses_image'; operations: { before: DesignOperation; after: DesignOperation }; test_hash: string; created_at: string }
export interface PromptAdminReview { id: string; business_id: string; actor_id: string; test_id: string; test_hash: string;
  before: AssetVersion; after: AssetVersion; decision: 'approved' | 'rejected'; criteria: { copy: boolean; visual: boolean; regression: boolean }; notes: string; created_at: string }
export interface PromptAdminReceipt { request_id: string; kind: 'publish' | 'revert'; business_id: string; actor_id: string; prompt_type: string;
  previous: PromptAdminBase; published: PromptAdminVersion; draft_id: string | null; draft_revision: number | null;
  test_id: string | null; review_id: string | null; reason: string; published_at: string }
export interface PromptAdminRead { business_id: string; actor_id: string; prompt_type: string; prompt_types: string[];
  base: PromptAdminBase; versions: PromptAdminVersion[]; draft: PromptAdminDraft | null; tests: PromptAdminTest[];
  reviews: PromptAdminReview[]; receipts: PromptAdminReceipt[]; evidence: PromptAdminEvidence[] }
export interface PromptAdminSaveInput { business_id: string; request_id: string; expected_revision: number; draft: PromptAdminDraft }
export interface PromptAdminTestInput { business_id: string; request_id: string; draft_id: string; expected_revision: number;
  visual_case: PromptAdminVisualCase; executor: 'image_api' | 'responses_image' }
export interface PromptAdminReviewInput { business_id: string; request_id: string; test_id: string; test_hash: string; before: AssetVersion; after: AssetVersion;
  decision: 'approved' | 'rejected'; criteria: { copy: boolean; visual: boolean; regression: boolean }; notes: string }
export interface PromptAdminPublishInput { business_id: string; request_id: string; draft_id: string; expected_revision: number; test_id: string; test_hash: string; review_id: string }
export interface PromptAdminRevertInput { business_id: string; request_id: string; prompt_type: string; expected_base_id: string; expected_base_version: number; expected_base_hash: string; version_id: string; reason: string }
export interface PromptAdminDiscardInput { business_id: string; request_id: string; draft_id: string; expected_revision: number; reason: string }
export type PromptAdminMutation = { request_id: string; kind: 'save'; result: PromptAdminDraft } | { request_id: string; kind: 'discard'; result: PromptAdminDraft }
  | { request_id: string; kind: 'test'; result: PromptAdminTest } | { request_id: string; kind: 'review'; result: PromptAdminReview }
  | { request_id: string; kind: 'publish'; result: PromptAdminReceipt } | { request_id: string; kind: 'revert'; result: PromptAdminReceipt };
export const PROMPT_ADMIN_ERRORS = ['invalid_prompt_admin_request', 'prompt_admin_forbidden', 'prompt_admin_disabled', 'prompt_admin_not_found',
  'prompt_admin_revision_conflict', 'prompt_admin_request_conflict', 'prompt_admin_base_changed', 'prompt_admin_evidence_invalid', 'prompt_admin_test_invalid',
  'prompt_admin_comparison_required', 'prompt_admin_review_invalid', 'prompt_admin_context_too_large', 'prompt_admin_unchanged',
  'server_prompt_admin_invalid_response', 'server_prompt_admin_unavailable', 'server_prompt_admin_outcome_unknown', 'server_prompt_admin_configuration_invalid'] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, sha = /^[a-f0-9]{64}$/;
const typePattern = /^[a-z][a-z0-9_]*(?::[a-z0-9_]+)?$/;
function fail(): never { throw new Error('invalid_prompt_admin_request'); }
function obj(v: unknown, keys: string[]): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(); const r = v as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(k => !(k in r))) fail(); return r; }
function id(v: unknown): asserts v is string { if (typeof v !== 'string' || !uuid.test(v)) fail(); }
function hash(v: unknown): asserts v is string { if (typeof v !== 'string' || !sha.test(v)) fail(); }
function integer(v: unknown, min = 0): asserts v is number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min) fail(); }
function text(v: unknown, max: number, empty = true): asserts v is string { if (typeof v !== 'string' || v.length > max || v.includes('\0') || !empty && !v.trim()) fail(); }
function date(v: unknown): asserts v is string { text(v, 40, false); if (!Number.isFinite(Date.parse(v))) fail(); }
export function assertPromptAdminType(v: unknown): asserts v is string { text(v, 100, false); if (!typePattern.test(v)) fail(); }
function asset(v: unknown): asserts v is AssetVersion { const r = obj(v, ['business_id', 'asset_id', 'version_id']); id(r.business_id); text(r.asset_id, 256, false); hash(r.version_id); }
function criteria(v: unknown): void { const r = obj(v, ['copy', 'visual', 'regression']); if (Object.values(r).some(x => typeof x !== 'boolean')) fail(); }
export function assertPromptAdminCapabilities(v: unknown): asserts v is PromptAdminCapabilities { const r = obj(v, ['governed', 'can_manage']);
  if (typeof r.governed !== 'boolean' || typeof r.can_manage !== 'boolean' || r.can_manage && !r.governed) fail(); }
export function assertPromptAdminBase(v: unknown): asserts v is PromptAdminBase { const r = obj(v, ['id', 'version', 'text', 'hash']); id(r.id); integer(r.version, 1); text(r.text, 64000, false); hash(r.hash); }
export function assertPromptAdminVersion(v: unknown): asserts v is PromptAdminVersion { const r = obj(v, ['id', 'version', 'text', 'hash', 'created_at']);
  assertPromptAdminBase({ id: r.id, version: r.version, text: r.text, hash: r.hash }); if (r.created_at !== null) date(r.created_at); }
export function assertPromptAdminDraft(v: unknown): asserts v is PromptAdminDraft { const r = obj(v, ['schema_version', 'id', 'business_id', 'actor_id', 'prompt_type', 'revision', 'base',
  'new_text', 'diagnosis', 'repeat', 'avoid', 'hypothesis', 'benefit', 'risks', 'evidence_asset', 'status']);
  if (r.schema_version !== 1 || !['copy', 'reference', 'prompt', 'render', 'composition', 'export'].includes(String(r.diagnosis)) || !['draft', 'published', 'discarded'].includes(String(r.status))) fail();
  [r.id, r.business_id, r.actor_id].forEach(id); assertPromptAdminType(r.prompt_type); integer(r.revision); assertPromptAdminBase(r.base); text(r.new_text, 64000, false);
  for (const key of ['repeat', 'avoid', 'hypothesis', 'benefit', 'risks']) text(r[key], 4000); asset(r.evidence_asset); if (r.evidence_asset.business_id !== r.business_id) fail(); }
export function assertPromptAdminVisualCase(v: unknown): asserts v is PromptAdminVisualCase { const r = obj(v, ['instruction', 'approved_copy', 'references']);
  text(r.instruction, 2000, false); text(r.approved_copy, 2000); if (!Array.isArray(r.references) || r.references.length > 4) fail();
  const ids = new Set(); for (const v of r.references) { const ref = obj(v, ['business_id', 'asset_id', 'version_id', 'reference_id', 'mime_type', 'roles']);
    asset({ business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id }); text(ref.reference_id, 200, false);
    if (ids.has(ref.reference_id) || ref.mime_type !== 'image/png' || !Array.isArray(ref.roles) || !ref.roles.length || ref.roles.length > 4
      || new Set(ref.roles).size !== ref.roles.length || ref.roles.some(role => !['layout_reference', 'image_style_reference', 'object_reference', 'brand_reference'].includes(String(role)))) fail(); ids.add(ref.reference_id); } }
export function assertPromptAdminCorpus(v: unknown): asserts v is PromptAdminCorpus { const r = obj(v, ['version', 'checks']);
  if (r.version !== 'prompt-admin-v1' || !Array.isArray(r.checks) || r.checks.length !== 8) fail(); const ids = new Set();
  for (const v of r.checks) { const c = obj(v, ['id', 'passed', 'message']); text(c.id, 100, false); text(c.message, 1000, false);
    if (ids.has(c.id) || typeof c.passed !== 'boolean') fail(); ids.add(c.id); } }
export function assertPromptAdminTest(v: unknown): asserts v is PromptAdminTest { const r = obj(v, ['id', 'business_id', 'actor_id', 'draft_id', 'draft_revision', 'base_hash', 'candidate_hash',
  'corpus', 'corpus_hash', 'visual_case', 'executor', 'operations', 'test_hash', 'created_at']);
  [r.id, r.business_id, r.actor_id, r.draft_id].forEach(id); integer(r.draft_revision, 1); [r.base_hash, r.candidate_hash, r.corpus_hash, r.test_hash].forEach(hash);
  assertPromptAdminCorpus(r.corpus); assertPromptAdminVisualCase(r.visual_case); if (!['image_api', 'responses_image'].includes(String(r.executor))) fail();
  const ops = obj(r.operations, ['before', 'after']); for (const v of Object.values(ops)) { if (!v || typeof v !== 'object') fail(); const op = v as DesignOperation;
    if (op.context?.business_id !== r.business_id || op.context?.actor_id !== r.actor_id || op.context?.project_id !== r.id || op.action !== 'generate_image') fail(); }
  if (r.visual_case.references.some(ref => ref.business_id !== r.business_id)) fail(); date(r.created_at); }
export function assertPromptAdminReview(v: unknown): asserts v is PromptAdminReview { const r = obj(v, ['id', 'business_id', 'actor_id', 'test_id', 'test_hash', 'before', 'after', 'decision', 'criteria', 'notes', 'created_at']);
  [r.id, r.business_id, r.actor_id, r.test_id].forEach(id); hash(r.test_hash); asset(r.before); asset(r.after); criteria(r.criteria); text(r.notes, 4000, false); date(r.created_at);
  if (!['approved', 'rejected'].includes(String(r.decision)) || r.before.business_id !== r.business_id || r.after.business_id !== r.business_id
    || canonicalExploration(r.before) === canonicalExploration(r.after) || r.decision === 'approved' && Object.values(r.criteria as object).some(x => x !== true)) fail(); }
export function assertPromptAdminReceipt(v: unknown): asserts v is PromptAdminReceipt { const r = obj(v, ['request_id', 'kind', 'business_id', 'actor_id', 'prompt_type', 'previous', 'published',
  'draft_id', 'draft_revision', 'test_id', 'review_id', 'reason', 'published_at']); [r.request_id, r.business_id, r.actor_id].forEach(id); assertPromptAdminType(r.prompt_type);
  assertPromptAdminBase(r.previous); assertPromptAdminVersion(r.published); date(r.published_at); text(r.reason, 4000);
  if (r.published.version !== r.previous.version + 1 || r.published.id === r.previous.id) fail();
  if (r.kind === 'publish') { [r.draft_id, r.test_id, r.review_id].forEach(id); integer(r.draft_revision, 1); }
  else if (r.kind !== 'revert' || [r.draft_id, r.draft_revision, r.test_id, r.review_id].some(x => x !== null) || !r.reason.trim()) fail(); }
export function assertPromptAdminEvidence(v: unknown): asserts v is PromptAdminEvidence { const r = obj(v, ['asset', 'operation_key', 'effective_prompt', 'revised_prompt', 'master_origin']);
  asset(r.asset); text(r.operation_key, 256, false); text(r.effective_prompt, 100000, false); if (r.revised_prompt !== null) text(r.revised_prompt, 100000); if (r.master_origin !== 'unknown') fail(); }
export function assertPromptAdminRead(v: unknown): asserts v is PromptAdminRead { const r = obj(v, ['business_id', 'actor_id', 'prompt_type', 'prompt_types', 'base', 'versions', 'draft', 'tests', 'reviews', 'receipts', 'evidence']);
  id(r.business_id); id(r.actor_id); assertPromptAdminType(r.prompt_type); assertPromptAdminBase(r.base);
  if (!Array.isArray(r.prompt_types) || !r.prompt_types.length || r.prompt_types.length > 100) fail(); r.prompt_types.forEach(assertPromptAdminType); if (!r.prompt_types.includes(r.prompt_type)) fail();
  if (r.draft !== null) { assertPromptAdminDraft(r.draft); if (r.draft.business_id !== r.business_id || r.draft.actor_id !== r.actor_id || r.draft.prompt_type !== r.prompt_type) fail(); }
  for (const [key, validator] of [['versions', assertPromptAdminVersion], ['tests', assertPromptAdminTest], ['reviews', assertPromptAdminReview], ['receipts', assertPromptAdminReceipt], ['evidence', assertPromptAdminEvidence]] as const) {
    const rows = r[key]; if (!Array.isArray(rows) || rows.length > 100) fail(); rows.forEach(validator); }
  for (const row of [...r.tests as PromptAdminTest[], ...r.reviews as PromptAdminReview[], ...r.receipts as PromptAdminReceipt[]]) if (row.business_id !== r.business_id || row.actor_id !== r.actor_id) fail(); }
function request(r: Record<string, unknown>) { id(r.business_id); id(r.request_id); }
export function assertPromptAdminSaveInput(v: unknown): asserts v is PromptAdminSaveInput { const r = obj(v, ['business_id', 'request_id', 'expected_revision', 'draft']); request(r); integer(r.expected_revision); assertPromptAdminDraft(r.draft);
  if (r.draft.business_id !== r.business_id || r.draft.revision !== r.expected_revision || r.draft.status !== 'draft') fail(); }
export function assertPromptAdminTestInput(v: unknown): asserts v is PromptAdminTestInput { const r = obj(v, ['business_id', 'request_id', 'draft_id', 'expected_revision', 'visual_case', 'executor']); request(r); id(r.draft_id); integer(r.expected_revision, 1);
  assertPromptAdminVisualCase(r.visual_case); if (!['image_api', 'responses_image'].includes(String(r.executor)) || r.visual_case.references.some(x => x.business_id !== r.business_id)) fail(); }
export function assertPromptAdminReviewInput(v: unknown): asserts v is PromptAdminReviewInput { const r = obj(v, ['business_id', 'request_id', 'test_id', 'test_hash', 'before', 'after', 'decision', 'criteria', 'notes']);
  request(r); assertPromptAdminReview({ id: r.request_id, business_id: r.business_id, actor_id: r.request_id, test_id: r.test_id, test_hash: r.test_hash, before: r.before, after: r.after,
    decision: r.decision, criteria: r.criteria, notes: r.notes, created_at: '2026-01-01T00:00:00.000Z' }); }
export function assertPromptAdminPublishInput(v: unknown): asserts v is PromptAdminPublishInput { const r = obj(v, ['business_id', 'request_id', 'draft_id', 'expected_revision', 'test_id', 'test_hash', 'review_id']);
  request(r); [r.draft_id, r.test_id, r.review_id].forEach(id); integer(r.expected_revision, 1); hash(r.test_hash); }
export function assertPromptAdminRevertInput(v: unknown): asserts v is PromptAdminRevertInput { const r = obj(v, ['business_id', 'request_id', 'prompt_type', 'expected_base_id', 'expected_base_version', 'expected_base_hash', 'version_id', 'reason']);
  request(r); assertPromptAdminType(r.prompt_type); id(r.expected_base_id); integer(r.expected_base_version, 1); hash(r.expected_base_hash); id(r.version_id); text(r.reason, 4000, false); }
export function assertPromptAdminDiscardInput(v: unknown): asserts v is PromptAdminDiscardInput { const r = obj(v, ['business_id', 'request_id', 'draft_id', 'expected_revision', 'reason']);
  request(r); id(r.draft_id); integer(r.expected_revision, 1); text(r.reason, 4000, false); }
export function assertPromptAdminMutation(v: unknown): asserts v is PromptAdminMutation { const r = obj(v, ['request_id', 'kind', 'result']); id(r.request_id);
  if (r.kind === 'save' || r.kind === 'discard') { assertPromptAdminDraft(r.result); if (r.kind === 'discard' && r.result.status !== 'discarded') fail(); } else if (r.kind === 'test') { assertPromptAdminTest(r.result); if (r.result.id !== r.request_id) fail(); }
  else if (r.kind === 'review') { assertPromptAdminReview(r.result); if (r.result.id !== r.request_id) fail(); }
  else if (r.kind === 'publish' || r.kind === 'revert') { assertPromptAdminReceipt(r.result); if (r.result.request_id !== r.request_id || r.result.kind !== r.kind) fail(); } else fail(); }
/** Text hashes use exact UTF-8 bytes, matching PostgreSQL sha256(convert_to()). */
export async function promptAdminTextHash(text: string): Promise<string> { return materialHash(new TextEncoder().encode(text)); }
export async function promptAdminTestHash(test: Omit<PromptAdminTest, 'test_hash' | 'created_at'>): Promise<string> { return materialHash(test); }
export async function verifyPromptAdminTest(test: PromptAdminTest): Promise<void> { assertPromptAdminTest(test); const { test_hash, created_at: _created, ...frozen } = test;
  if (await materialHash(test.corpus) !== test.corpus_hash || await promptAdminTestHash(frozen) !== test_hash) fail(); }
export function newPromptAdminDraft(businessId: string, actorId: string, promptType: string, base: PromptAdminBase, evidence: AssetVersion): PromptAdminDraft {
  const value: PromptAdminDraft = { schema_version: 1, id: crypto.randomUUID(), business_id: businessId, actor_id: actorId, prompt_type: promptType, revision: 0,
    base: structuredClone(base), new_text: base.text, diagnosis: 'prompt', repeat: '', avoid: '', hypothesis: '', benefit: '', risks: '', evidence_asset: structuredClone(evidence), status: 'draft' };
  assertPromptAdminDraft(value); return value;
}
