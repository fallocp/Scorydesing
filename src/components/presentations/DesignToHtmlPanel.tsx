import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { X, Layers, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { getAssetReviewStatus } from '../../../supabase/functions/_shared/desaing/assets';
import { COMPOSITION_LIMITS, htmlCompositionSessionId, makeApprovedCompositionCopy, makeTextlessCompositionCopy, verifyHtmlCompositionRequest, type HtmlCompositionRequest } from '../../../supabase/functions/_shared/desaing/composition';
import type { PresentationDesignService } from './PresentationDesignContext';
import { designSurfaceTarget, designSurfaceWorkspace, designSurfaceBrand, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import { getSlideDimensions, reviseSlide, type PresentationSlide } from '@/lib/presentations/presentationDocument';
import { prepareServerCapture } from '@/lib/presentations/presentationServerDesign';
import { imageDataUrl } from '@/lib/desaing/labImages';
import { DesignServerClientError } from '@/lib/desaing/serverClient';
import type { HtmlCapabilities } from '@/lib/desaing/htmlClient';
import { openCompositionStore, emptyCompositionDraft, type CompositionDraft, type CompositionRecord, type CompositionSource, type SavedCompositionBinding } from '@/lib/presentations/compositionStore';
import { renderHtmlComposition, type CompositionBindings } from '@/lib/presentations/presentationComposition';
import { extractPresentationAsset, importPresentationAsset, listPresentationAssets, readPresentationAsset, type PresentationLibraryAsset } from '@/lib/presentations/presentationAssets';
import { ManualExtractionEditor } from './ManualExtractionEditor';
import { DesignLogoPicker, type DesignLogoSelection } from './DesignLogoPicker';
import { insertDesignLogo } from '@/lib/presentations/designLogo';
import { VisualDesignEditor } from '@/components/VisualDesignEditor';
import { sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';
import { reconcileMountedAssets } from '@/lib/presentations/presentationManifest';
import { extractRegisteredPresentationAsset } from '@/lib/presentations/reusablePresentationAssets';
import type { AssetVersion, DesignTarget } from '../../../supabase/functions/_shared/desaing/contracts';
import type { PresentationMountedAsset } from '@/lib/presentations/presentationDocument';
import './MountedImagesPanel.css';
import './DesignToHtmlPanel.css';

export interface DesignToHtmlPanelProps {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  initialAsset?: RegisteredAssetVersion; initialCopy?: string; initialCopyMode?: 'approved_text' | 'no_text'; initialInstruction?: string;
  embedded?: boolean; externalConversation?: boolean; controllerRef?: Ref<DesignToHtmlController>;
  /** Separate draft and server recovery history for this conversation generation. */
  conversationSessionId?: string;
  onProposal?(proposal: DesignToHtmlProposal, reason: 'generated' | 'edited' | 'recovered'): void; onState?(state: DesignToHtmlState): void;
  destination?: DesignSurfaceDestination;
  onApply(slide: PresentationSlide): void | Promise<void>; onClose(): void;
}
export interface DesignToHtmlContext {
  asset?: RegisteredAssetVersion; copy?: string; copyMode?: 'approved_text' | 'no_text'; instruction?: string;
  /** Explicitly prepares a new draft after a completed conversion, never after an uncertain request. */
  replaceCompleted?: boolean;
}
export interface DesignToHtmlProposal {
  html: string; mountedAssets: PresentationMountedAsset[]; target: DesignTarget; canvas: { width: number; height: number };
  source: AssetVersion; copyVersion: string; requestKey: string; unresolvedSlots: string[];
}
export interface DesignToHtmlState {
  ready: boolean; busy: boolean; error: string; status: CompositionDraft['status']; canApply: boolean; requestKey?: string;
  context: { asset?: RegisteredAssetVersion; copy: string; copyMode: 'approved_text' | 'no_text'; instruction: string };
  proposal: DesignToHtmlProposal | null;
}
export interface DesignToHtmlController {
  updateContext(input: DesignToHtmlContext): Promise<void>;
  create(input: DesignToHtmlContext & { approved: true }): Promise<DesignToHtmlProposal>;
  recover(): Promise<DesignToHtmlProposal | null>;
  openEditor(): Promise<void>;
  openLogos(): Promise<void>;
  apply(): Promise<void>;
}
type Life = { active: boolean; store: Awaited<ReturnType<typeof openCompositionStore>> | null; record: CompositionRecord | null; work: Promise<unknown>; locked: boolean; actor: string; blocked: boolean };
const code = (problem: unknown) => problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : problem instanceof Error ? problem.message : '';
const messages: Record<string, string> = {
  composition_revision_conflict: 'Otra pestaña cambió esta composición. Cierra y vuelve a abrir para recuperar sus cambios.',
  composition_reference_changed: 'Hay una conversión guardada con otra referencia. Recupera ese trabajo antes de cambiarla.',
  server_session_changed: 'Cambió tu sesión. Abre este panel nuevamente.',
  server_html_outcome_unknown: 'La conversión está pendiente de confirmar. Recupera su resultado; no se enviará otra solicitud.',
  server_response_unknown: 'No se confirmó la respuesta. Recupera la composición guardada antes de volver a generar.',
  html_quota_exceeded: 'No queda presupuesto para otra conversión. Puedes revisar y montar las composiciones guardadas.',
  html_previous_unresolved: 'Hay una solicitud pendiente de confirmar. Recupera su resultado antes de continuar.',
  slide_revision_conflict: 'Cambió la diapositiva. El resultado queda guardado para que puedas revisarlo.',
  html_source_not_approved: 'Revisa y aprueba esta versión del diseño antes de convertirla.',
  composition_copy_count: 'Usa entre una y 64 líneas de contenido aprobado, o elige Sin texto.',
  composition_upgrade_required: 'Actualiza desaing-server para convertir diseños sin texto o con más de 12 bloques.',
  composition_piece_not_approved: 'Una de las piezas dejó de estar aprobada. Elige otra antes de aplicar.',
};
const initialText = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('h1,h2,h3,p,li')).map(node => node.textContent?.trim()).filter(Boolean).join('\n');
};
export function DesignToHtmlPanel(props: DesignToHtmlPanelProps) {
  return <DesignToHtmlWorkspace key={JSON.stringify([props.businessId, props.documentId, props.slide.id, props.conversationSessionId])} {...props} />;
}
function DesignToHtmlWorkspace(props: DesignToHtmlPanelProps) {
  const { service, businessId, documentId, slide, initialAsset, initialCopy, initialCopyMode = 'approved_text', initialInstruction, onApply, onClose, destination, embedded, externalConversation } = props;
  const latest = useRef(props); latest.current = props;
  const client = service.client, api = useMemo(() => client.html?.(businessId), [client, businessId]);
  const canvas = useMemo(() => getSlideDimensions(slide.html), [slide.html]);
  const target = useMemo(() => designSurfaceTarget(documentId, slide, destination), [documentId, slide.id, slide.revision, destination?.document_type, destination?.page_id]);
  const sessionId = htmlCompositionSessionId(target, props.conversationSessionId);
  const [draft, setDraft] = useState<CompositionDraft>(emptyCompositionDraft), [copyText, setCopyText] = useState(initialCopy ?? initialText(slide.html));
  const [approved, setApproved] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [capabilities, setCapabilities] = useState<HtmlCapabilities | null>(null), [sourceUrl, setSourceUrl] = useState('');
  const [library, setLibrary] = useState<PresentationLibraryAsset[]>([]), [serverAssets, setServerAssets] = useState<RegisteredAssetVersion[]>([]);
  const [bindings, setBindings] = useState<CompositionBindings>({}), [cropping, setCropping] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [logosOpen, setLogosOpen] = useState(false);
  const lifeRef = useRef<Life | null>(null), frame = useRef<HTMLIFrameElement>(null);
  const sourceLocal = useRef<PresentationLibraryAsset | null>(null);
  const proposalReason = useRef<'generated' | 'edited' | 'recovered'>('recovered');
  const active = (life: Life) => life.active && lifeRef.current === life;
  function ensure(life: Life) { if (!active(life)) throw new Error('composition_view_closed'); if (life.blocked) throw new Error('composition_revision_conflict'); }
  function save(life: Life, change: (value: CompositionDraft) => CompositionDraft) {
    const task = life.work.then(async () => {
      ensure(life); if (!life.store) throw new Error('composition_store_unavailable');
      const value = change(structuredClone(life.record?.value ?? emptyCompositionDraft()));
      try { const next = await life.store.write(life.record?.revision ?? 0, value); life.record = next;
        if (active(life)) setDraft(next.value); return next.value;
      } catch (problem) { if (code(problem) === 'composition_revision_conflict') life.blocked = true; throw problem; }
    });
    life.work = task.catch(() => {}); return task;
  }
  async function run<T>(action: (life: Life) => Promise<T>, propagate = false): Promise<T | undefined> {
    const life = lifeRef.current; if (!life || !active(life) || life.locked) {
      if (propagate) throw Error('La composición está ocupada o todavía se está recuperando.'); return;
    }
    life.locked = true; setBusy(true); setError('');
    try { await life.work; ensure(life); return await action(life); }
    catch (problem) { if (active(life)) setError(destination && code(problem) === 'slide_revision_conflict'
      ? 'Cambió el lienzo. El resultado queda guardado para que puedas revisarlo.' : messages[code(problem)] ?? 'No se pudo completar la acción. La referencia y la composición guardadas se conservan.'); if (propagate) throw problem; }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  const close = () => {
    const life = lifeRef.current;
    if (!life || !active(life) || life.blocked || !life.record) { onClose(); return; }
    void run(async current => {
      if (!current.record!.value.request && current.record!.value.copy_text !== copyText) await save(current, value => ({ ...value, copy_text: copyText }));
      ensure(current); onClose();
    });
  };
  const sameAsset = (a: RegisteredAssetVersion['identity'] | undefined, b: RegisteredAssetVersion['identity']) =>
    a?.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;
  useEffect(() => {
    const life: Life = { active: true, store: null, record: null, work: Promise.resolve(), locked: true, actor: '', blocked: false };
    lifeRef.current = life; setReady(false); setBusy(true); setEditing(false); setLogosOpen(false); sourceLocal.current = null;
    const task = (async () => {
      if (!api) throw new Error('html_unavailable');
      life.actor = (await client.session()).actorId;
      const store = await openCompositionStore({ actor: life.actor, business: businessId, session: sessionId });
      if (!active(life)) { store.close(); return; } life.store = store;
      life.record = await store.read(); ensure(life);
      if (!life.record) {
        let source: CompositionSource | null = null;
        if (initialAsset) { const blob = await client.asset(initialAsset.identity); ensure(life);
          source = { blob, version: initialAsset, name: 'Diseño aprobado.png', upload_id: crypto.randomUUID() }; }
        const value = { ...emptyCompositionDraft(), copy_text: initialCopyMode === 'no_text' ? '' : initialCopy ?? initialText(slide.html), copy_mode: initialCopyMode, instruction: initialInstruction ?? '', source };
        life.record = await store.write(0, value);
      } else if (initialAsset && !sameAsset(life.record.value.source?.version?.identity, initialAsset.identity)) {
        if (['saved', 'submitting', 'uncertain'].includes(life.record.value.status)) throw new Error('composition_reference_changed');
        const blob = await client.asset(initialAsset.identity); ensure(life);
        life.record = await store.write(life.record.revision, { ...emptyCompositionDraft(), copy_text: initialCopyMode === 'no_text' ? '' : initialCopy ?? initialText(slide.html), copy_mode: initialCopyMode, instruction: initialInstruction ?? '',
          source: { blob, version: initialAsset, name: 'Diseño aprobado.png', upload_id: crypto.randomUUID() } });
      }
      ensure(life); setDraft(life.record.value); setCopyText(life.record.value.copy_text); setApproved(!!life.record.value.request);
      const [caps, local, remote] = await Promise.all([api.capabilities(), listPresentationAssets(businessId), client.read(businessId)]);
      ensure(life); setCapabilities(caps); setLibrary(local); setServerAssets(remote.state.assets.versions.filter(asset =>
        asset.provenance.kind === 'image_operation' && getAssetReviewStatus(remote.state.assets, asset.identity) === 'approved'));
      setReady(true);
    })().catch(problem => { if (active(life)) setError(messages[code(problem)] ?? 'No se pudo abrir esta composición. Cierra y vuelve a abrir para recuperar tu trabajo.'); })
      .finally(() => { life.locked = false; if (active(life)) setBusy(false); });
    life.work = task;
    return () => { life.active = false; void life.work.finally(() => life.store?.close()); };
  }, [api, businessId, documentId, slide.id, sessionId, destination?.brand_id]);
  useEffect(() => {
    if (!ready || busy || draft.request || draft.copy_text === copyText) return;
    const life = lifeRef.current!;
    const timer = setTimeout(() => { void save(life, value => value.request ? value : { ...value, copy_text: copyText })
      .catch(problem => { if (active(life)) setError(messages[code(problem)] ?? 'No se pudo guardar el texto.'); }); }, 250);
    return () => clearTimeout(timer);
  }, [copyText, ready, busy, draft.request, draft.copy_text]);
  useEffect(() => {
    let current = true; setSourceUrl(''); sourceLocal.current = null;
    if (draft.source) void imageDataUrl(draft.source.blob).then(url => { if (current) setSourceUrl(url); });
    return () => { current = false; };
  }, [draft.source?.upload_id]);
  useEffect(() => {
    const life = lifeRef.current; if (!life || !ready || !draft.result) { setBindings({}); return; }
    let current = true; setBindings({});
    void (async () => {
      const resolved: CompositionBindings = {};
      for (const [slot, binding] of Object.entries(draft.bindings)) {
        if ('omitted' in binding) resolved[slot] = { omitted: true };
        else {
          const local = binding.origin === 'local' ? library.find(item => item.version.identity.asset_id === binding.asset.asset_id && item.version.identity.version_id === binding.asset.version_id) : null;
          const blob = binding.origin === 'local' ? local ? await readPresentationAsset(businessId, local.version) : null : await client.asset(binding.asset);
          if (!blob) throw new Error('asset_not_found');
          resolved[slot] = { asset: binding.asset, dataUrl: await imageDataUrl(blob), altText: binding.altText };
        }
      }
      if (current && active(life)) {
        setBindings(resolved);
        setError(message => message === 'Una pieza no está disponible. Vuelve a elegirla antes de aplicar el HTML.' ? '' : message);
      }
    })().catch(() => { if (current && active(life)) setError('Una pieza no está disponible. Vuelve a elegirla antes de aplicar el HTML.'); });
    return () => { current = false; };
  }, [draft.result, draft.bindings, library, businessId, client, ready]);
  const rendered = useMemo(() => {
    if (!draft.request || !draft.result) return null;
    try { return renderHtmlComposition(draft.request, draft.result, bindings, { allowUnresolved: true }); } catch { return null; }
  }, [draft.request, draft.result, bindings]);
  const displayedHtml = useMemo(() => draft.edit ? sanitizePresentationHtml(draft.edit.html) : rendered?.html, [draft.edit, rendered]);
  useEffect(() => {
    const element = frame.current?.parentElement; if (!element) return;
    const resize = () => { if (frame.current) frame.current.style.transform = `scale(${element.clientWidth / canvas.width})`; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element); return () => observer.disconnect();
  }, [!!rendered, canvas.width]);
  async function generate(life: Life, approvedOverride = false) {
    if (!api || !capabilities || capabilities.remaining_attempts < 1 || !approved && !approvedOverride) throw new Error('html_unavailable');
    let value = life.record!.value;
    if (!value.source) throw new Error('composition_source_required');
    if (['submitting', 'uncertain', 'completed'].includes(value.status)) return;
    if (!value.request) {
      const withoutText = value.copy_mode === 'no_text';
      const chosenCopy = approvedOverride ? value.copy_text : copyText;
      const lines = withoutText ? [] : chosenCopy.split(/\r?\n/).filter(text => text.trim());
      if (!withoutText && (lines.length < 1 || lines.length > COMPOSITION_LIMITS.texts)) throw new Error('composition_copy_count');
      if ((withoutText || lines.length > 12) && capabilities.composition_version !== 2) throw new Error('composition_upgrade_required');
      const copy = withoutText ? await makeTextlessCompositionCopy() : await makeApprovedCompositionCopy(lines
        .map((text, index) => ({ id: `copy_${index + 1}`, role: index === 0 ? 'title' as const : 'body' as const, text })));
      ensure(life);
      if (!value.source.version) {
        const version = await api.upload({ businessId, uploadId: value.source.upload_id, brandId: designSurfaceBrand(destination), projectId: documentId }, value.source.blob);
        ensure(life); value = await save(life, current => ({ ...current, source: { ...current.source!, version } }));
      }
      const reference = value.source!.version!;
      const request: HtmlCompositionRequest = { request_key: crypto.randomUUID(), canvas, copy, design_reference: reference.identity,
        context: { actor_id: life.actor, business_id: businessId, brand_id: designSurfaceBrand(destination), project_id: documentId,
          session_id: sessionId, workspace: designSurfaceWorkspace(destination), interaction_mode: 'execute_change', target, copy_version_id: copy.version_id,
          instruction: [withoutText ? 'Convertir este diseño aprobado sin texto en una composición editable de formas y piezas. No añadir texto.' : 'Convertir este diseño aprobado en una composición editable. Conservar literalmente el contenido aprobado; separar texto, formas y piezas.', value.instruction].filter(Boolean).join('\n\n'),
          immutable_elements: ['No sustituir los textos aprobados por texto leído de la imagen.'],
          references: [{ ...reference.identity, reference_id: 'approved-design', mime_type: 'image/png', roles: ['layout_reference'] }] } };
      await save(life, current => ({ ...current, copy_text: withoutText ? '' : chosenCopy, request, status: 'saved' }));
    }
    value = await save(life, current => ({ ...current, status: 'submitting' }));
    try {
      const result = await api.plan(value.request!); ensure(life); proposalReason.current = 'generated';
      await save(life, current => ({ ...current, result, status: 'completed' }));
    } catch (problem) {
      if (active(life)) {
        const refused = problem instanceof DesignServerClientError && ['html_quota_exceeded', 'html_previous_unresolved', 'server_html_expired', 'server_feature_disabled', 'business_access_denied', 'business_write_denied', 'invalid_html_request', 'html_source_not_approved', 'html_source_invalid', 'html_source_unavailable', 'server_policy_changed', 'html_request_too_large'].includes(problem.code);
        await save(life, current => ({ ...current, status: refused ? 'saved' : 'uncertain' }));
      }
      throw problem;
    } finally { if (active(life)) setCapabilities(await api.capabilities().catch(() => null)); }
  }
  async function recover(life: Life) {
    if (!api) return;
    proposalReason.current = 'recovered';
    const value = life.record!.value;
    if (value.request) {
      const result = await api.recover(value.request); ensure(life);
      if (result) await save(life, current => ({ ...current, result, status: 'completed' }));
      else setError('Todavía no hay un resultado confirmado. La solicitud se conserva sin reenviarse.');
    } else {
      const attempts = await api.history(sessionId); ensure(life);
      const last = attempts.at(-1);
      if (last) {
        const blob = await client.asset(last.request.design_reference); ensure(life);
        const remote = await client.read(businessId); ensure(life);
        const version = remote.state.assets.versions.find(asset => asset.identity.asset_id === last.request.design_reference.asset_id && asset.identity.version_id === last.request.design_reference.version_id);
        if (!version) throw new Error('asset_not_found');
        const text = last.request.copy.blocks.map(block => block.text).join('\n');
        await save(life, () => ({ ...emptyCompositionDraft(), copy_text: text, copy_mode: last.request.copy.mode === 'none' ? 'no_text' : 'approved_text', request: last.request, result: last.result ?? null,
          status: last.status === 'completed' ? 'completed' : 'uncertain', source: { blob, version, name: 'Diseño recuperado.png', upload_id: crypto.randomUUID() } })); setCopyText(text);
      }
    }
    setCapabilities(await api.capabilities());
  }
  async function bind(life: Life, slot: string, value: SavedCompositionBinding) {
    if (life.record!.value.edit) throw new Error('composition_edit_locked');
    proposalReason.current = 'edited';
    await save(life, current => ({ ...current, bindings: { ...current.bindings, [slot]: value } }));
  }
  async function saveEditor(life: Life, html: string, closeEditor: boolean) {
    const current = life.record!.value;
    if (!current.request || !current.result || !rendered || rendered.unresolvedSlots.length) throw new Error('composition_slots_unresolved');
    if ((await client.session()).actorId !== life.actor) throw new Error('server_session_changed');
    ensure(life);
    const clean = sanitizePresentationHtml(html);
    const mounted = reconcileMountedAssets({ ...slide, mounted_assets: current.edit?.mounted_assets ?? rendered.mountedAssets }, clean);
    proposalReason.current = 'edited';
    await save(life, value => ({ ...value, edit: { html: clean, mounted_assets: mounted,
      request_key: current.request!.request_key, copy_version_id: current.request!.copy.version_id } }));
    if (closeEditor && active(life)) setEditing(false);
  }
  const frozen = !!draft.request, canApply = rendered && rendered.unresolvedSlots.length === 0 && Object.keys(bindings).length === Object.keys(draft.bindings).length;
  function proposalFrom(value: CompositionDraft, output: NonNullable<typeof rendered>): DesignToHtmlProposal {
    const request = value.request!;
    return { html: value.edit ? sanitizePresentationHtml(value.edit.html) : output.html,
      mountedAssets: structuredClone(value.edit?.mounted_assets ?? output.mountedAssets), target: structuredClone(request.context.target),
      canvas: { ...request.canvas }, source: { ...request.design_reference }, copyVersion: request.copy.version_id,
      requestKey: request.request_key, unresolvedSlots: [...output.unresolvedSlots] };
  }
  const proposed = useMemo(() => rendered && draft.request ? proposalFrom(draft, rendered) : null, [rendered, draft]);
  useEffect(() => {
    latest.current.onState?.({ ready, busy, error, status: draft.status, canApply: !!canApply, requestKey: draft.request?.request_key,
      context: { asset: draft.source?.version, copy: copyText, copyMode: draft.copy_mode ?? 'approved_text', instruction: draft.instruction ?? '' },
      proposal: proposed });
  }, [ready, busy, error, draft, copyText, !!canApply, proposed]);
  useEffect(() => {
    if (!ready || !proposed) return;
    try { latest.current.onProposal?.(structuredClone(proposed), proposalReason.current); } catch { /* Observers cannot invalidate a saved result. */ }
  }, [ready, proposed]);
  async function updateContext(life: Life, input: DesignToHtmlContext) {
    let current = life.record!.value;
    if (current.request) {
      const changed = (input.asset && !sameAsset(current.source?.version?.identity, input.asset.identity))
        || input.copy !== undefined && input.copy !== current.copy_text
        || input.copyMode !== undefined && input.copyMode !== (current.copy_mode ?? 'approved_text')
        || input.instruction !== undefined && input.instruction !== (current.instruction ?? '');
      if (!changed && !input.replaceCompleted) return;
      if (current.status !== 'completed' || !input.replaceCompleted) throw Error('composition_request_locked');
      current = { ...emptyCompositionDraft(), copy_text: current.copy_text, copy_mode: current.copy_mode,
        instruction: current.instruction, source: current.source };
    }
    if ((await client.session()).actorId !== life.actor) throw Error('server_session_changed'); ensure(life);
    if (input.asset && !sameAsset(current.source?.version?.identity, input.asset.identity)) {
      if (input.asset.identity.business_id !== businessId) throw Error('composition_scope_mismatch');
      const blob = await client.asset(input.asset.identity); ensure(life);
      current = { ...current, source: { blob, version: structuredClone(input.asset), name: 'Diseño elegido.png', upload_id: crypto.randomUUID() } };
    }
    const mode = input.copyMode ?? current.copy_mode ?? 'approved_text';
    const next = { ...current, copy_mode: mode, copy_text: mode === 'no_text' ? '' : input.copy ?? current.copy_text,
      instruction: input.instruction ?? current.instruction ?? '' };
    await save(life, () => next); setCopyText(next.copy_text); setApproved(false);
  }
  async function resolveProposal(life: Life, complete = false): Promise<DesignToHtmlProposal | null> {
    const current = life.record!.value;
    if (!current.request || !current.result) return null;
    await verifyHtmlCompositionRequest(current.request);
    if ((await client.session()).actorId !== life.actor) throw Error('server_session_changed'); ensure(life);
    const remote = await client.read(businessId); ensure(life);
    if (current.source?.version?.provenance.kind === 'image_operation'
      && getAssetReviewStatus(remote.state.assets, current.request.design_reference) !== 'approved') throw Error('html_source_not_approved');
    const resolved: CompositionBindings = {};
    const localLibrary = await listPresentationAssets(businessId); ensure(life);
    for (const [slot, binding] of Object.entries(current.bindings)) {
      if ('omitted' in binding) { resolved[slot] = { omitted: true }; continue; }
      let blob: Blob;
      if (binding.origin === 'local') {
        const local = localLibrary.find(item => sameAsset(item.version.identity, binding.asset));
        if (!local) throw Error('asset_not_found'); blob = await readPresentationAsset(businessId, local.version);
      } else {
        if (getAssetReviewStatus(remote.state.assets, binding.asset) !== 'approved') throw Error('composition_piece_not_approved');
        blob = await client.asset(binding.asset);
      }
      ensure(life); resolved[slot] = { asset: binding.asset, dataUrl: await imageDataUrl(blob), altText: binding.altText };
    }
    const output = renderHtmlComposition(current.request, current.result, resolved, { allowUnresolved: !complete });
    // Opening the editor rechecks the registered assets. Keep equal snapshots
    // stable so the hydration effect cannot replace its document mid-edit.
    setBindings(previous => JSON.stringify(previous) === JSON.stringify(resolved) ? previous : resolved);
    setLibrary(previous => JSON.stringify(previous) === JSON.stringify(localLibrary) ? previous : localLibrary);
    return proposalFrom(current, output);
  }
  async function apply(life: Life) {
    const current = life.record!.value;
    if (!current.request || !current.result || current.request.context.target.revision !== String(latest.current.slide.revision)
      || current.request.context.target.document_type !== target.document_type || current.request.context.target.document_id !== target.document_id
      || current.request.context.target.page_id !== target.page_id || current.request.context.target.slide_id !== target.slide_id
      || current.request.context.brand_id !== designSurfaceBrand(destination) || current.request.context.workspace !== designSurfaceWorkspace(destination)) throw Error('slide_revision_conflict');
    const proposal = await resolveProposal(life, true); if (!proposal) throw Error('composition_result_required');
    const mountedAssets = reconcileMountedAssets({ ...slide, mounted_assets: proposal.mountedAssets }, proposal.html);
    ensure(life); await latest.current.onApply(reviseSlide([latest.current.slide], { slide_id: slide.id, expected_revision: latest.current.slide.revision,
      html: proposal.html, mounted_assets: mountedAssets })[0]);
    if (active(life) && !externalConversation) latest.current.onClose();
  }
  async function saveLogo(logo: DesignLogoSelection) {
    await run(async life => {
      const proposal = await resolveProposal(life, true); if (!proposal) throw Error('composition_result_required');
      if (proposal.target.revision !== String(latest.current.slide.revision)) throw Error('slide_revision_conflict');
      await saveEditor(life, insertDesignLogo(proposal.html, { ...logo, canvas: proposal.canvas }), false);
    }, true);
  }
  useImperativeHandle(props.controllerRef, () => ({
    async updateContext(input) { const frozen = structuredClone(input); await run(life => updateContext(life, frozen), true); },
    async create(input) { const frozen = structuredClone(input); return (await run(async life => {
      if (frozen.approved !== true) throw Error('composition_approval_required');
      await updateContext(life, frozen);
      if (life.record!.value.status !== 'completed') await generate(life, true);
      const proposal = await resolveProposal(life); if (!proposal) throw Error('server_html_outcome_unknown'); return proposal;
    }, true))!; },
    async recover() { return (await run(async life => { await recover(life); return resolveProposal(life); }, true)) ?? null; },
    async openEditor() { await run(async life => {
      if (!await resolveProposal(life, true)) throw Error('composition_result_required'); setEditing(true);
    }, true); },
    async openLogos() { await run(async life => {
      if (editing) throw Error('Guarda los ajustes del editor antes de elegir un logo.');
      if (!await resolveProposal(life, true)) throw Error('composition_result_required'); setLogosOpen(true);
    }, true); },
    async apply() { await run(apply, true); },
  }));
  return <div className={embedded ? 'hcp-embedded' : 'mip-backdrop'} onKeyDown={event => { if (event.key === 'Escape' && !busy && !editing && !embedded) close(); }}><div className={`mip-dialog hcp-dialog${externalConversation ? ' hcp-external' : ''}`} ref={node => { node?.toggleAttribute('inert', editing); }} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={embedded ? 'Composición HTML del diseño' : undefined} aria-labelledby={embedded ? undefined : 'hcp-title'} aria-busy={busy}>
    {!embedded && <header className="mip-header"><div><h2 id="hcp-title"><Layers size={21} />Usar diseño para HTML</h2><p>Revisa el contenido y separa las piezas para obtener una composición editable.</p></div>
      <button className="mip-icon-button" aria-label="Cerrar diseño para HTML" disabled={busy} onClick={close}><X size={20} /></button></header>}
    <div className="mip-body hcp-body">{!externalConversation && <aside className="mip-library">
      <label className="sdp-field">Diseño elegido<input type="file" aria-label="Diseño para convertir" accept="image/png,image/jpeg,image/webp" disabled={busy || !ready || frozen}
        onChange={event => { const file = event.target.files?.[0]; if (file) void run(async life => { const blob = await prepareServerCapture(file, capabilities?.max_reference_edge ?? 1536); ensure(life);
          await save(life, current => ({ ...current, source: { blob, name: file.name, upload_id: crypto.randomUUID() } })); setApproved(false); }); }} /></label>
      {draft.source && <p className="mip-note">{draft.source.name}</p>}
      <label className="hcp-confirm"><input type="checkbox" aria-label="Composición sin texto" checked={draft.copy_mode === 'no_text'} disabled={busy || !ready || frozen}
        onChange={event => { const withoutText = event.target.checked; void run(async life => {
          await save(life, value => ({ ...value, copy_mode: withoutText ? 'no_text' : 'approved_text', copy_text: withoutText ? '' : copyText }));
          if (withoutText) setCopyText(''); setApproved(false);
        }); }} />Sin texto</label>
      {draft.copy_mode !== 'no_text' && <><label className="sdp-field">Texto aprobado<textarea aria-label="Contenido aprobado para HTML" value={copyText} rows={8} maxLength={COMPOSITION_LIMITS.copy_chars} disabled={busy || !ready || frozen}
        onChange={event => { setCopyText(event.target.value); setApproved(false); }} /></label>
      <p className="mip-note">Una línea por bloque, hasta 64. La primera será el título. El contenido se conserva literalmente al convertir.</p></>}
      {draft.copy_mode === 'no_text' && <p className="mip-note">Se convertirán formas y piezas sin añadir palabras de la imagen.</p>}
      {!frozen || draft.status === 'saved' ? <><label className="hcp-confirm"><input type="checkbox" aria-label="Apruebo contenido para HTML" checked={approved} disabled={busy || !ready}
        onChange={event => setApproved(event.target.checked)} />He revisado el diseño y apruebo este contenido.</label>
        <button className="mip-button mip-button-primary" disabled={busy || !ready || !approved || !draft.source || draft.copy_mode !== 'no_text' && !copyText.trim() || !capabilities?.remaining_attempts}
          onClick={() => void run(generate)}>{draft.status === 'saved' ? 'Enviar solicitud guardada' : 'Crear HTML editable'}</button></> : <p className="sdp-status" role="status">{draft.status === 'completed' ? 'Composición lista para revisar' : 'Conversión pendiente de confirmar'}</p>}
      {!capabilities && ready && <p className="mip-note">La conversión está pausada. Puedes recuperar y revisar trabajos guardados.</p>}
      <button className="mip-button" disabled={busy || !ready} onClick={() => void run(recover)}><RefreshCw size={15} />Recuperar composición</button>
      {draft.status === 'completed' && <button className="mip-button" disabled={busy} onClick={() => void run(async life => {
        await save(life, current => ({ ...emptyCompositionDraft(), copy_text: current.copy_text, copy_mode: current.copy_mode, instruction: current.instruction, source: current.source })); setApproved(false); })}>Preparar otra conversión</button>}
      {service.simulation && <p className="mip-note">Prueba local con resultados simulados, sin llamadas de pago.</p>}
      <p className="mip-note">Asignar, extraer o mover las piezas después de convertir no genera nuevas imágenes.</p>
    </aside>}<section className="mip-workspace">
      {externalConversation && <div className="hcp-editor-actions"><button className="mip-button" disabled={busy || !ready} onClick={() => void run(recover)}><RefreshCw size={15} />Recuperar composición</button>
        {draft.status !== 'draft' && draft.status !== 'completed' && <p className="mip-note">La conversión guardada está pendiente. Recuperar consulta el resultado sin volver a generarlo.</p>}</div>}
      <div className="hcp-comparison"><section><h3>Diseño de referencia</h3>{sourceUrl ? <img src={sourceUrl} alt="Diseño elegido como referencia" /> : <p>Añade un diseño ya elegido o usa una propuesta aprobada.</p>}</section>
        <section><h3>Composición editable{draft.edit ? ' · con tus ajustes' : ''}</h3>{displayedHtml ? <div className="hcp-preview" style={{ aspectRatio: `${canvas.width}/${canvas.height}` }}><iframe ref={frame} title="Composición HTML editable" sandbox="" tabIndex={-1}
          srcDoc={displayedHtml} style={{ width: canvas.width, height: canvas.height }} onLoad={event => { event.currentTarget.style.transform = `scale(${event.currentTarget.parentElement!.clientWidth / canvas.width})`; }} /></div> : <p>La composición aparecerá aquí para que puedas compararla antes de aplicarla.</p>}</section></div>
      {draft.result && <div className="hcp-inventory"><span>{draft.result.composition.texts.length} textos editables</span><span>{draft.result.composition.shapes.length} formas</span><span>{draft.result.composition.slots.length} espacios para piezas</span></div>}
      {draft.result && <div className="hcp-editor-actions">{!externalConversation && <button className="mip-button mip-button-primary" disabled={busy || !canApply} onClick={() => setEditing(true)}><SlidersHorizontal size={16} />Abrir editor completo</button>}
        <p className="mip-note">Texto, tipografía, capas, imágenes y posiciones. Tus ajustes se guardan aquí antes de aplicarlos al documento.</p>
        {draft.edit && <button className="mip-button" disabled={busy} onClick={() => void run(life => save(life, value => ({ ...value, edit: null })).then(() => {}))}>Descartar ajustes y volver a la composición inicial</button>}</div>}
      {!draft.edit && <>
      {draft.result?.composition.slots.map(slot => <section className="hcp-slot" key={slot.id} data-testid="composition-slot" data-slot-id={slot.id}>
        <h3>{slot.label}</h3><p className="mip-note">{slot.box.width} × {slot.box.height} px · {bindings[slot.id] ? 'Elección guardada' : 'Elige una pieza, extráela del diseño u omítela explícitamente.'}</p>
        <select aria-label={`Pieza para ${slot.label}`} disabled={busy} value="" onChange={event => {
          const [origin, index] = event.target.value.split(':');
          if (origin === 'local' && library[Number(index)]) void run(life => bind(life, slot.id, { origin: 'local', asset: library[Number(index)].version.identity, altText: slot.label }));
          if (origin === 'server' && serverAssets[Number(index)]) void run(life => bind(life, slot.id, { origin: 'server', asset: serverAssets[Number(index)].identity, altText: slot.label }));
        }}><option value="">Elegir de la biblioteca…</option>{library.map((item, index) => <option key={`local${index}`} value={`local:${index}`}>Pieza local {index + 1} · {item.version.storage.width}×{item.version.storage.height}</option>)}
          {serverAssets.map((item, index) => <option key={`server${index}`} value={`server:${index}`}>Pieza aprobada {index + 1} · {item.storage.width}×{item.storage.height}</option>)}</select>
        <label className="mip-button">Subir pieza<input type="file" aria-label={`Subir pieza para ${slot.label}`} accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; if (file) void run(async life => { const item = await importPresentationAsset(businessId, file); ensure(life);
            setLibrary(await listPresentationAssets(businessId)); await bind(life, slot.id, { origin: 'local', asset: item.version.identity, altText: slot.label }); }); }} /></label>
        <button className="mip-button" disabled={busy || !draft.source} onClick={() => setCropping(cropping === slot.id ? null : slot.id)}>Extraer del diseño</button>
        <button className="mip-button" disabled={busy} onClick={() => void run(life => bind(life, slot.id, { omitted: true }))}>Omitir esta pieza</button>
        {cropping === slot.id && draft.source && <ManualExtractionEditor sourceUrl={sourceUrl} width={draft.source.version?.storage.width ?? 1} height={draft.source.version?.storage.height ?? 1}
          disabled={busy} readSource={async () => draft.source!.blob} onCancel={() => setCropping(null)} onSave={recipe => run(async life => {
            const source = life.record!.value.source!;
            let piece: PresentationLibraryAsset;
            if (source.version) {
              piece = await extractRegisteredPresentationAsset(client, { businessId, actorId: life.actor, asset: source.version, sourceBlob: source.blob, recipe });
            } else {
              if (!sourceLocal.current) sourceLocal.current = await importPresentationAsset(businessId, new File([source.blob], 'referencia-composicion.png', { type: 'image/png' }));
              piece = await extractPresentationAsset(businessId, sourceLocal.current.version, recipe);
            }
            ensure(life);
            setLibrary(await listPresentationAssets(businessId)); await bind(life, slot.id, { origin: 'local', asset: piece.version.identity, altText: slot.label }); setCropping(null);
          })} />}
      </section>)}
      </>}
    </section></div>
    <footer className="mip-footer"><div>{error ? <p className="mip-error" role="alert">{error}</p> : <p className="mip-note">{busy ? 'Preparando la composición…' : destination ? 'El lienzo se modifica al aplicar el resultado revisado.' : 'El slide se modifica al aplicar el resultado revisado.'}</p>}</div>
      {!externalConversation && <button className="mip-button mip-button-primary" disabled={busy || !ready || !canApply} onClick={() => void run(apply)}>Aplicar HTML revisado</button>}</footer>
  </div>{editing && displayedHtml && <div className="hcp-editor-backdrop" role="dialog" aria-modal="true" aria-label="Editor completo de la composición">
    <div className="hcp-editor-surface" ref={node => { node?.toggleAttribute('inert', busy); }}><VisualDesignEditor html={displayedHtml} businessId={businessId} pieceIndex={0} dimensions={canvas}
      onApply={html => void run(life => saveEditor(life, html, false))} onSave={html => void run(life => saveEditor(life, html, true))}
      onCancel={() => { if (!busy) setEditing(false); }} /></div>
    {busy && <p className="hcp-editor-saving" role="status">Guardando tus ajustes…</p>}
    {error && <p className="mip-error hcp-editor-error" role="alert">{error}</p>}
  </div>}{logosOpen && <DesignLogoPicker businessId={businessId} onSelect={saveLogo} onClose={() => setLogosOpen(false)} />}</div>;
}
