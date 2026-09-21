import { useEffect, useRef, useState } from 'react';
import type { DesignContext, InteractionMode } from '../../../supabase/functions/_shared/desaing/contracts';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { ExplorationPlanner, ExplorationRequest, ExplorationSession, ExplorationScope, IdeaSelection, IdeaSource, ExplorationDesignBrief, DesignUnderstanding, ExplorationResult } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { ServerExplorationCapabilities } from '../../../supabase/functions/_shared/desaing/serverExplorationContract';
import {
  beginExploration, bindIdeaRender, combineTextIdeas, createExplorationSession, discardUnsubmittedExploration, explorationDiscussionHistory, finishExploration,
  ideaRenderInstruction, fullDesignRenderInstruction, markExplorationUncertain, refineTextIdea, selectTextIdea, updateExplorationContext,
  expectedExplorationContext,
} from '../../../supabase/functions/_shared/desaing/exploration';
import { changeInteractionMode } from '../../../supabase/functions/_shared/desaing/session';
import { openExplorationStore, type ExplorationDraft, type ExplorationDraftRecord, type ExplorationStore } from '../desaing/explorationStore';
import { isExplorationAdmissionRefusal, type DesignServerClient } from '../desaing/serverClient';
import { getSlideDimensions, type PresentationSlide } from './presentationDocument';
import { prepareServerCapture, isUnresolvedReferenceCopy, type DesignRegion } from './presentationServerDesign';
import { presentationReferenceScopeSuffix, type PresentationReferenceScope } from '../../../supabase/functions/_shared/desaing/presentationReferenceScope';
import { fullDesignImmutables, fullDesignLocalInstruction } from '../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { designSurfaceTarget, designSurfaceSessionId, designSurfaceWorkspace, designSurfaceBrand, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';

interface Inputs { instruction: string; region: DesignRegion; capture: File | null; referenceScope?: PresentationReferenceScope; approvedCopy?: string; copyMode?: 'literal' | 'none' }
interface Options extends Inputs {
  brand?: ExplorationDesignBrief['brand'];
  brandReady?: boolean;
  prepareReferences?(capabilities: ServerExplorationCapabilities, capture: Blob | null, hash: string): Promise<DesignContext['references']>;
  scope?: ExplorationScope;
  enabled?: boolean;
  destination?: DesignSurfaceDestination;
  productionSource?: RegisteredAssetVersion;
  productionCopyVersion?: string;
  planner?: ExplorationPlanner;
  client: DesignServerClient;
  businessId: string;
  documentId: string;
  slide: PresentationSlide;
  restore(inputs: Inputs): void;
}
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}` : JSON.stringify(value) ?? '';
const withoutMode = (context: DesignContext) => ({ ...context, interaction_mode: 'explore_design' });
interface Lifetime {
  active: boolean;
  actor: string;
  store: ExplorationStore | null;
  current: ExplorationDraftRecord | null;
  work: Promise<unknown>;
  locked: boolean;
  recoveryRequired: boolean;
  source: Options;
  normalized: { file: File; value: Promise<{ blob: Blob; hash: string }> } | null;
  savedInputs: Inputs | null;
  savedSlide: string;
  restoring: Inputs | null;
  visualReferences: ExplorationDraft['visual_references'];
}
const slideKey = (value: Options) => canonical([value.slide.revision, value.slide.html, value.brand]);
const sameInputs = (a: Inputs | null, b: Inputs) => !!a && a.instruction === b.instruction
  && a.capture === b.capture && a.approvedCopy === b.approvedCopy && a.copyMode === b.copyMode && canonical(a.region) === canonical(b.region) && canonical(a.referenceScope) === canonical(b.referenceScope);
const inputsOf = (value: Inputs): Inputs => ({ instruction: value.instruction, region: { ...value.region }, capture: value.capture, referenceScope: value.referenceScope, approvedCopy: value.approvedCopy, copyMode: value.copyMode });
const referenceContextKey = (inputs: Inputs, hash: string) => canonical([inputs.referenceScope, hash]);
async function captureHash(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2, '0')).join('');
}

/** Browser CAS preserves edits and capture bytes; paid planning is admitted only by the server. */
export function usePresentationExploration(options: Options) {
  const latest = useRef(options); latest.current = options;
  const [record, setRecord] = useState<ExplorationDraftRecord | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [capabilities, setCapabilities] = useState<ServerExplorationCapabilities | null>(null);
  const lifetime = useRef<Lifetime | null>(null);
  const active = (life: Lifetime) => life.active && lifetime.current === life;
  function ensureActive(life: Lifetime) { if (!active(life)) throw new Error('exploration_view_closed'); }
  function requireLifetime() {
    const life = lifetime.current;
    if (!life || !active(life)) throw new Error('exploration_store_unavailable');
    return life;
  }
  async function capture(life: Lifetime, input: File | null) {
    if (!input) return { blob: null, hash: 'none', name: null };
    if (life.normalized?.file !== input) {
      life.normalized = { file: input, value: prepareServerCapture(input, 1024)
        .then(async blob => ({ blob, hash: await captureHash(blob) })) };
    }
    return { ...await life.normalized.value, name: input.name };
  }
  function context(life: Lifetime, value: Options, inputs: Inputs, imageHash: string, mode: InteractionMode): DesignContext {
    const canvas = getSlideDimensions(value.slide.html);
    if (value.destination?.workspace === 'onboarding' && (value.scope !== 'full_design' || value.destination.brand_id !== value.businessId)) throw new Error('invalid_onboarding_context');
    return { actor_id: life.actor, business_id: value.businessId, brand_id: designSurfaceBrand(value.destination), project_id: value.documentId,
      session_id: designSurfaceSessionId(value.documentId, value.slide.id, value.scope, value.destination), workspace: designSurfaceWorkspace(value.destination), interaction_mode: mode,
      target: designSurfaceTarget(value.documentId, value.slide, value.destination),
      instruction: (value.scope === 'full_design' ? fullDesignLocalInstruction(inputs.instruction, canvas, inputs.capture ? imageHash : null)
        : `${inputs.instruction.trim()}\n\nAlcance: una pieza independiente para la región ${JSON.stringify(inputs.region)} del lienzo ${canvas.width}×${canvas.height}.\nIdentidad de la captura local: ${imageHash}.`)
        .replace(' La planificación inicial es textual.', '') + presentationReferenceScopeSuffix(inputs.referenceScope)
        + (value.brand ? `\n\nIdentidad de la marca de este proyecto:\n${canonical(value.brand)}` : ''),
      ...(value.destination?.workspace === 'production' ? { copy_version_id: value.productionCopyVersion,
        ...(value.destination.action !== 'regenerate_image' ? { base_asset: value.productionSource?.identity } : {}) } : {}),
      immutable_elements: value.scope === 'full_design' ? (inputs.copyMode === 'none' || inputs.approvedCopy?.trim() && !isUnresolvedReferenceCopy(inputs.approvedCopy) || value.destination?.workspace === 'production')
        ? fullDesignImmutables(inputs.approvedCopy ?? '', canvas, value.destination, inputs.copyMode)
        : ['Pendiente de resolver el texto literal del diseño. Las indicaciones sobre referencias no son texto para imprimir.', `Lienzo completo: ${canvas.width}×${canvas.height}.`]
        : [value.destination ? 'Conservar el texto y la estructura HTML del lienzo.' : 'Conservar el texto y la estructura HTML de la diapositiva.'],
      references: life.visualReferences?.scope_key === referenceContextKey(inputs, imageHash) ? structuredClone(life.visualReferences.references) : [] };
  }
  async function save(life: Lifetime, value: ExplorationDraft, inputs?: Inputs, source = latest.current) {
    ensureActive(life);
    if (!life.store) throw new Error('exploration_store_unavailable');
    try {
      const next = await life.store.write(life.current?.revision ?? 0, value);
      life.current = next;
      if (inputs) { life.savedInputs = inputsOf(inputs); life.savedSlide = slideKey(source); }
      if (active(life)) setRecord(next);
      return next;
    } catch (problem) { life.recoveryRequired = true; throw problem; }
  }
  function serial<T>(life: Lifetime, action: () => Promise<T>): Promise<T> {
    const pending = life.work.then(() => { ensureActive(life); return action(); });
    life.work = pending.catch(() => {}); return pending;
  }
  async function draft(life: Lifetime, source: Options): Promise<ExplorationDraft> {
    const inputs = inputsOf(source), image = await capture(life, inputs.capture), previous = life.current?.value;
    ensureActive(life);
    const mode = previous?.session.context.interaction_mode ?? (source.destination?.workspace === 'onboarding' ? 'explore_design' : 'execute_change');
    const originalBrief = previous?.prepared_idea && inputs.instruction === previous.prepared_idea.instruction
      ? previous.prepared_idea.original_brief : inputs.instruction;
    const nextContext = context(life, source, { ...inputs, instruction: originalBrief }, image.hash, mode);
    return { session: previous ? updateExplorationContext(previous.session, nextContext) : createExplorationSession(nextContext, source.scope ?? 'asset_in_region'),
      capture: image.blob, capture_name: image.name, brief: inputs.instruction, region: { ...inputs.region },
      ...(source.scope === 'full_design' ? { approved_copy: inputs.approvedCopy ?? '' } : {}),
      copy_mode: inputs.copyMode ?? 'literal',
      ...(life.visualReferences ? { visual_references: life.visualReferences } : {}),
      ...(previous?.applied_understanding_key ? { applied_understanding_key: previous.applied_understanding_key } : {}),
      ...(previous?.prepared_idea ? { prepared_idea: previous.prepared_idea } : {}) };
  }
  async function restore(life: Lifetime, value: ExplorationDraft) {
    ensureActive(life);
    const inputs: Inputs = { instruction: value.brief, region: value.region ?? latest.current.region, referenceScope: latest.current.referenceScope,
      approvedCopy: value.approved_copy ?? latest.current.approvedCopy,
      copyMode: value.copy_mode ?? 'literal',
      capture: value.capture ? new File([value.capture], value.capture_name ?? 'captura.png', { type: 'image/png' }) : null };
    // Reuse exactly the persisted PNG bytes: re-encoding a recovered capture can
    // alter its hash and silently invalidate its selected design direction.
    const restoredImage = value.capture ? { blob: value.capture, hash: await captureHash(value.capture) } : null;
    ensureActive(life);
    life.normalized = inputs.capture && restoredImage ? { file: inputs.capture, value: Promise.resolve(restoredImage) } : null;
    life.restoring = inputs;
    life.savedInputs = inputs;
    life.savedSlide = slideKey(latest.current);
    latest.current.restore(inputs);
    return inputs;
  }
  async function perform(action: (life: Lifetime) => Promise<void>, recovering = false) {
    const life = lifetime.current;
    if (!life || !active(life) || life.locked) return;
    if (life.recoveryRequired && !recovering) {
      setError('Recupera la exploración guardada antes de continuar.'); return;
    }
    life.locked = true; setBusy(true); setError('');
    try { await action(life); }
    catch (problem) {
      const code = problem && typeof problem === 'object' && 'code' in problem ? String(problem.code)
        : problem instanceof Error ? problem.message : '';
      if (active(life)) setError(code === 'exploration_revision_conflict'
        ? 'La exploración cambió en otra pestaña. Recupera la versión guardada antes de continuar.'
        : ['exploration_unresolved', 'exploration_previous_unresolved'].includes(code) ? 'La solicitud anterior sigue pendiente. Recupera su resultado antes de pedir otras ideas.'
        : code === 'exploration_quota_exceeded' ? 'No queda presupuesto disponible para otra conversación de diseño. Puedes trabajar con las ideas guardadas.'
        : code === 'exploration_unavailable' ? 'La conversación de diseño está pausada. Puedes consultar y ajustar las ideas guardadas.'
        : code === 'brand_context_unavailable' ? 'Carga la identidad de este negocio antes de continuar.'
        : code === 'exploration_visual_context_unavailable' ? 'El servidor todavía no tiene activa la lectura de imágenes en la conversación. Falta desplegar desaing-server actualizado.'
        : ['exploration_reference_unavailable', 'exploration_reference_invalid'].includes(code) ? 'No se pudo leer una referencia guardada. Vuelve a añadir esa imagen; no se envió una conversación nueva.'
        : code === 'exploration_reference_limit' ? 'Esta conversación admite hasta cuatro imágenes. Quita una referencia antes de continuar.'
        : code === 'server_session_changed' ? 'La sesión cambió. Cierra y vuelve a abrir este panel para continuar.'
        : 'No se completó esta acción. Conservamos la exploración; recupera su estado antes de repetirla.');
    } finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  async function refreshCapabilities(life: Lifetime) {
    if (!life.source.planner?.capabilities) return;
    const next = await life.source.planner.capabilities(); ensureActive(life);
    setCapabilities(next);
  }
  async function mergeHistory(life: Lifetime) {
    const planner = life.source.planner, saved = life.current;
    if (!planner?.history || !saved) return;
    const attempts = await planner.history(saved.value.session.context.session_id); ensureActive(life);
    let session = saved.value.session;
    const originalContext = session.context, originalSelection = session.selected;
    for (const attempt of attempts) {
      const local = session.attempts.find(item => item.request.request_key === attempt.request.request_key);
      if (local && canonical(local.request) !== canonical(attempt.request)) throw new Error('exploration_request_key_conflict');
      if (!local) {
        session = updateExplorationContext(session, attempt.request.context);
        session = beginExploration(session, attempt.request);
      }
      if (attempt.status === 'completed' && attempt.result) {
        if (!local || local.status !== 'completed') session = finishExploration(session, attempt.result);
        else if (canonical(local.result) !== canonical(attempt.result)) throw new Error('exploration_result_conflict');
      } else if (!local) session = markExplorationUncertain(session, attempt.request.request_key);
    }
    if (session !== saved.value.session) {
      session = updateExplorationContext(session, originalContext);
      if (originalSelection) session = selectTextIdea(session, originalSelection);
      await save(life, { ...saved.value, session });
    }
  }
  async function load(life: Lifetime) {
    if (!life.store) {
      const source = life.source;
      life.actor = (await source.client.session()).actorId;
      ensureActive(life);
      const opened = await openExplorationStore({ actor_id: life.actor, business_id: source.businessId,
        session_id: designSurfaceSessionId(source.documentId, source.slide.id, source.scope, source.destination) });
      if (!active(life)) { opened.close(); throw new Error('exploration_view_closed'); }
      life.store = opened;
    }
    const saved = await life.store.read(); ensureActive(life);
    life.current = saved;
    life.visualReferences = saved?.value.visual_references;
    if (saved && latest.current.destination?.workspace === 'onboarding'
      && saved.value.session.context.target.revision !== String(latest.current.slide.revision)) {
      const source = latest.current, next = await draft(life, source);
      delete next.prepared_idea;
      await save(life, next, source, source);
    } else if (saved) { await restore(life, saved.value); setRecord(saved); }
    else { const source = latest.current; await save(life, await draft(life, source), source, source); }
    await mergeHistory(life);
    const latestResult = [...(life.current?.value.session.attempts ?? [])].reverse().find(attempt => attempt.status === 'completed')?.result;
    if (latestResult) await applyUnderstanding(life, latestResult);
    await refreshCapabilities(life);
    life.recoveryRequired = false;
  }
  useEffect(() => {
    setRecord(null); setBusy(false); setError(''); setCapabilities(null);
    if (options.enabled === false) { lifetime.current = null; return; }
    const life: Lifetime = { active: true, actor: '', store: null, current: null, work: Promise.resolve(), locked: false,
      recoveryRequired: false, source: options, normalized: null, savedInputs: null, savedSlide: '', restoring: null, visualReferences: undefined };
    lifetime.current = life;
    void serial(life, () => load(life)).catch(() => {
      life.recoveryRequired = true;
      if (active(life)) setError('No se pudo recuperar toda la exploración. Conservamos la copia de este navegador; recupera su estado antes de continuar.');
    });
    return () => {
      life.active = false;
      // This cleanup owns only this lifetime's connection. StrictMode can start
      // a new lifetime while the old asynchronous open/write is still settling.
      void life.work.finally(() => { life.store?.close(); life.store = null; });
    };
  }, [options.planner, options.client, options.businessId, options.documentId, options.slide.id, options.scope, options.enabled,
    options.destination?.document_type, options.destination?.page_id, options.destination?.brand_id, options.destination?.workspace, options.destination?.brief_hash,
    options.destination?.workspace === 'production' ? options.destination.action : undefined, options.productionCopyVersion, options.productionSource?.identity.version_id]);

  useEffect(() => {
    if (options.enabled === false || !record || busy) return;
    const life = lifetime.current;
    if (!life || !active(life) || !life.current || life.recoveryRequired) return;
    const source = options, inputs = inputsOf(source);
    // Ignore inputs from the render preceding the parent's restore update.
    if (life.restoring) {
      if (!sameInputs(life.restoring, inputs)) return;
      life.restoring = null;
    }
    if (sameInputs(life.savedInputs, inputs) && life.savedSlide === slideKey(source)) return;
    const timer = setTimeout(() => { void serial(life, async () => {
      if (life.locked || life.recoveryRequired) return;
      await save(life, await draft(life, source), inputs, source);
    }).catch(() => { if (active(life)) {
      life.recoveryRequired = true;
      setError('No se pudo guardar el cambio. Recupera la exploración antes de continuar.');
    } }); }, 250);
    return () => clearTimeout(timer);
  }, [options.planner, options.enabled, options.instruction, options.capture, options.region.x, options.region.y, options.region.width,
    options.region.height, options.slide.revision, options.slide.html, options.approvedCopy, options.copyMode, canonical(options.brand), canonical(options.referenceScope), record, busy]);

  async function mode(next: InteractionMode) { await perform(life => serial(life, async () => {
    const source = latest.current, value = await draft(life, source);
    value.session = updateExplorationContext(value.session, changeInteractionMode(value.session.context, next));
    await save(life, value, source, source);
  })); }
  async function editInputs(inputs: Partial<Inputs>) {
    const life = requireLifetime();
    if (life.recoveryRequired || life.locked) throw new Error('exploration_recovery_required');
    return serial(life, async () => {
      const source = { ...latest.current, ...inputs }, value = await draft(life, source);
      delete value.prepared_idea;
      await save(life, value);
      return restore(life, value);
    });
  }
  async function applyUnderstanding(life: Lifetime, result: ExplorationResult) {
    const current = life.current!.value, attempt = current.session.attempts.find(item => item.request.request_key === result.request_key);
    const understood = result.design_understanding;
    if (!understood || !attempt || current.applied_understanding_key === result.request_key) return;
    if (attempt.request.kind === 'directions') {
      const expected = expectedExplorationContext(attempt.request, result);
      if (canonical(expected) === canonical(attempt.request.context) || canonical(withoutMode(current.session.context)) !== canonical(withoutMode(expected))) return;
      const next = { ...current, approved_copy: understood.copy.text, copy_mode: 'literal' as const, applied_understanding_key: result.request_key };
      await save(life, next); await restore(life, next); return;
    }
    // A recovered answer must not overwrite a brief edited after that request.
    if (canonical(withoutMode(current.session.context)) !== canonical(withoutMode(attempt.request.context))) return;
    const source = latest.current;
    const inputs: Inputs = { ...inputsOf(source), instruction: [understood.resolved_instruction,
      ...understood.references.map(ref => `Referencia ${ref.reference_id}: ${ref.instruction}`),
      ...understood.preserve.map(item => `Conservar: ${item}`)].join('\n'),
      ...(source.scope === 'full_design' && !['production', 'onboarding'].includes(source.destination?.workspace ?? '') ? { approvedCopy: understood.copy.status === 'literal' ? understood.copy.text : '',
        copyMode: understood.copy.status === 'none' ? 'none' : 'literal' } : {}) };
    const image = await capture(life, inputs.capture);
    const next = { ...current, brief: inputs.instruction, approved_copy: inputs.approvedCopy, copy_mode: inputs.copyMode,
      applied_understanding_key: result.request_key, prepared_idea: undefined,
      session: updateExplorationContext(current.session, context(life, source, inputs, image.hash, current.session.context.interaction_mode)) };
    await save(life, next); await restore(life, next);
  }
  async function plan(kind: ExplorationRequest['kind'], message: string, selection?: IdeaSelection) { await perform(async life => {
    let request!: ExplorationRequest;
    let completed = false;
    let preparedBefore: ExplorationDraft['prepared_idea'];
    const planner = life.source.planner!;
    let available = capabilities;
    if (latest.current.brandReady === false) throw new Error('brand_context_unavailable');
    if (planner.capabilities) {
      available = await planner.capabilities(); ensureActive(life); setCapabilities(available);
      if (!available || available.remaining_attempts < 1) throw new Error(available ? 'exploration_quota_exceeded' : 'exploration_unavailable');
    }
    await serial(life, async () => {
      const source = latest.current;
      if (!message.trim()) throw new Error('brief_required');
      const visual = available?.supports_visual_context === true;
      if (!visual && (source.capture || source.referenceScope?.references.length)) throw new Error('exploration_visual_context_unavailable');
      if (visual && source.prepareReferences) {
        const image = await capture(life, source.capture);
        const references = await source.prepareReferences(available!, image.blob, image.hash);
        ensureActive(life);
        if (!sameInputs(inputsOf(source), latest.current) || slideKey(source) !== slideKey(latest.current)) throw new Error('exploration_context_changed');
        life.visualReferences = { scope_key: referenceContextKey(source, image.hash), references };
      }
      const value = await draft(life, source), nextContext = value.session.context;
      if (value.session.attempts.some(attempt => attempt.status !== 'completed')) throw new Error('exploration_unresolved');
      // Reuse an existing unchanged set; a reload/double click never buys another plan.
      if (kind === 'directions' && value.session.sets.some(set => canonical(withoutMode(set.context)) === canonical(withoutMode(nextContext)))) {
        await save(life, value, source, source); return;
      }
      const prior = [...value.session.attempts].reverse().find(attempt => attempt.result?.design_understanding)?.result?.design_understanding;
      const referenceIds = new Set(nextContext.references.map(ref => ref.reference_id));
      const previous: DesignUnderstanding | undefined = prior ? { ...prior,
        copy: { ...prior.copy, source_reference_ids: prior.copy.source_reference_ids.filter(id => referenceIds.has(id)) },
        references: prior.references.filter(ref => referenceIds.has(ref.reference_id)) } : undefined;
      const chosen = selection ?? value.session.selected;
      const selectedIdea = chosen && value.session.sets.find(set => set.set_id === chosen.set_id)?.ideas.find(idea => idea.idea_id === chosen.idea_id && idea.version === chosen.version);
      const literal = !!source.approvedCopy?.trim() && !isUnresolvedReferenceCopy(source.approvedCopy);
      const designBrief: ExplorationDesignBrief = { copy: { status: source.copyMode === 'none' ? 'none' : literal ? 'literal' : 'pending',
        text: literal ? source.approvedCopy! : '', source_reference_ids: literal && previous && previous.copy.text === source.approvedCopy ? previous.copy.source_reference_ids : [] },
        brand: source.brand ?? null, selected_instruction: selectedIdea?.render_instruction ?? '', preserve: previous?.preserve ?? [],
        ...(previous ? { previous_understanding: previous } : {}) };
      request = { request_key: crypto.randomUUID(), kind, scope: source.scope ?? 'asset_in_region', context: nextContext,
        ...(visual ? { design_brief: designBrief } : {}),
        message, history: kind === 'discussion' ? visual
          ? [...value.session.messages.slice(-12).map(({ role, text }) => ({ role, text: text.slice(0, 1800) })),
            ...explorationDiscussionHistory(value.session).filter(item => item.text.startsWith('{"kind":"saved_text_'))]
          : explorationDiscussionHistory(value.session)
          : value.session.messages.slice(-8).map(({ role, text }) => ({ role, text })) };
      while (request.history.length && new TextEncoder().encode(JSON.stringify(request)).length > 65536) request.history.shift();
      preparedBefore = value.prepared_idea;
      value.session = beginExploration(value.session, request);
      if (kind === 'directions') delete value.prepared_idea;
      await save(life, value, source, source);
    });
    if (!request) return;
    try {
      ensureActive(life);
      const result = await planner.plan(request);
      await serial(life, async () => {
        await save(life, { ...life.current!.value, session: finishExploration(life.current!.value.session, result) });
        completed = true;
        await applyUnderstanding(life, result);
      });
    } catch (problem) {
      if (!completed && active(life) && !life.recoveryRequired) await serial(life, async () => {
        const refused = isExplorationAdmissionRefusal(problem), current = life.current!.value;
        await save(life, { ...current,
          ...(refused ? { prepared_idea: preparedBefore } : {}),
          session: refused ? discardUnsubmittedExploration(current.session, request.request_key)
            : markExplorationUncertain(current.session, request.request_key) });
      });
      throw problem;
    } finally { await refreshCapabilities(life).catch(() => { if (active(life)) setCapabilities(null); }); }
  }); }
  async function mutate(change: (value: ExplorationDraft) => ExplorationDraft) {
    await perform(life => serial(life, async () => {
      const source = latest.current, before = await draft(life, source), value = change(before);
      const resetPreparedBrief = before.prepared_idea && !value.prepared_idea
        && before.brief === before.prepared_idea.instruction;
      // Refining/combining a prepared idea returns to its original brief. Keeping
      // the old render instruction here would change the next context identity.
      if (resetPreparedBrief) value.brief = before.prepared_idea!.original_brief;
      await save(life, value, resetPreparedBrief ? undefined : source, source);
      if (resetPreparedBrief) await restore(life, value);
    }));
  }
  async function useIdea(selection: IdeaSelection) { await perform(life => serial(life, async () => {
    const source = latest.current, value = await draft(life, source), image = await capture(life, source.capture);
    const originalBrief = value.prepared_idea && value.brief === value.prepared_idea.instruction
      ? value.prepared_idea.original_brief : value.brief;
    const sourceContext = context(life, source, { ...source, instruction: originalBrief }, image.hash, value.session.context.interaction_mode);
    const instruction = (source.scope === 'full_design' ? fullDesignRenderInstruction : ideaRenderInstruction)(value.session, selection, sourceContext)
      .replace(`Encargo: ${sourceContext.instruction}`, `Encargo: ${originalBrief.trim()}`);
    value.session = selectTextIdea(value.session, selection);
    value.prepared_idea = { selection, instruction, original_brief: originalBrief, context: sourceContext };
    value.brief = instruction; await save(life, value); await restore(life, value);
  })); }
  async function bindRender(operationKey: string) {
    const life = requireLifetime();
    if (life.recoveryRequired) throw new Error('exploration_recovery_required');
    return await serial(life, async () => {
      const source = latest.current, value = await draft(life, source), prepared = value.prepared_idea;
      if (!prepared || value.brief !== prepared.instruction) return operationKey;
      const image = await capture(life, source.capture);
      const now = context(life, source, { ...source, instruction: prepared.original_brief }, image.hash, value.session.context.interaction_mode);
      if (canonical(withoutMode(now)) !== canonical(withoutMode(prepared.context))) throw new Error('exploration_context_changed');
      const previous = value.session.render_bindings.find(binding => canonical(binding.selection) === canonical(prepared.selection));
      const boundKey = previous?.operation_key ?? operationKey;
      value.session = bindIdeaRender(value.session, prepared.selection, boundKey);
      await save(life, value, source, source);
      return boundKey;
    });
  }
  /** Freeze the current brief, capture identity and placement before visual admission. */
  async function prepareVisualSession(): Promise<ExplorationSession> {
    const life = requireLifetime();
    if (life.recoveryRequired) throw new Error('exploration_recovery_required');
    return serial(life, async () => {
      const source = latest.current, value = await draft(life, source);
      if (!life.current || canonical(value) !== canonical(life.current.value)) await save(life, value, source, source);
      return structuredClone(value.session);
    });
  }
  async function bindVisualRender(selection: IdeaSelection, operationKey: string): Promise<void> {
    const life = requireLifetime();
    if (life.recoveryRequired) throw new Error('exploration_recovery_required');
    await serial(life, async () => {
      const source = latest.current, value = await draft(life, source);
      // The same binding is shared by the individual and gallery entry points.
      value.session = bindIdeaRender(value.session, selection, operationKey);
      await save(life, value, source, source);
    });
  }
  async function recover() { await perform(life => serial(life, async () => {
    try {
      await load(life);
      const saved = life.current!;
      let session = saved.value.session;
      for (const attempt of session.attempts.filter(item => item.status !== 'completed')) {
        const result = await life.source.planner?.recover?.(attempt.request.request_key, attempt.request); ensureActive(life);
        if (result) session = finishExploration(session, result);
      }
      if (session !== saved.value.session) await save(life, { ...saved.value, session });
      const latestResult = [...session.attempts].reverse().find(attempt => attempt.status === 'completed')?.result;
      if (latestResult) await applyUnderstanding(life, latestResult);
      if (session.attempts.some(attempt => attempt.status !== 'completed')) throw new Error('exploration_unresolved');
      life.recoveryRequired = false;
    } catch (problem) { life.recoveryRequired = true; throw problem; }
  }), true); }

  const visible = record && options.enabled !== false && record.value.session.context.business_id === options.businessId
    && record.value.session.scope === (options.scope ?? 'asset_in_region')
    && record.value.session.context.target.document_id === options.documentId
    && record.value.session.context.session_id === designSurfaceSessionId(options.documentId, options.slide.id, options.scope, options.destination) ? record : null;
  return { session: visible?.value.session ?? null, mode: visible?.value.session.context.interaction_mode ?? 'execute_change',
    canPlan: options.brandReady !== false && !!options.planner && (!options.planner.capabilities || !!capabilities && capabilities.remaining_attempts > 0), capabilities,
    understanding: [...(visible?.value.session.attempts ?? [])].reverse().find(attempt => attempt.result?.design_understanding)?.result?.design_understanding ?? null,
    ready: !!visible, busy, error, setMode: mode, planFive: () => plan('directions', 'Propón cinco ideas de diseño distintas para este encargo.'),
    discuss: (message: string) => plan('discussion', message), recover, useIdea, editInputs, bindRender, prepareVisualSession, bindVisualRender,
    preparedSelection: visible?.value.prepared_idea && options.instruction === visible.value.prepared_idea.instruction
      ? visible.value.prepared_idea.selection : null,
    select: (selection: IdeaSelection) => mutate(value => ({ ...value, session: selectTextIdea(value.session, selection) })),
    refine: (selection: IdeaSelection, feedback: string) => capabilities?.supports_visual_context
      ? plan('discussion', feedback, selection) : mutate(value => ({ ...value, prepared_idea: undefined,
        session: refineTextIdea(value.session, selection, feedback) })),
    combine: (sources: IdeaSource[]) => mutate(value => ({ ...value, prepared_idea: undefined,
      session: combineTextIdeas(value.session, sources, crypto.randomUUID()) })),
  };
}
