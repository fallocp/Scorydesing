import type { DesignOperation, AssetVersion } from './contracts.ts';
import { assertProductionApplyInput, assertProductionPrepareInput, assertProductionSource, assertProductionSnapshot, productionCopyHash,
  type ProductionApplyInput, type ProductionPrepareInput, type ProductionSnapshot, type ProductionSource, type ProductionRead, type ProductionReceipt } from './production.ts';
import type { ProductionRepository, ProductionSourceState } from './productionRepository.ts';
import { canonicalExploration } from './explorationRepository.ts';
import { readServerState, executeServerCommand, ServerBoundaryError, type ServerRepository } from './serverRepository.ts';
import type { ServerHtmlConfig } from './serverHtml.ts';
import { assertBusinessId } from './serverRequest.ts';
import { materialHash } from './materials.ts';
import { inspectServerPng } from './serverPng.ts';
import { productionOutputCanvas, readPresentationFullDesign } from './presentationFullDesign.ts';
import { getAssetVersion, getAssetReviewStatus, type RegisteredAssetVersion } from './assets.ts';
import { PILOT_LIMITS } from './pilotHttp.ts';
import { isGenerationProfilePolicy } from './catalog.ts';

export interface ProductionStorage { get(key: string): Promise<Uint8Array>; putImmutable(key: string, bytes: Uint8Array): Promise<void> }
export interface ServerProductionDependencies { repository: ServerRepository; productionRepository: ProductionRepository;
  privateStorage: ProductionStorage; legacyStorage: ProductionStorage & { publicUrl(key: string): string }; now?: () => number }
export interface ServerProductionBoundary {
  prepare(actorId: string, input: ProductionPrepareInput): Promise<ProductionSnapshot>;
  read(actorId: string, businessId: string, source: ProductionSource): Promise<ProductionRead>;
  apply(actorId: string, input: ProductionApplyInput): Promise<ProductionReceipt>;
  recover(actorId: string, businessId: string, applyId: string): Promise<ProductionReceipt | null>;
  /** `pixels: false` keeps the database source/base checks but skips re-downloading and re-decoding the original. */
  validateOperation(actorId: string, operation: DesignOperation, options?: { pixels?: boolean }): Promise<void>;
}
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
function need(value: unknown, code: string, status = 409): asserts value { if (!value) throw new ServerBoundaryError(code, status); }
function validate(fn: () => void) { try { fn(); } catch { throw new ServerBoundaryError('invalid_production_request'); } }
/** SQL005 already retains the source brief. Store only the additional instruction
 * when regeneration embeds that same brief; retain the provider prompt separately.
 * The immutable action also covers a medium promotion of the selected direction. */
function relativeProductionInstruction(snapshot: ProductionSnapshot, operation: DesignOperation): string {
  const instruction = operation.context.instruction, source = snapshot.prompt.trim();
  if (!source || readPresentationFullDesign(operation.context)?.production?.action !== 'regenerate_image') return instruction;
  const text = instruction.trim();
  // An unchanged instruction is SQL005's existing no-addition representation.
  if (text === source) return snapshot.prompt;
  const changes = /^\s+Cambios solicitados:\r?\n/;
  if (text.startsWith(source) && changes.test(text.slice(source.length))) {
    return text.slice(source.length).replace(changes, '') || snapshot.prompt;
  }
  // Exploring a direction wraps the same input in the shared renderer's Encargo
  // line. Remove only that exact embedded source, preserving the selected idea.
  const embedded = '\nEncargo: ', at = text.indexOf(embedded);
  if (at >= 0) {
    const content = text.slice(at + embedded.length).trimStart(), remaining = content.slice(source.length);
    if (content.startsWith(source) && /^\s*\r?\n/.test(remaining)) {
      return `${text.slice(0, at)}\n${remaining.replace(changes, '').trimStart()}`;
    }
  }
  return instruction;
}
/** Source paths are resolved only from a trusted database row in the pinned bucket. */
export function productionLegacyKey(url: string, origin: string, businessId: string): string {
  try { const parsed = new URL(url), prefix = '/storage/v1/object/public/design-images/';
    need(parsed.origin === origin && parsed.pathname.startsWith(prefix) && !parsed.search && !parsed.hash, 'production_source_invalid', 400);
    const key = decodeURIComponent(parsed.pathname.slice(prefix.length));
    need(key.startsWith(`${businessId}/`) && key.length < 1024 && !/[\\\x00-\x1f\x7f]/.test(key)
      && key.split('/').every(part => !!part && part !== '.' && part !== '..'), 'production_source_invalid', 400); return key;
  } catch { throw new ServerBoundaryError('production_source_invalid'); }
}
export function createServerProduction(settings: ServerHtmlConfig, deps: ServerProductionDependencies): ServerProductionBoundary {
  const config = structuredClone(settings), repo = deps.productionRepository, now = deps.now ?? Date.now;
  async function gate(actor: string, biz: string) {
    assertBusinessId(actor); assertBusinessId(biz); need(config.enabled, 'server_feature_disabled', 503);
    try { const a = new URL(config.actualSupabaseOrigin), b = new URL(config.expectedSupabaseOrigin);
      need(a.origin === b.origin && a.origin === config.actualSupabaseOrigin && b.origin === config.expectedSupabaseOrigin && b.protocol === 'https:', 'server_production_configuration_invalid', 503);
    } catch { throw new ServerBoundaryError('server_production_configuration_invalid', 503); }
    const read = await deps.repository.read(biz, actor), p = read.policy;
    need(actor === config.actorId && biz === config.businessId && ['owner', 'admin'].includes(read.role), 'business_write_denied', 403);
    need(p.business_id === biz && p.policy_id === config.policyId
      && p.limit_micro_usd > 0 && p.max_image_outputs > 0 && p.reservation_per_output_micro_usd > 0
      && isGenerationProfilePolicy(p.enabled_image_profiles) && p.responses_image_enabled, 'server_policy_changed'); return read;
  }
  async function original(source: ProductionSourceState, biz: string) {
    const key = productionLegacyKey(source.base_mockup.image_url, config.expectedSupabaseOrigin, biz);
    let bytes: Uint8Array; try { bytes = (await deps.legacyStorage.get(key)).slice(); } catch { throw new ServerBoundaryError('production_storage_unavailable', 503); }
    need(bytes.length > 0 && bytes.length <= 8388608, 'request_too_large', 413);
    let canvas; try { canvas = await inspectServerPng(bytes); } catch { throw new ServerBoundaryError('production_png_required', 415); }
    need(canvas.width <= 4096 && canvas.height <= 4096 && canvas.width * canvas.height <= 4194304, 'unsupported_production_dimensions', 400);
    return { bytes, canvas, hash: await materialHash(bytes) };
  }
  async function current(snapshot: ProductionSnapshot, pixels = true) {
    const source = await repo.inspect(snapshot.business_id, snapshot.actor_id, snapshot.source);
    need(source.source_hash === snapshot.source_hash && source.base_mockup.id === snapshot.base_mockup_id, 'production_source_changed');
    if (pixels) { const input = await original(source, snapshot.business_id); need(input.hash === snapshot.base_asset.version_id && same(input.canvas, snapshot.canvas), 'production_base_changed'); }
    return source;
  }
  async function operationSnapshot(actor: string, operation: DesignOperation, checkCurrent: boolean, pixels = true) {
    const c = operation.context; need(c.workspace === 'production' && c.actor_id === actor && c.business_id === config.businessId, 'production_result_mismatch');
    assertBusinessId(c.project_id); const saved = await repo.snapshot(c.business_id, actor, c.project_id);
    need(saved, 'production_snapshot_not_found', 404); const s = saved.snapshot;
    need(s.copy.origin !== 'unavailable', 'production_copy_required');
    let full; try { full = readPresentationFullDesign(c); } catch { throw new ServerBoundaryError('production_result_mismatch', 409); }
    const source = s.source;
    need(full?.production && full.production.sourceHash === s.source_hash && same(full.canvas, s.output_canvas)
      && c.copy_version_id === s.copy.version_id && c.brand_id === s.business_id && c.target.document_id === s.id && c.target.revision === '1'
      && c.target.document_type === (source.kind === 'image' ? 'image' : 'carousel')
      && c.target.slide_id === (source.kind === 'carousel' ? source.slide_id : undefined) && c.target.page_id === undefined && c.target.element_id === undefined
      && c.session_id === `production:${s.id}:${full.production.action}` && same(operation.image?.size, s.output_canvas), 'production_result_mismatch');
    if (operation.action === 'edit_image') need(same(c.base_asset, s.base_asset), 'production_base_changed');
    else if (operation.action === 'regenerate_image') need(!c.base_asset, 'production_base_changed');
    else need(operation.action === 'generate_medium', 'production_result_mismatch');
    if (checkCurrent) await current(s, pixels); return s;
  }
  async function verifiedAsset(identity: AssetVersion, asset: RegisteredAssetVersion) {
    need(same(identity, asset.identity) && asset.storage.mime_type === 'image/png' && asset.storage.size_bytes <= 8388608, 'production_result_mismatch');
    let bytes: Uint8Array; try { bytes = (await deps.privateStorage.get(asset.storage.storage_key)).slice(); } catch { throw new ServerBoundaryError('production_storage_unavailable', 503); }
    need(bytes.length === asset.storage.size_bytes && await materialHash(bytes) === identity.version_id, 'production_result_mismatch');
    let dimensions; try { dimensions = await inspectServerPng(bytes); } catch { throw new ServerBoundaryError('production_png_required', 415); }
    need(dimensions.width === asset.storage.width && dimensions.height === asset.storage.height, 'production_result_mismatch'); return bytes;
  }
  return {
    async read(actor, biz, source) { assertBusinessId(actor); assertBusinessId(biz); validate(() => assertProductionSource(source)); return repo.read(biz, actor, structuredClone(source)); },
    async recover(actor, biz, id) { assertBusinessId(actor); assertBusinessId(biz); assertBusinessId(id); return (await repo.recover(biz, actor, id))?.receipt ?? null; },
    async prepare(actor, input) {
      const request = structuredClone(input); validate(() => assertProductionPrepareInput(request)); assertBusinessId(actor);
      const prior = await repo.snapshot(request.business_id, actor, request.prepare_id);
      if (prior) { need(same(prior.request, request), 'production_request_conflict'); return prior.snapshot; }
      await gate(actor, request.business_id); const source = await repo.inspect(request.business_id, actor, request.source), image = await original(source, request.business_id);
      let output; try { output = productionOutputCanvas(image.canvas); } catch { throw new ServerBoundaryError('unsupported_production_dimensions'); }
      need(source.copy_text === null || request.confirmed_copy === undefined || request.confirmed_copy === source.copy_text, 'production_copy_conflict');
      const text = source.copy_text ?? request.confirmed_copy ?? '', origin = source.copy_text !== null ? 'source' : request.confirmed_copy !== undefined ? 'user_confirmed' : 'unavailable';
      need(text.length <= 4000 && source.prompt.length <= 64000 && source.protected_context.length <= 64000, 'production_context_too_large', 413);
      const version: RegisteredAssetVersion = { identity: { business_id: request.business_id, asset_id: request.prepare_id, version_id: image.hash },
        brand_id: request.business_id, project_id: request.prepare_id, storage: { storage_key: `${request.business_id}/production_sources/${request.prepare_id}.png`,
          mime_type: 'image/png', ...image.canvas, size_bytes: image.bytes.length }, provenance: { kind: 'imported', origin: 'existing_library' } };
      const state = await readServerState(deps.repository, request.business_id, actor);
      const imported = state.state.assets.versions.find(v => v.identity.asset_id === request.prepare_id);
      need(!imported || same(imported, version), 'production_request_conflict');
      const snapshot: ProductionSnapshot = { schema_version: 1, id: request.prepare_id, business_id: request.business_id, actor_id: actor, source: request.source,
        source_hash: source.source_hash, base_mockup_id: source.base_mockup.id, base_asset: version.identity, canvas: image.canvas, output_canvas: output,
        prompt: source.prompt, copy: { text, origin, version_id: await productionCopyHash(request.prepare_id, text, origin) }, protected_context: source.protected_context, created_at: new Date(now()).toISOString() };
      assertProductionSnapshot(snapshot);
      await deps.privateStorage.putImmutable(version.storage.storage_key, image.bytes);
      await gate(actor, request.business_id); await current(snapshot);
      try { await executeServerCommand(deps.repository, request.business_id, actor, { kind: 'register_import', version });
        return await repo.prepare(actor, request, snapshot, config.policyId);
      } catch (error) { if (error instanceof ServerBoundaryError && error.status < 500) throw error; throw new ServerBoundaryError('server_production_outcome_unknown', 503); }
    },
    async validateOperation(actor, operation, options) { const frozen = structuredClone(operation); await gate(actor, frozen.context.business_id);
      await operationSnapshot(actor, frozen, true, options?.pixels ?? true); },
    async apply(actor, input) {
      const request = structuredClone(input); validate(() => assertProductionApplyInput(request)); assertBusinessId(actor);
      const prior = await repo.recover(request.business_id, actor, request.apply_id);
      if (prior) { need(same(prior.request, request), 'production_apply_conflict'); return prior.receipt; }
      const read = await gate(actor, request.business_id), saved = await repo.snapshot(request.business_id, actor, request.snapshot_id);
      need(saved, 'production_snapshot_not_found', 404); const snapshot = saved.snapshot;
      need(request.source_hash === snapshot.source_hash && same(request.base_asset, snapshot.base_asset), 'production_base_changed');
      await current(snapshot);
      const state = await readServerState({ ...deps.repository, read: async () => read }, request.business_id, actor);
      let asset; try { asset = getAssetVersion(state.state.assets, request.result_asset); } catch { throw new ServerBoundaryError('production_result_mismatch', 409); }
      need(asset.provenance.kind === 'image_operation' && getAssetReviewStatus(state.state.assets, request.result_asset) === 'approved', 'production_not_approved');
      const provenance = asset.provenance;
      const operation = state.state.jobs.jobs.find(j => j.operation_key === provenance.operation_key)?.plan.operation;
      need(operation && (operation.context.interaction_mode === 'execute_change' || ['medium', 'high'].includes(provenance.quality)), 'production_not_approved');
      const validatedSnapshot = await operationSnapshot(actor, operation, false), full = readPresentationFullDesign(operation.context);
      need(validatedSnapshot.id === snapshot.id && full, 'production_result_mismatch');
      const bytes = await verifiedAsset(request.result_asset, asset);
      need(asset.storage.width === snapshot.output_canvas.width && asset.storage.height === snapshot.output_canvas.height, 'production_result_mismatch');
      const key = `${request.business_id}/mockups/desaing-${request.apply_id}.png`, url = deps.legacyStorage.publicUrl(key);
      need(productionLegacyKey(url, config.expectedSupabaseOrigin, request.business_id) === key, 'production_source_invalid');
      await deps.legacyStorage.putImmutable(key, bytes);
      await gate(actor, request.business_id); await current(snapshot);
      try { return await repo.apply({ actorId: actor, request, stateRevision: state.revision, imageUrl: url, prompt: provenance.effective_prompt,
        instruction: relativeProductionInstruction(snapshot, operation), copyText: full.approvedCopy, policyId: config.policyId }); }
      catch (error) { if (error instanceof ServerBoundaryError && error.status < 500) throw error; throw new ServerBoundaryError('server_production_outcome_unknown', 503); }
    },
  };
}
