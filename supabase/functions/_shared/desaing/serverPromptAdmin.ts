import type { AssetVersion, DesignOperation } from './contracts.ts';
import { assertPromptAdminSaveInput, assertPromptAdminTestInput, assertPromptAdminReviewInput, assertPromptAdminPublishInput, assertPromptAdminRevertInput, assertPromptAdminDiscardInput,
  assertPromptAdminType, assertPromptAdminRead, promptAdminTextHash, promptAdminTestHash, verifyPromptAdminTest,
  type PromptAdminCapabilities, type PromptAdminRead, type PromptAdminDraft, type PromptAdminTest, type PromptAdminReview, type PromptAdminMutation,
  type PromptAdminSaveInput, type PromptAdminTestInput, type PromptAdminReviewInput, type PromptAdminPublishInput, type PromptAdminRevertInput, type PromptAdminDiscardInput } from './promptAdmin.ts';
import type { PromptAdminRepository } from './promptAdminRepository.ts';
import { buildPromptAdminTestOperations } from './promptAdminComparison.ts';
import { evaluatePromptAdminCorpus } from './promptAdminCorpus.ts';
import { canonicalExploration } from './explorationRepository.ts';
import { materialHash } from './materials.ts';
import { getAssetVersion, getAssetReviewStatus } from './assets.ts';
import { readServerState, ServerBoundaryError, type ServerRepository } from './serverRepository.ts';
import type { ServerHtmlConfig } from './serverHtml.ts';
import { assertBusinessId } from './serverRequest.ts';
import { PILOT_LIMITS } from './pilotHttp.ts';
import { isGenerationProfilePolicy } from './catalog.ts';

export interface ServerPromptAdminBoundary {
  capabilities(actorId: string, businessId: string): Promise<PromptAdminCapabilities>;
  read(actorId: string, businessId: string, promptType?: string): Promise<PromptAdminRead>;
  save(actorId: string, input: PromptAdminSaveInput): Promise<PromptAdminMutation>;
  test(actorId: string, input: PromptAdminTestInput): Promise<PromptAdminMutation>;
  review(actorId: string, input: PromptAdminReviewInput): Promise<PromptAdminMutation>;
  publish(actorId: string, input: PromptAdminPublishInput): Promise<PromptAdminMutation>;
  revert(actorId: string, input: PromptAdminRevertInput): Promise<PromptAdminMutation>;
  discard(actorId: string, input: PromptAdminDiscardInput): Promise<PromptAdminMutation>;
  recover(actorId: string, businessId: string, requestId: string): Promise<PromptAdminMutation | null>;
  validateOperation(actorId: string, operation: DesignOperation): Promise<void>;
}
export interface ServerPromptAdminDependencies { repository: ServerRepository; promptAdminRepository: PromptAdminRepository; now?: () => number }
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
function need(value: unknown, code: string, status = 409): asserts value { if (!value) throw new ServerBoundaryError(code, status); }
function validate(fn: () => void) { try { fn(); } catch { throw new ServerBoundaryError('invalid_prompt_admin_request', 400); } }
/** No model calls here. Paid comparison sides use the existing guarded worker. */
export function createServerPromptAdmin(settings: ServerHtmlConfig, deps: ServerPromptAdminDependencies): ServerPromptAdminBoundary {
  const config = structuredClone(settings), repo = deps.promptAdminRepository, now = deps.now ?? Date.now;
  async function gate(actor: string, biz: string) {
    assertBusinessId(actor); assertBusinessId(biz); need(config.enabled, 'prompt_admin_disabled', 503);
    need(actor === config.actorId && biz === config.businessId, 'prompt_admin_forbidden', 403);
    try { const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
      need(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin && actual.origin === config.actualSupabaseOrigin
        && expected.origin === actual.origin, 'server_prompt_admin_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_prompt_admin_configuration_invalid', 503); }
    const access = await repo.capabilities(biz, actor); need(access.governed && access.can_manage, 'prompt_admin_forbidden', 403);
    const read = await deps.repository.read(biz, actor), p = read.policy;
    need(p.business_id === biz && p.policy_id === config.policyId
      && p.limit_micro_usd > 0 && p.max_image_outputs > 0 && p.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(p.enabled_image_profiles) && p.responses_image_enabled, 'server_policy_changed');
    return readServerState({ ...deps.repository, read: async () => read }, biz, actor);
  }
  type State = Awaited<ReturnType<typeof gate>>;
  function approved(state: State, identity: AssetVersion, actor: string, requireApproval = true) {
    let asset; try { asset = getAssetVersion(state.state.assets, identity); } catch { throw new ServerBoundaryError('prompt_admin_evidence_invalid', 409); }
    need(asset.provenance.kind === 'image_operation' && (!requireApproval || getAssetReviewStatus(state.state.assets, identity) === 'approved'), 'prompt_admin_evidence_invalid');
    const provenance = asset.provenance;
    const owner = state.state.jobs.jobs.find(j => j.operation_key === provenance.operation_key);
    need(owner?.plan.operation.context.actor_id === actor && owner.plan.operation.context.business_id === identity.business_id
      && owner.calls.some(call => (requireApproval ? call.state === 'approved' : ['needs_review', 'approved', 'rejected'].includes(call.state))
        && call.receipt?.outputs.some(output => same(output.asset, identity))), 'prompt_admin_evidence_invalid');
    return { asset, provenance, job: owner };
  }
  async function currentDraft(actor: string, biz: string, id: string, revision?: number) {
    const draft = await repo.draft(biz, actor, id); need(draft && draft.status === 'draft' && (revision === undefined || draft.revision === revision), 'prompt_admin_revision_conflict');
    const read = await repo.read(biz, actor, draft.prompt_type); need(same(read.base, draft.base), 'prompt_admin_base_changed'); return draft;
  }
  async function currentTest(actor: string, biz: string, id: string, hash?: string) {
    const test = await repo.test(biz, actor, id); need(test && (!hash || test.test_hash === hash), 'prompt_admin_test_invalid');
    await verifyPromptAdminTest(test); const draft = await currentDraft(actor, biz, test.draft_id, test.draft_revision);
    need(test.base_hash === draft.base.hash && test.candidate_hash === await promptAdminTextHash(draft.new_text), 'prompt_admin_test_invalid');
    const corpus = await evaluatePromptAdminCorpus(draft.base.text, draft.new_text);
    need(same(test.corpus, corpus) && same(test.operations, buildPromptAdminTestOperations({ test_id: test.id, business_id: biz, actor_id: actor,
      base_prompt: draft.base.text, candidate_prompt: draft.new_text, visual_case: test.visual_case, executor: test.executor })), 'prompt_admin_test_invalid'); return { test, draft };
  }
  function comparison(state: State, test: PromptAdminTest, before: AssetVersion, after: AssetVersion, actor: string, requireApproval = true) {
    need(test.corpus.checks.every(check => check.passed), 'prompt_admin_test_invalid');
    for (const side of ['before', 'after'] as const) {
      const identity = side === 'before' ? before : after, item = approved(state, identity, actor, requireApproval), op = test.operations[side];
      need(same(item.job.plan.operation, op) && item.provenance.operation_key === op.operation_key && item.provenance.action === 'generate_image'
        && item.provenance.quality === 'low' && item.provenance.model_id === 'gpt-image-2.5-flare'
        && item.asset.storage.width === 1024 && item.asset.storage.height === 1024 && item.asset.storage.mime_type === 'image/png', 'prompt_admin_review_invalid');
    }
    need(!same(before, after), 'prompt_admin_review_invalid');
  }
  async function prior(actor: string, kind: PromptAdminMutation['kind'], request: { business_id: string; request_id: string }) {
    await gate(actor, request.business_id); const saved = await repo.recover(request.business_id, actor, request.request_id);
    if (saved) need(saved.mutation.kind === kind && same(saved.request, request), 'prompt_admin_request_conflict'); return saved?.mutation ?? null;
  }
  async function commit(actor: string, kind: PromptAdminMutation['kind'], request: { business_id: string; request_id: string }, result: unknown, stateRevision: number | null) {
    await gate(actor, request.business_id);
    try { return await repo.mutate({ businessId: request.business_id, actorId: actor, kind, request, result, stateRevision, policyId: config.policyId }); }
    catch (error) { if (error instanceof ServerBoundaryError && error.status < 500) throw error; throw new ServerBoundaryError('server_prompt_admin_outcome_unknown', 503); }
  }
  return {
    async capabilities(actor, biz) { assertBusinessId(actor); assertBusinessId(biz); const result = await repo.capabilities(biz, actor);
      if (result.can_manage) { try { await gate(actor, biz); } catch { result.can_manage = false; } } return result; },
    async read(actor, biz, type) { if (type !== undefined) validate(() => assertPromptAdminType(type)); const state = await gate(actor, biz), result = await repo.read(biz, actor, type);
      result.evidence = state.state.assets.versions.flatMap(asset => { try { const item = approved(state, asset.identity, actor);
        return [{ asset: structuredClone(asset.identity), operation_key: item.provenance.operation_key, effective_prompt: item.provenance.effective_prompt,
          revised_prompt: item.provenance.revised_prompt, master_origin: 'unknown' as const }]; } catch { return []; } }).slice(-100).reverse();
      assertPromptAdminRead(result); return result; },
    async recover(actor, biz, id) { assertBusinessId(id); await gate(actor, biz); return (await repo.recover(biz, actor, id))?.mutation ?? null; },
    async save(actor, input) { const request = structuredClone(input); validate(() => assertPromptAdminSaveInput(request)); const replay = await prior(actor, 'save', request); if (replay) return replay;
      const proposed = request.draft; need(proposed.actor_id === actor, 'prompt_admin_forbidden', 403);
      const read = await repo.read(request.business_id, actor, proposed.prompt_type); need(same(read.base, proposed.base), 'prompt_admin_base_changed');
      const existing = await repo.draft(request.business_id, actor, proposed.id);
      need(existing ? existing.status === 'draft' && existing.revision === request.expected_revision && existing.prompt_type === proposed.prompt_type : request.expected_revision === 0, 'prompt_admin_revision_conflict');
      const state = await gate(actor, request.business_id); approved(state, proposed.evidence_asset, actor);
      return commit(actor, 'save', request, { ...proposed, revision: request.expected_revision + 1 }, state.revision); },
    async test(actor, input) { const request = structuredClone(input); validate(() => assertPromptAdminTestInput(request)); const replay = await prior(actor, 'test', request); if (replay) return replay;
      const draft = await currentDraft(actor, request.business_id, request.draft_id, request.expected_revision);
      need(draft.new_text !== draft.base.text, 'prompt_admin_unchanged'); need(draft.hypothesis.trim() && draft.benefit.trim() && draft.risks.trim() && (draft.repeat.trim() || draft.avoid.trim()), 'invalid_prompt_admin_request', 400);
      need(draft.base.text.length <= 32000 && draft.new_text.length <= 32000, 'prompt_admin_context_too_large', 413);
      const state = await gate(actor, request.business_id); approved(state, draft.evidence_asset, actor);
      for (const ref of request.visual_case.references) { let asset; try { asset = getAssetVersion(state.state.assets, { business_id: ref.business_id, asset_id: ref.asset_id, version_id: ref.version_id }); } catch { throw new ServerBoundaryError('prompt_admin_evidence_invalid', 409); }
        need(asset.storage.mime_type === 'image/png', 'prompt_admin_evidence_invalid'); }
      const corpus = await evaluatePromptAdminCorpus(draft.base.text, draft.new_text); let operations;
      try { operations = buildPromptAdminTestOperations({ test_id: request.request_id, business_id: request.business_id, actor_id: actor,
        base_prompt: draft.base.text, candidate_prompt: draft.new_text, visual_case: request.visual_case, executor: request.executor }); }
      catch (error) { if (error instanceof Error && error.message === 'prompt_admin_comparison_too_large') throw new ServerBoundaryError('prompt_admin_context_too_large', 413); throw new ServerBoundaryError('prompt_admin_test_invalid', 400); }
      const value = { id: request.request_id, business_id: request.business_id, actor_id: actor, draft_id: draft.id, draft_revision: draft.revision,
        base_hash: draft.base.hash, candidate_hash: await promptAdminTextHash(draft.new_text), corpus, corpus_hash: await materialHash(corpus),
        visual_case: request.visual_case, executor: request.executor, operations };
      const test: PromptAdminTest = { ...value, test_hash: await promptAdminTestHash(value), created_at: new Date(now()).toISOString() };
      return commit(actor, 'test', request, test, state.revision); },
    async review(actor, input) { const request = structuredClone(input); validate(() => assertPromptAdminReviewInput(request)); const replay = await prior(actor, 'review', request); if (replay) return replay;
      const { test } = await currentTest(actor, request.business_id, request.test_id, request.test_hash), state = await gate(actor, request.business_id);
      comparison(state, test, request.before, request.after, actor, request.decision === 'approved');
      const { request_id, ...review } = request; const result: PromptAdminReview = { ...review, id: request_id, actor_id: actor, created_at: new Date(now()).toISOString() };
      return commit(actor, 'review', request, result, state.revision); },
    async publish(actor, input) { const request = structuredClone(input); validate(() => assertPromptAdminPublishInput(request)); const replay = await prior(actor, 'publish', request); if (replay) return replay;
      const { draft, test } = await currentTest(actor, request.business_id, request.test_id, request.test_hash);
      need(draft.id === request.draft_id && draft.revision === request.expected_revision, 'prompt_admin_revision_conflict');
      const review = await repo.review(request.business_id, actor, request.review_id);
      need(review && review.test_id === test.id && review.test_hash === test.test_hash && review.decision === 'approved'
        && Object.values(review.criteria).every(value => value), 'prompt_admin_comparison_required');
      const latest = (await repo.read(request.business_id, actor, draft.prompt_type)).reviews.find(value => value.test_id === test.id);
      need(latest?.id === review.id, 'prompt_admin_review_invalid'); const state = await gate(actor, request.business_id);
      approved(state, draft.evidence_asset, actor); comparison(state, test, review.before, review.after, actor);
      return commit(actor, 'publish', request, null, state.revision); },
    async revert(actor, input) { const request = structuredClone(input); validate(() => assertPromptAdminRevertInput(request)); const replay = await prior(actor, 'revert', request); if (replay) return replay;
      const read = await repo.read(request.business_id, actor, request.prompt_type);
      need(read.base.id === request.expected_base_id && read.base.version === request.expected_base_version && read.base.hash === request.expected_base_hash, 'prompt_admin_base_changed');
      need(read.versions.some(version => version.id === request.version_id), 'prompt_admin_not_found', 404);
      return commit(actor, 'revert', request, null, null); },
    async discard(actor, input) { const request = structuredClone(input); validate(() => assertPromptAdminDiscardInput(request)); const replay = await prior(actor, 'discard', request); if (replay) return replay;
      const draft = await repo.draft(request.business_id, actor, request.draft_id);
      need(draft?.status === 'draft' && draft.revision === request.expected_revision, 'prompt_admin_revision_conflict');
      return commit(actor, 'discard', request, { ...draft, status: 'discarded', revision: draft.revision + 1 }, null); },
    async validateOperation(actor, operation) { const frozen = structuredClone(operation), c = frozen.context; await gate(actor, c.business_id);
      const { test } = await currentTest(actor, c.business_id, c.project_id);
      need(test.corpus.checks.every(check => check.passed) && (same(frozen, test.operations.before) || same(frozen, test.operations.after)), 'prompt_admin_test_invalid'); },
  };
}
