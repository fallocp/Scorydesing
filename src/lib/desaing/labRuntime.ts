import type { AssetVersion, CandidateVersion, DesignOperation, PlanningEnvironment } from '../../../supabase/functions/_shared/desaing/contracts';
import { getAssetVersion, getAssetReviewStatus, mountAssetVersion, recordDirectionApproval, registerAssetVersion, reviewAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { beginJobCall, beginJobValidation, cancelImageJob, enqueueImageJob, finishJobValidation, recordJobResult,
  recoverImageJobs, reviewJobCall, settleJobCallCost, summarizeImageJob } from '../../../supabase/functions/_shared/desaing/jobLedger';
import { prepareImageRequests } from '../../../supabase/functions/_shared/desaing/imageRequest';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../../../supabase/functions/_shared/desaing/imageResponse';
import { getFormatPreset, resolveFormatPlan } from '../../../supabase/functions/_shared/desaing/formats';
import type { FormatPresetId } from '../../../supabase/functions/_shared/desaing/formats';
import { createLabComposition, editLabComposition, placeLabAsset, renderLabComposition } from './labComposition';
import type { ReusableDocument } from './labComposition';
import { imageDataUrl } from './labImages';
import type { LabBlobStore, LabImage } from './labImages';
import type { LocalDesignState, LocalDesignStore } from './localDesignStore';
import type { LabActions, LabCompositionTarget, LabViewModel } from './labTypes';

export const LAB_BUSINESS = 'desaing-lab-local';
export const LAB_POLICY = { policy_id: 'simulation-no-cost-v1', limit_micro_usd: 0, max_image_outputs: 500 };
const ACTOR = 'local-lab-user';
const FORMATS: FormatPresetId[] = ['presentation_16_9', 'cover_16_9', 'page_portrait'];
const directions = ['Perspectiva lateral con espacio libre.', 'Vista diagonal con volumen central.',
  'Composición ligera con objeto ascendente.', 'Vista editorial de líneas suaves.', 'Objeto en perspectiva con contraste.'];
const equalAsset = (a: AssetVersion, b: AssetVersion) => a.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;
const assetKey = (asset: AssetVersion) => JSON.stringify([asset.business_id, asset.asset_id, asset.version_id]);
const environment = (op: DesignOperation): PlanningEnvironment => ({ actor_id: ACTOR, business_id: op.context.business_id,
  enabled_image_profiles: ['baseline'], responses_image_enabled: false,
  authorization: { authorization_id: `lab-auth-${op.operation_key}`, actor_id: ACTOR, scope: structuredClone(op) } });

export function activeLabDocument(state: LocalDesignState): ReusableDocument {
  const docs = state.lab?.documents.filter(doc => doc.document_id === state.lab!.active_document_id) ?? [];
  const doc = docs[docs.length - 1];
  if (!doc) throw new Error('No hay un documento activo en el laboratorio.');
  return doc;
}

export interface LabRuntimeDependencies {
  store: LocalDesignStore;
  blobs: LabBlobStore;
  draw: (index: number, size: { width: number; height: number }, instruction: string) => Promise<LabImage>;
  now?: () => number;
  id?: () => string;
}

/** Local orchestration of the shared contracts. There is deliberately no HTTP transport. */
export class LabRuntime {
  readonly store: LocalDesignStore;
  private blobs: LabBlobStore;
  private draw: LabRuntimeDependencies['draw'];
  private now: () => number;
  private id: () => string;
  private dataUrls = new Map<string, string>();
  constructor(dependencies: LabRuntimeDependencies) {
    this.store = dependencies.store; this.blobs = dependencies.blobs; this.draw = dependencies.draw;
    this.now = dependencies.now ?? Date.now; this.id = dependencies.id ?? (() => crypto.randomUUID());
  }

  private newDocument(business_id: string, format: FormatPresetId, title = 'Ideas que toman vuelo'): ReusableDocument {
    const preset = getFormatPreset(format);
    return createLabComposition({ business_id, document_id: `document-${this.id()}`,
      document_type: preset.purpose === 'presentation' ? 'presentation' : preset.purpose === 'cover' ? 'cover' : 'page',
      canvas: resolveFormatPlan(format).canvas, title, subtitle: 'Una pieza independiente. Texto y composición editables.' });
  }

  async initialize(): Promise<void> {
    await this.store.transact(state => {
      if (!state.lab) {
        const doc = this.newDocument(state.business_id, 'presentation_16_9');
        state.lab = { workspace: 'presentations', mode: 'execute_change',
          prompt: 'Quiero un avión que encaje a la derecha, conservando el título y el espacio del texto.',
          format: 'presentation_16_9', documents: [doc], active_document_id: doc.document_id };
      }
      state.jobs = recoverImageJobs(state.jobs, this.now());
      return { state, result: null };
    });
  }

  async configure(patch: Partial<Pick<NonNullable<LocalDesignState['lab']>, 'workspace' | 'mode' | 'prompt'>>): Promise<void> {
    await this.store.transact(state => { Object.assign(state.lab!, patch); return { state, result: null }; });
  }
  async setFormat(format: string): Promise<void> {
    if (!FORMATS.includes(format as FormatPresetId)) throw new Error('Formato no disponible en este laboratorio.');
    await this.store.transact(state => {
      if (state.lab!.format !== format) {
        const preset = getFormatPreset(format as FormatPresetId);
        const matches = state.lab!.documents.filter(doc => doc.document_type === preset.purpose
          && doc.canvas.width === preset.canvas!.width && doc.canvas.height === preset.canvas!.height);
        const saved = matches[matches.length - 1];
        const doc = saved ?? this.newDocument(state.business_id, format as FormatPresetId, activeLabDocument(state).title);
        state.lab!.format = format as FormatPresetId;
        if (!saved) state.lab!.documents.push(doc);
        state.lab!.active_document_id = doc.document_id;
      }
      return { state, result: null };
    });
  }

  async createJob(count: 1 | 5): Promise<string> {
    return this.store.transact(state => {
      const lab = state.lab!, doc = activeLabDocument(state), key = `operation-${this.id()}`;
      const size = resolveFormatPlan(lab.format).generation_size!;
      const op: DesignOperation = {
        operation_key: key, action: count === 5 ? 'generate_proposals' : 'generate_image',
        context: { actor_id: ACTOR, business_id: state.business_id, brand_id: 'lab-brand', project_id: 'lab-project',
          session_id: 'lab-session', workspace: lab.workspace, interaction_mode: lab.mode,
          target: { document_id: doc.document_id, document_type: doc.document_type, revision: String(doc.revision),
            ...(doc.document_type === 'presentation' ? { slide_id: 'slide-1' } : {}) },
          instruction: lab.prompt, immutable_elements: [`Título: ${doc.title}`], references: [] },
        image: { profile: 'baseline', quality: 'low', size, output_format: 'png', background: 'transparent',
          output_count: count, executor: 'image_api' },
        ...(count === 5 ? { proposals: directions.map((instruction, index) => ({
          candidate_id: `${key}-candidate-${index + 1}`, instruction, reference_ids: [],
        })) } : {}),
      };
      state.jobs = enqueueImageJob(state.jobs, op, environment(op), Array(count).fill(0), this.now()).ledger;
      return { state, result: key };
    });
  }

  /** Continue only pending calls; received, failed, running and uncertain calls are never sent again. */
  async runJob(operation_key: string, scenario: 'success' | 'partial_failure' | 'interrupted' = 'success'): Promise<void> {
    const initial = await this.store.read();
    const job = initial.jobs.jobs.find(item => item.operation_key === operation_key);
    if (!job) throw new Error('No se encontró el trabajo.');
    if (!job.calls.some(call => call.state === 'pending')) return;
    const op = job.plan.operation;
    const prepared = await prepareImageRequests(op, environment(op), async asset => {
      const version = getAssetVersion(initial.assets, asset);
      return { asset, file: await this.blobs.get(version.storage.storage_key) };
    });
    for (let index = 0; index < job.calls.length; index++) {
      const call = job.calls[index], request = prepared[index];
      const attempt = `attempt-${this.id()}`;
      const claimed = await this.store.transact(state => {
        const current = state.jobs.jobs.find(item => item.operation_key === operation_key)!.calls[index];
        if (current.state !== 'pending') return { state, result: false };
        state.jobs = beginJobCall(state.jobs, operation_key, call.call_key, attempt, this.now(), 5_000);
        return { state, result: true };
      });
      if (!claimed) continue;
      try {
        if (scenario === 'interrupted' || (scenario === 'partial_failure' && index === 2)) {
          const response = scenario === 'interrupted'
            ? normalizeImageTransportFailure({ kind: 'timeout', request_sent: true, duration_ms: 0 })
            : normalizeImageResponse({ status: 429, body: {}, duration_ms: 0, expected_outputs: 1 });
          await this.store.transact(state => {
            state.jobs = recordJobResult(state.jobs, operation_key, call.call_key, attempt, response, [], this.now());
            if (scenario !== 'interrupted') state.jobs = settleJobCallCost(state.jobs, operation_key, call.call_key, 0, 'simulation-zero-cost', this.now());
            return { state, result: null };
          });
          if (scenario === 'interrupted') return;
          continue;
        }
        const image = await this.draw(index, op.image!.size, op.context.instruction);
        const asset: AssetVersion = { business_id: initial.business_id,
          asset_id: job.plan.lineage === 'child_version' ? op.context.base_asset!.asset_id : `asset-${this.id()}`,
          version_id: `version-${this.id()}` };
        const path = `${asset.business_id}/lab/${asset.asset_id}/${asset.version_id}.png`;
        await this.blobs.put(path, image.blob);
        const dataUrl = await imageDataUrl(image.blob);
        const result = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: dataUrl.split(',')[1] }] },
          headers: { 'x-request-id': `lab-${attempt}` }, duration_ms: 0, expected_outputs: 1 });
        await this.store.transact(state => {
          const mediumApproval = state.assets.direction_approvals.find(a => op.context.base_asset
            && equalAsset(a.candidate, op.context.base_asset) && a.candidate.candidate_id === call.planned.candidate_id);
          const version: RegisteredAssetVersion = {
            identity: asset, brand_id: op.context.brand_id, project_id: op.context.project_id,
            storage: { storage_key: path, mime_type: 'image/png', width: image.width, height: image.height, size_bytes: image.blob.size },
            provenance: { kind: 'image_operation', operation_key, output_index: 0, action: op.action as 'generate_image',
              model_id: call.planned.model_id!, quality: op.image!.quality, effective_prompt: request.effective_prompt,
              revised_prompt: null, references: call.planned.reference_ids.map(id => op.context.references.find(r => r.reference_id === id)!),
              immutable_elements: [...op.context.immutable_elements],
              ...(call.planned.candidate_id ? { candidate_id: call.planned.candidate_id } : {}),
              ...(job.plan.lineage === 'child_version' ? { parent: op.context.base_asset } : {}),
              ...(mediumApproval ? { direction_approval_id: mediumApproval.approval_id } : {}) },
          };
          state.assets = registerAssetVersion(state.assets, version);
          state.jobs = recordJobResult(state.jobs, operation_key, call.call_key, attempt, result, [{ index: 0, asset }], this.now());
          state.jobs = beginJobValidation(state.jobs, operation_key, call.call_key, this.now());
          state.jobs = finishJobValidation(state.jobs, operation_key, call.call_key, true, this.now());
          state.jobs = settleJobCallCost(state.jobs, operation_key, call.call_key, 0, 'simulation-zero-cost', this.now());
          state.lab!.selected_version = asset;
          return { state, result: null };
        });
        this.dataUrls.set(path, dataUrl);
      } catch (error) {
        // If local preparation/storage fails after claim, keep evidence and stop. Never redraw on recovery.
        await this.store.transact(state => {
          const current = state.jobs.jobs.find(j => j.operation_key === operation_key)!.calls[index];
          if (current.state === 'running') state.jobs = recordJobResult(state.jobs, operation_key, call.call_key, attempt,
            normalizeImageTransportFailure({ kind: 'network', request_sent: true, duration_ms: 0 }), [], this.now());
          return { state, result: null };
        });
        throw error;
      }
    }
  }

  private findVersion(state: LocalDesignState, id: string): RegisteredAssetVersion {
    const version = state.assets.versions.find(v => v.identity.version_id === id);
    if (!version) throw new Error('No se encontró la versión seleccionada.');
    return version;
  }
  async select(id: string): Promise<void> {
    await this.store.transact(state => { state.lab!.selected_version = this.findVersion(state, id).identity; return { state, result: null }; });
  }
  async approveDirection(id: string): Promise<void> {
    await this.store.transact(state => {
      const version = this.findVersion(state, id), provenance = version.provenance;
      if (provenance.kind !== 'image_operation' || provenance.quality !== 'low') throw new Error('Selecciona un borrador para aprobar la dirección.');
      if (!state.assets.direction_approvals.some(a => equalAsset(a.candidate, version.identity))) {
        state.assets = recordDirectionApproval(state.assets, { approval_id: `direction-${this.id()}`, actor_id: ACTOR,
          candidate: { ...version.identity, candidate_id: provenance.candidate_id ?? `candidate-${version.identity.asset_id}` },
          immutable_elements: [...provenance.immutable_elements] });
      }
      return { state, result: null };
    });
  }
  async createMediumJob(id: string): Promise<string> {
    return this.store.transact(state => {
      const version = this.findVersion(state, id), source = version.provenance;
      const direction = state.assets.direction_approvals.find(a => equalAsset(a.candidate, version.identity));
      if (source.kind !== 'image_operation' || source.quality !== 'low' || !direction) throw new Error('Aprueba primero la dirección del borrador seleccionado.');
      const original = state.jobs.jobs.find(j => j.operation_key === source.operation_key)!;
      const op: DesignOperation = { ...structuredClone(original.plan.operation),
        operation_key: `operation-${this.id()}`, action: 'generate_medium', proposals: undefined,
        selected_candidates: [structuredClone(direction.candidate)], image: { ...original.plan.operation.image!, quality: 'medium', output_count: 1 } };
      op.context.base_asset = version.identity;
      op.context.direction_approval = { candidate: direction.candidate, immutable_elements: [...direction.immutable_elements] };
      op.context.interaction_mode = state.lab!.mode;
      op.context.workspace = state.lab!.workspace;
      state.jobs = enqueueImageJob(state.jobs, op, environment(op), [0], this.now()).ledger;
      return { state, result: op.operation_key };
    });
  }
  async approveResult(id: string): Promise<void> {
    await this.store.transact(state => {
      const version = this.findVersion(state, id);
      if (getAssetReviewStatus(state.assets, version.identity) === 'approved') return { state, result: null };
      const job = state.jobs.jobs.find(j => j.calls.some(c => c.receipt?.outputs.some(o => equalAsset(o.asset, version.identity))))!;
      const call = job.calls.find(c => c.receipt?.outputs.some(o => equalAsset(o.asset, version.identity)))!;
      state.jobs = reviewJobCall(state.jobs, job.operation_key, call.call_key, 'approved', ACTOR, this.now());
      state.assets = reviewAssetVersion(state.assets, { review_id: `review-${this.id()}`, actor_id: ACTOR,
        asset: version.identity, decision: 'approved', reason: 'Resultado de simulación revisado en el laboratorio.' });
      return { state, result: null };
    });
  }

  async mount(id: string, expected: LabCompositionTarget): Promise<void> {
    const target = structuredClone(expected);
    await this.store.transact(state => {
      const doc = activeLabDocument(state), asset = this.findVersion(state, id).identity;
      if (!target || doc.document_id !== target.document_id || doc.revision !== target.revision) {
        throw new Error('La composición cambió. Recupera la sesión y revisa el destino antes de aplicar el cambio.');
      }
      const placement = { placement_id: 'hero', asset, region: { x: doc.canvas.width * .52, y: doc.canvas.height * .16,
        width: doc.canvas.width * .43, height: doc.canvas.height * .68 }, fit: 'contain' as const,
        alt_text: 'Imagen de muestra del laboratorio', z_index: 1 };
      const next = placeLabAsset(doc, target.revision, state.assets, placement);
      state.lab!.documents.push(next);
      state.assets = mountAssetVersion(state.assets, { ...placement, placement_id: `placement-${this.id()}`,
        target: { document_id: next.document_id, document_type: next.document_type, revision: String(next.revision),
          ...(next.document_type === 'presentation' ? { slide_id: 'slide-1' } : {}) }, canvas: doc.canvas });
      return { state, result: null };
    });
  }
  async editComposition(patch: Parameters<LabActions['onCompositionChange']>[0], expected: LabCompositionTarget): Promise<void> {
    const target = structuredClone(expected);
    await this.store.transact(state => {
      const doc = activeLabDocument(state);
      if (!target || doc.document_id !== target.document_id || doc.revision !== target.revision) {
        throw new Error('La composición cambió. Recupera la sesión y revisa el destino antes de aplicar el cambio.');
      }
      const placement = doc.placements[0];
      const region = placement ? { ...placement.region } : null;
      if (region) {
        if (patch.widthPercent !== undefined) {
          if (!Number.isFinite(patch.widthPercent) || patch.widthPercent < 10 || patch.widthPercent > 80) throw new Error('Usa un tamaño entre 10 y 80%.');
          const scale = doc.canvas.width * patch.widthPercent / 100 / region.width;
          region.width *= scale; region.height = Math.min(doc.canvas.height, region.height * scale);
        }
        if (patch.x !== undefined) region.x = doc.canvas.width * patch.x / 100;
        if (patch.y !== undefined) region.y = doc.canvas.height * patch.y / 100;
        region.x = Math.max(0, Math.min(region.x, doc.canvas.width - region.width));
        region.y = Math.max(0, Math.min(region.y, doc.canvas.height - region.height));
      }
      state.lab!.documents.push(editLabComposition(doc, target.revision, {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}),
        ...(region && placement ? { placements: [{ placement_id: placement.placement_id, region }] } : {}),
      }));
      return { state, result: null };
    });
  }
  async cancel(id: string): Promise<void> {
    await this.store.transact(state => { state.jobs = cancelImageJob(state.jobs, id, this.now()); return { state, result: null }; });
  }
  async recover(): Promise<void> { await this.initialize(); }

  async view(): Promise<LabViewModel> {
    const state = await this.store.read(), lab = state.lab!, doc = activeLabDocument(state);
    for (const version of state.assets.versions) if (!this.dataUrls.has(version.storage.storage_key)) {
      this.dataUrls.set(version.storage.storage_key, await imageDataUrl(await this.blobs.get(version.storage.storage_key)));
    }
    const lookup = new Map(state.assets.versions.map(version => [assetKey(version.identity), this.dataUrls.get(version.storage.storage_key)!]));
    const html = renderLabComposition(doc, asset => lookup.get(assetKey(asset))!);
    const placement = doc.placements[0];
    return {
      workspace: lab.workspace, mode: lab.mode, prompt: lab.prompt, format: lab.format,
      formats: FORMATS.map(id => ({ id, label: getFormatPreset(id).label })),
      candidates: state.assets.versions.filter(v => v.provenance.kind === 'image_operation').map((v, index) => {
        const provenance = v.provenance;
        const call = state.jobs.jobs.flatMap(j => j.calls).find(c => c.receipt?.outputs.some(o => equalAsset(o.asset, v.identity)))!;
        return { id: v.identity.version_id, asset: v.identity, title: `Propuesta ${index + 1}`,
          previewUrl: lookup.get(assetKey(v.identity))!, quality: provenance.kind === 'image_operation' ? provenance.quality : 'low',
          directionApproved: state.assets.direction_approvals.some(a => equalAsset(a.candidate, v.identity)),
          resultApproved: getAssetReviewStatus(state.assets, v.identity) === 'approved', jobState: call.state };
      }),
      selectedId: lab.selected_version?.version_id ?? null,
      jobs: state.jobs.jobs.map((job, index) => ({ id: job.operation_key, label: `Trabajo ${index + 1}`,
        states: Object.entries(summarizeImageJob(job)).map(([status, count]) => `${count} ${status}`).join(' · '),
        canCancel: job.calls.some(c => c.state === 'pending' || c.state === 'running'), pending: job.calls.some(c => c.state === 'pending') })),
      composition: { documentId: doc.document_id, html, title: doc.title, subtitle: doc.subtitle, width: doc.canvas.width, height: doc.canvas.height,
        revision: doc.revision, mounted: !!placement, x: placement ? placement.region.x / doc.canvas.width * 100 : 52,
        y: placement ? placement.region.y / doc.canvas.height * 100 : 16,
        widthPercent: placement ? placement.region.width / doc.canvas.width * 100 : 43 },
      actualCalls: 0, simulatedCalls: state.jobs.jobs.flatMap(j => j.calls).filter(c => c.attempt).length,
      busy: false, error: null, notice: null,
    };
  }
  async exportHtml(): Promise<string> { return (await this.view()).composition.html; }
}
