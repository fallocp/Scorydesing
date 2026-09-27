import { assertBrandSetupPublishInput, assertBrandSetupSaveInput, assertBrandSetupDraft, brandSetupDesignHash, buildBrandSetupBrief,
  BRAND_SETUP_CANVAS, BRAND_SETUP_DESIGN_MARKER, type BrandSetupDraft, type BrandSetupRead, type BrandSetupReceipt,
  type BrandSetupSaveInput, type BrandSetupPublishInput } from './onboarding.ts';
import type { OnboardingRepository } from './onboardingRepository.ts';
import type { MaterialsRepository } from './materialsRepository.ts';
import { assertMaterialAnalysisResult, makeMaterialAnalysisRequest } from './materials.ts';
import { canonicalExploration } from './explorationRepository.ts';
import { getAssetVersion, getAssetReviewStatus } from './assets.ts';
import { fullDesignImmutables, readPresentationFullDesign } from './presentationFullDesign.ts';
import { readServerState, ServerBoundaryError, type ServerRepository } from './serverRepository.ts';
import type { ServerHtmlConfig } from './serverHtml.ts';
import { assertBusinessId } from './serverRequest.ts';
import { PILOT_LIMITS } from './pilotHttp.ts';
import { isGenerationProfilePolicy } from './catalog.ts';

export interface ServerOnboardingBoundary {
  read(actorId: string, businessId: string): Promise<BrandSetupRead>;
  save(actorId: string, input: BrandSetupSaveInput): Promise<BrandSetupDraft>;
  publish(actorId: string, input: BrandSetupPublishInput): Promise<BrandSetupReceipt>;
  recover(actorId: string, businessId: string, publishId: string): Promise<BrandSetupReceipt | null>;
}
export interface ServerOnboardingDependencies { repository: ServerRepository; onboardingRepository: OnboardingRepository; materialsRepository: MaterialsRepository }
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
function need(value: unknown, code: string, status = 409): asserts value { if (!value) throw new ServerBoundaryError(code, status); }
function validate(fn: () => void) { try { fn(); } catch { throw new ServerBoundaryError('invalid_onboarding_request'); } }
/** Metadata only: it neither reserves budget nor invokes a model. Existing paid gates remain authoritative. */
export function createServerOnboarding(settings: ServerHtmlConfig, deps: ServerOnboardingDependencies): ServerOnboardingBoundary {
  const config = structuredClone(settings), repo = deps.onboardingRepository;
  async function gate(actorId: string, businessId: string) {
    assertBusinessId(actorId); assertBusinessId(businessId);
    const read = await deps.repository.read(businessId, actorId);
    need(config.enabled, 'server_feature_disabled', 503);
    try { const expected = new URL(config.expectedSupabaseOrigin), actual = new URL(config.actualSupabaseOrigin);
      need(expected.protocol === 'https:' && expected.origin === config.expectedSupabaseOrigin && actual.origin === config.actualSupabaseOrigin
        && actual.origin === expected.origin, 'server_onboarding_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_onboarding_configuration_invalid', 503); }
    need(actorId === config.actorId && businessId === config.businessId && ['owner', 'admin'].includes(read.role), 'business_write_denied', 403);
    const p = read.policy;
    need(p.business_id === businessId && p.policy_id === config.policyId
      && p.limit_micro_usd > 0 && p.max_image_outputs > 0 && p.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(p.enabled_image_profiles) && p.responses_image_enabled, 'server_policy_changed');
    return read;
  }
  async function materialContext(draft: BrandSetupDraft): Promise<string> {
    const ref = draft.reviewed_materials; if (!ref) return '';
    const c = await deps.materialsRepository.read({ businessId: draft.business_id, actorId: draft.actor_id, collectionId: ref.collection_id });
    need(c.revision === ref.review_revision && c.review?.approved && c.review.analysis_key === ref.analysis_key
      && c.review.source_hash === ref.source_hash, 'server_onboarding_materials_changed');
    const request = await makeMaterialAnalysisRequest(c), entry = await deps.materialsRepository.recover(draft.business_id, draft.actor_id, ref.analysis_key);
    need(entry?.status === 'completed' && entry.result && same(entry.request, request) && request.source_hash === ref.source_hash, 'server_onboarding_materials_changed');
    try { assertMaterialAnalysisResult(entry.result, request, c.materials); } catch { throw new ServerBoundaryError('server_onboarding_materials_changed', 409); }
    const result = entry.result;
    need(ref.finding_ids.every(id => result.findings.some(f => f.id === id)) && c.review.corrections.every(correction => result.findings.some(f => f.id === correction.finding_id)), 'server_onboarding_materials_changed');
    const lines = ref.finding_ids.map(id => { const finding = result.findings.find(f => f.id === id)!, correction = c.review!.corrections.find(x => x.finding_id === id);
      return `- ${correction ? 'Corrección del usuario' : finding.certainty === 'inferred' ? 'Interpretación' : finding.certainty === 'uncertain' ? 'Pendiente de confirmar' : 'Dato de la fuente'}: ${correction?.value ?? finding.value}`; });
    const sources = request.sources.map(identity => c.materials.find(v => v.material_id === identity.material_id && v.version_id === identity.version_id)!);
    const text = `Información de materiales revisada por el usuario:\n${lines.join('\n')}\nFuentes: ${sources.map(s => `${s.filename} (${s.version_id.slice(0, 8)})`).join('; ')}.`;
    need(text.length <= 8000, 'server_onboarding_context_too_large', 413); return text;
  }
  async function direction(draft: BrandSetupDraft) {
    need(draft.direction && draft.confirmed_profile && draft.reviewed_materials, 'server_onboarding_direction_required');
    const read = await gate(draft.actor_id, draft.business_id);
    const state = await readServerState({ ...deps.repository, read: async () => read }, draft.business_id, draft.actor_id);
    let asset; try { asset = getAssetVersion(state.state.assets, draft.direction); } catch { throw new ServerBoundaryError('server_onboarding_direction_changed', 409); }
    const provenance = asset.provenance;
    need(provenance.kind === 'image_operation' && ['medium', 'high'].includes(provenance.quality)
      && getAssetReviewStatus(state.state.assets, draft.direction) === 'approved', 'server_onboarding_direction_not_approved');
    const job = state.state.jobs.jobs.find(j => j.operation_key === provenance.operation_key), op = job?.plan.operation;
    // Historical promotions keep their parent/direction checks. A separately
    // requested medium/high design is reviewed directly, never labelled a promotion.
    need(op && (op.action === 'generate_medium' || op.action === 'generate_image'
      && op.image?.quality === provenance.quality && !op.context.base_asset && !op.context.direction_approval), 'server_onboarding_direction_changed');
    const c = op.context, t = c.target;
    need(c.business_id === draft.business_id && c.actor_id === draft.actor_id && c.brand_id === draft.business_id && c.project_id === draft.id
      && c.workspace === 'onboarding' && t.document_type === 'special' && t.document_id === draft.id && t.page_id === draft.page_id
      && t.slide_id === undefined && t.element_id === undefined && t.revision === String(draft.design_revision)
      && c.session_id === `onboarding:${draft.id}:${draft.page_id}:full_design`, 'server_onboarding_direction_changed');
    let full; try { full = readPresentationFullDesign(c); } catch { throw new ServerBoundaryError('server_onboarding_direction_changed', 409); }
    need(full && full.approvedCopy === draft.profile.name && same(full.canvas, BRAND_SETUP_CANVAS)
      && c.immutable_elements.includes(`${BRAND_SETUP_DESIGN_MARKER}${await brandSetupDesignHash(draft)}.`), 'server_onboarding_direction_changed');
    return state.revision;
  }
  return {
    async read(actorId, businessId) { assertBusinessId(actorId); assertBusinessId(businessId); const result = await repo.read(businessId, actorId);
      try { await gate(actorId, businessId); } catch { result.can_write = false; } return result; },
    async recover(actorId, businessId, publishId) { assertBusinessId(actorId); assertBusinessId(businessId); assertBusinessId(publishId); return repo.recover(businessId, actorId, publishId); },
    async save(actorId, input) {
      const value = structuredClone(input); validate(() => assertBrandSetupSaveInput(value)); const proposed = value.draft;
      need(actorId === proposed.actor_id, 'business_write_denied', 403); await gate(actorId, value.business_id);
      const read = await repo.read(value.business_id, actorId), current = read.draft;
      need(read.can_write, 'business_write_denied', 403);
      const rebased = !!current && (proposed.base_fingerprint !== current.base_fingerprint || proposed.base_profile_version !== current.base_profile_version);
      if (current) { need(current.status === 'draft' && proposed.id === current.id && proposed.page_id === current.page_id, 'server_onboarding_revision_conflict');
        if (rebased) need(!proposed.confirmed_profile && !proposed.direction && proposed.base_fingerprint === read.base.fingerprint
          && proposed.base_profile_version === read.base.profile_version, 'server_onboarding_base_changed'); }
      else need(value.expected_revision === 0 && proposed.design_revision === 1 && proposed.base_fingerprint === read.base.fingerprint
        && proposed.base_profile_version === read.base.profile_version && !proposed.direction, 'server_onboarding_base_changed');
      const next = { ...proposed, material_context: await materialContext(proposed) };
      const changed = rebased || !!current && await brandSetupDesignHash(next) !== await brandSetupDesignHash(current);
      next.design_revision = current ? current.design_revision + (changed ? 1 : 0) : 1;
      if (changed) next.direction = null;
      if (next.confirmed_profile) {
        need(next.reviewed_materials, 'server_onboarding_materials_required');
        const immutables = fullDesignImmutables(next.profile.name, BRAND_SETUP_CANVAS, { workspace: 'onboarding', document_type: 'special',
          page_id: next.page_id, brand_id: next.business_id, brief_hash: await brandSetupDesignHash(next) });
        need(new TextEncoder().encode([buildBrandSetupBrief(next), ...immutables].join('\n')).length <= PILOT_LIMITS.maxBriefBytes, 'server_onboarding_brief_too_large', 413);
      }
      if (current && !changed && [value.expected_revision, value.expected_revision + 1].includes(current.revision)
        && same({ ...next, revision: current.revision }, current)) return current;
      need((current?.revision ?? 0) === value.expected_revision, 'server_onboarding_revision_conflict');
      if (next.direction) await direction(next);
      next.revision = value.expected_revision + 1; assertBrandSetupDraft(next);
      try { return await repo.save({ businessId: value.business_id, actorId, expectedRevision: value.expected_revision, draft: next, policyId: config.policyId }); }
      catch (error) { if (error instanceof ServerBoundaryError && error.status < 500) throw error; throw new ServerBoundaryError('server_onboarding_outcome_unknown', 503); }
    },
    async publish(actorId, input) {
      const request = structuredClone(input); validate(() => assertBrandSetupPublishInput(request)); assertBusinessId(actorId);
      const receipt = await repo.recover(request.business_id, actorId, request.publish_id);
      if (receipt) { need(receipt.draft_id === request.draft_id && receipt.draft_revision === request.expected_revision, 'server_onboarding_publish_conflict'); return receipt; }
      await gate(actorId, request.business_id); const read = await repo.read(request.business_id, actorId), draft = read.draft;
      need(read.can_write, 'business_write_denied', 403);
      need(draft?.status === 'draft' && draft.id === request.draft_id && draft.revision === request.expected_revision, 'server_onboarding_revision_conflict');
      need(read.base.fingerprint === draft.base_fingerprint && read.base.profile_version === draft.base_profile_version, 'server_onboarding_base_changed');
      need(await materialContext(draft) === draft.material_context, 'server_onboarding_materials_changed'); const stateRevision = await direction(draft);
      const p = draft.profile;
      try { return await repo.publish({ actorId, request, draft, stateRevision, policyId: config.policyId,
        baseBrand: { name: p.name, brand_name: p.name, colors: p.colors, fonts: p.fonts, visual_identity: p.style, aesthetic: p.style,
          restrictions: p.restrictions, detected_dont: p.restrictions, onboarding: { draft_id: draft.id, design_revision: draft.design_revision,
            material_refs: draft.reviewed_materials, material_context: draft.material_context, direction: draft.direction, design_hash: await brandSetupDesignHash(draft) } },
        strategicLayer: { tone: p.tone, audience: p.audience, positioning: p.positioning }, preferences: p.preferences });
      } catch (error) { if (error instanceof ServerBoundaryError && error.status < 500) throw error; throw new ServerBoundaryError('server_onboarding_outcome_unknown', 503); }
    },
  };
}
