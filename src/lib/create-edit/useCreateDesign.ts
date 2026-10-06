import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import type { ServerSnapshot } from '../../../supabase/functions/_shared/desaing/serverState';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import type { DesignOperation } from '../../../supabase/functions/_shared/desaing/contracts';
import { useDesignBrandContext } from '../presentations/useDesignBrandContext';
import { prepareConversationReferences } from '../presentations/designConversationImages';
import { openPresentationReferenceStore, type PreparedPresentationReference } from '../presentations/presentationReferences';
import { presentationGenerationCapabilities, reviewServerLibraryResult, type PresentationLibraryResult } from '../presentations/presentationServerDesign';
import type { ImageGenerationSettings } from '../imageGenerationSettings';
import { openVersionDocument, readVersionDocuments } from './openInEditor';
import type { FreeDesignDocument } from '../desaing/freeDesignDocument';
import { useSaveMockup } from '@/hooks/useDesignMockups';

import { buildDesignEditOperation, buildDesignObjectOperation, buildDesignVersionOperation, DESIGN_DESTINATION, DESIGN_PAGE_ID, designResults, designStorageKey,
  isDesignJob, layerObjectResult, mockupPlatform, monthlyImageSpendMicroUsd, newDesignSetup, pendingDesignJobs, readDesignSetup, buildReadingRequest, readingFromUnderstanding,
  referencesKey, type DesignSetup, type UploadedReferences } from './designRun';

const UNRESOLVED = ['pending', 'running', 'result_received', 'validating', 'uncertain'];
const STALE_MS = 5 * 60 * 1000;
const code = (problem: unknown) => problem && typeof problem === 'object' && 'code' in problem ? String(problem.code)
  : problem instanceof Error ? problem.message : '';
const MESSAGES: Record<string, string> = {
  design_copy_required: 'Escribe el texto exacto del diseño, léelo de la imagen o marca «Sin texto».',
  design_text_source_required: 'Añade la imagen que trae el texto y márcala como «Texto y contenido».',
  design_text_unreadable: 'No pude leer el texto de la imagen. Escríbelo en «Texto exacto».',
  exploration_provider_timeout: 'La lectura tardó demasiado. Vuelve a intentarlo.',
  server_feature_disabled: 'La lectura con IA está pausada en el servidor. Escribe el texto a mano.',
  server_exploration_configuration_invalid: 'La lectura con IA no está configurada en el servidor. Escribe el texto a mano.',
  design_format_requires_composition: 'Este formato se arma por piezas y todavía no está disponible aquí.',
  design_change_required: 'Escribe qué quieres cambiar en la versión elegida.',
  design_brief_too_large: 'La indicación es demasiado larga. Resúmela un poco.',
  invalid_design_brief: 'Escribe una indicación de hasta 16000 caracteres.',
  unsupported_image_selection: 'El servidor no tiene habilitado ese modelo o calidad.',
  server_generation_unavailable: 'La generación de imágenes no está disponible en este momento.',
  server_previous_operation_unresolved: 'Otra imagen de este negocio sigue en proceso. Espera a que termine o descártala.',
  server_generation_outcome_unknown: 'La versión sigue en proceso. La mostraremos en cuanto termine.',
  server_generation_reference_limit: 'Usa hasta 3 referencias PNG, JPEG o WebP de hasta 8 MB.',
  presentation_reference_limit: 'Usa hasta 3 referencias.',
  server_session_changed: 'Cambió tu sesión. Vuelve a abrir esta pantalla.',
  server_review_conflict: 'Esta versión ya se revisó.',
  business_write_denied: 'Tu rol en este negocio no permite generar. Pide acceso de owner o admin.',
  request_too_large: 'La solicitud es demasiado grande. Acorta la indicación o usa menos referencias.',
  free_workspace_full: 'Diseño libre ya tiene 30 diseños. Borra o exporta alguno antes de abrir otro.',
  conversation_sync_unavailable: 'No se pudo confirmar el guardado en Supabase. Sincroniza Diseño libre y vuelve a intentarlo.',
  unapproved_asset: 'Aprueba esta versión antes de abrirla en el editor.',
  editor_document_changed: 'Este diseño se guardó en otra pestaña o dispositivo. Cierra el editor y vuelve a abrirlo; tus cambios de aquí no se guardaron.',
  editor_document_missing: 'No encontré el diseño guardado de esta versión. Cierra el editor y vuelve a abrirlo.',
  conversation_revision_conflict: 'Otra sesión guardó cambios al mismo tiempo. Cierra el editor y vuelve a abrirlo.',
  free_revision_conflict: 'Otra sesión guardó cambios al mismo tiempo. Cierra el editor y vuelve a abrirlo.',
  slide_revision_conflict: 'El diseño cambió mientras editabas. Cierra el editor y vuelve a abrirlo.',
  mockup_save_failed: 'No se pudo guardar en Mockups. Revisa tu conexión y vuelve a intentarlo.',
  invalid_asset_generation: 'No se pudo preparar la capa del objeto. Acorta la indicación o usa menos referencias.',
  draft_requires_direction_approval: 'Las versiones en calidad baja no se aprueban aquí. Usa calidad media o alta.',
};
export const describeDesignError = (problem: unknown) => MESSAGES[code(problem)]
  ?? (problem instanceof Error && /\s/.test(problem.message) ? problem.message : 'No se pudo completar la acción. Tu trabajo se conserva.');

export interface DesignProgress { total: number; done: number; label: string }

/** One Crear y editar design: setup, references, sequential versions, review, edits and downloads. */
export function useCreateDesign(input: { service: PresentationDesignService; businessId: string; actorId: string; initialInstruction?: string;
  settings: ImageGenerationSettings }) {
  const { service, businessId, actorId } = input, client = service.client;
  const key = designStorageKey(actorId, businessId);
  const [setup, setSetupState] = useState<DesignSetup>(() => {
    try { const saved = readDesignSetup(localStorage.getItem(key)); if (saved) return saved; } catch { /* Local storage is optional. */ }
    return newDesignSetup('cover_16_9', input.initialInstruction ?? '');
  });
  const [references, setReferences] = useState<PreparedPresentationReference[]>([]);
  const [state, setState] = useState<ServerSnapshot | null>(null);
  const [generation, setGeneration] = useState<ServerGenerationCapabilities | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<DesignProgress | null>(null);
  const brand = useDesignBrandContext(businessId, service.brand);
  const saveMockup = useSaveMockup();
  const alive = useRef(true), locked = useRef(false), settingsRef = useRef(input.settings), setupRef = useRef(setup);
  useEffect(() => { settingsRef.current = input.settings; setupRef.current = setup; });

  const setSetup = useCallback((next: DesignSetup) => {
    setSetupState(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* The server keeps every generated version. */ }
  }, [key]);
  const assertActor = useCallback(async () => {
    if (!alive.current) throw Error('design_closed');
    if ((await client.session()).actorId !== actorId) throw Error('server_session_changed');
  }, [client, actorId]);
  const refresh = useCallback(async () => {
    const response = await client.read(businessId); if (!alive.current) return null;
    setState(response.state); setGeneration(presentationGenerationCapabilities(response.generation, service.simulation, response.state));
    return response.state;
  }, [client, businessId, service.simulation]);

  // Restore the reference selection of this design from its local upload journal.
  useEffect(() => {
    let active = true, store: Awaited<ReturnType<typeof openPresentationReferenceStore>> | undefined;
    void (async () => {
      store = await openPresentationReferenceStore({ actor_id: actorId, business_id: businessId, document_id: setup.documentId, slide_id: `conversation:${DESIGN_PAGE_ID}` });
      const record = await store.read(); if (active) setReferences(record?.value.items ?? []);
    })().catch(() => { if (active) setReferences([]); }).finally(() => store?.close());
    return () => { active = false; };
  }, [actorId, businessId, setup.documentId]);
  useEffect(() => { alive.current = true; void refresh().catch(problem => setError(describeDesignError(problem))); return () => { alive.current = false; }; }, [refresh]);

  const results = useMemo(() => state ? designResults(state, businessId, setup.documentId) : [], [state, businessId, setup.documentId]);
  const objectKeys = useMemo(() => setup.layerPairs.map(pair => pair.object), [setup.layerPairs]);
  const pending = useMemo(() => state ? pendingDesignJobs(state, setup.documentId, objectKeys) : [], [state, setup.documentId, objectKeys]);
  // Work of this business elsewhere that blocks a new request (the server admits one job at a time).
  const blocking = useMemo(() => state?.jobs.jobs.filter(job => !isDesignJob(job, setup.documentId, objectKeys)
    && job.calls.some(call => UNRESOLVED.includes(call.state))) ?? [], [state, setup.documentId, objectKeys]);
  /** Object layer of each background version (separate layers), by background version id. */
  const objects = useMemo(() => new Map(state ? results.flatMap(result => {
    const object = layerObjectResult(state, businessId, setup, result);
    return object ? [[result.asset.identity.version_id, object] as const] : [];
  }) : []), [state, businessId, setup, results]);
  const selected = results.find(item => item.asset.identity.version_id === selectedId) ?? results[results.length - 1] ?? null;
  // Saved editor documents of these versions (edits made in the Editor Visual), by version id.
  const [documents, setDocuments] = useState<Map<string, FreeDesignDocument>>(new Map());
  const versionIds = results.map(item => item.asset.identity.version_id).join(',');
  useEffect(() => {
    if (!versionIds) return;
    let active = true;
    void readVersionDocuments(service, businessId, versionIds.split(',')).then(found => { if (active) setDocuments(found); }).catch(() => undefined);
    return () => { active = false; };
  }, [service, businessId, versionIds]);
  const monthlySpend = state ? monthlyImageSpendMicroUsd(state) : 0;
  /** The saved reading applies only to the current images and roles. */
  const readingCurrent = !!setup.reading && setup.reading.key === referencesKey(references.map(item => ({ id: item.id, role: item.role })));

  // Poll only while this design has work in progress; back off after errors.
  useEffect(() => {
    if (!pending.length || busy) return;
    let delay = 4000, timer: ReturnType<typeof setTimeout>, active = true;
    const tick = () => { timer = setTimeout(() => void refresh().then(() => { delay = 4000; }).catch(() => { delay = Math.min(delay * 2, 30000); })
      .finally(() => { if (active) tick(); }), delay); };
    tick(); return () => { active = false; clearTimeout(timer); };
  }, [pending.length, busy, refresh]);

  async function run(task: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (problem) { if (alive.current) setError(describeDesignError(problem)); }
    finally { locked.current = false; if (alive.current) { setBusy(false); setProgress(null); } }
  }
  function capabilities() {
    if (!generation) throw Error('server_generation_unavailable');
    if (brand.status === 'loading') throw Error('Espera a que cargue la identidad de la marca.');
    return generation;
  }
  function addPair(background: string, object: string) {
    const latest = setupRef.current, next = { ...latest, layerPairs: [...latest.layerPairs, { background, object }].slice(-200) };
    setupRef.current = next; setSetup(next);
  }
  /** Approves a version and, with separate layers, its object; returns the object result. */
  async function approveWithObject(result: PresentationLibraryResult) {
    if (result.call.state === 'needs_review') await reviewServerLibraryResult(client, businessId, result.asset.identity, 'approved');
    const object = objects.get(result.asset.identity.version_id) ?? null;
    if (object?.call.state === 'needs_review') await reviewServerLibraryResult(client, businessId, object.asset.identity, 'approved');
    return object;
  }
  async function uploadReferences(current: DesignSetup): Promise<UploadedReferences> {
    return prepareConversationReferences({ client, actor: actorId, business: businessId, document: current.documentId, slide: DESIGN_PAGE_ID,
      references, destination: DESIGN_DESTINATION, assertCurrent: assertActor });
  }
  /** The enqueue request returns once the image exists; if the answer is lost, wait for the saved job. */
  async function dispatch(operation: DesignOperation) {
    try { await client.command(businessId, { kind: 'enqueue', operation }); }
    catch (problem) {
      const status = problem && typeof problem === 'object' && 'httpStatus' in problem ? Number(problem.httpStatus) : 0;
      if (!['server_generation_outcome_unknown', 'server_response_unknown'].includes(code(problem)) && status < 500) throw problem;
      // Only a saved job can still finish; if none exists, the request never started.
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        const fresh = await refresh(); const job = fresh?.jobs.jobs.find(item => item.operation_key === operation.operation_key);
        if (!job) { if (attempt >= 1) throw problem; continue; }
        if (!job.calls.some(call => UNRESOLVED.includes(call.state))) return;
      }
      // The job is still running after four minutes; polling keeps showing it when it lands.
      throw Object.assign(Error('server_generation_outcome_unknown'), { cause: problem });
    }
  }

  return {
    setup, setSetup, references, setReferences, results, selected, pending, blocking, generation, brand, busy, error, notice, progress, monthlySpend, readingCurrent, objects, documents,
    select: (result: PresentationLibraryResult) => setSelectedId(result.asset.identity.version_id),
    refresh: () => run(async () => { await refresh(); }),
    newDesign: () => { setSelectedId(null); setReferences([]);
      setSetup({ ...newDesignSetup(setupRef.current.formatId), style: setupRef.current.style, layers: setupRef.current.layers }); },
    generate: () => run(async () => {
      const current = setupRef.current, caps = capabilities(); await assertActor();
      const total = current.count;
      // Validate every version before paying for anything.
      buildDesignVersionOperation({ setup: current, businessId, actorId, brand: brand.context, generation: caps, settings: settingsRef.current,
        references: [], index: 0, total, operationKey: 'validation' });
      if (current.layers) buildDesignObjectOperation({ setup: current, businessId, actorId, generation: caps, settings: settingsRef.current,
        references: [], index: 0, total, operationKey: 'validation' });
      setProgress({ total, done: 0, label: references.length ? 'Subiendo referencias…' : 'Preparando…' });
      const uploaded = await uploadReferences(current);
      for (let index = 0; index < total; index++) {
        if (!alive.current) return;
        const version = `versión ${index + 1} de ${total}`;
        setProgress({ total, done: index, label: current.layers ? `Creando el fondo de la ${version}…` : `Creando ${version}…` });
        const operation = buildDesignVersionOperation({ setup: current, businessId, actorId, brand: brand.context, generation: caps,
          settings: settingsRef.current, references: uploaded, index, total, operationKey: crypto.randomUUID() });
        const object = current.layers ? buildDesignObjectOperation({ setup: current, businessId, actorId, generation: caps,
          settings: settingsRef.current, references: uploaded, index, total, operationKey: crypto.randomUUID() }) : null;
        // The pair is saved before paying for either image, so a reload still joins them.
        if (object) addPair(operation.operation_key, object.operation_key);
        await dispatch(operation); await refresh();
        if (!object || !alive.current) continue;
        setProgress({ total, done: index, label: `Creando el objeto de la ${version}…` });
        await dispatch(object); await refresh();
      }
      setNotice(total > 1 ? `Listas ${total} versiones. Elige una para ajustarla o aprobarla.` : 'Versión lista.');
    }),
    /** One vision reading of every reference: literal text (if empty), what to take from each image and the render plan. */
    understand: () => run(async () => {
      const current = setupRef.current; await assertActor();
      if (!references.length) throw Error('design_text_source_required');
      setProgress({ total: 1, done: 0, label: 'Analizando tus referencias…' });
      const uploaded = await uploadReferences(current);
      const result = await client.exploration(businessId).plan(buildReadingRequest({ setup: current, businessId, actorId,
        references: uploaded, requestKey: crypto.randomUUID() }));
      if (!alive.current) return;
      if (!result.design_understanding) throw Error('design_text_unreadable');
      const { copy, reading, question } = readingFromUnderstanding(result.design_understanding, uploaded);
      const latest = setupRef.current, fillCopy = !latest.noText && !latest.copy.trim() && copy.status === 'literal' && !!copy.text.trim();
      setSetup({ ...latest, reading, copy: fillCopy ? copy.text.trim() : latest.copy,
        coverLayout: { ...latest.coverLayout, ...(reading.align ? { align: reading.align } : {}), ...(reading.highlight ? { highlight: reading.highlight } : {}) } });
      setNotice([fillCopy ? 'Leí el texto de la imagen' : latest.copy.trim() ? 'Conservé tu texto' : copy.status === 'none' ? 'No encontré texto en la imagen' : '',
        'Revisa «Así entendí tus referencias» y después crea.', question ? `Duda: ${question}` : ''].filter(Boolean).join('. '));
    }),
    setReading: (instruction: string) => { const current = setupRef.current; if (current.reading) setSetup({ ...current, reading: { ...current.reading, instruction } }); },
    edit: (result: PresentationLibraryResult, change: string) => run(async () => {
      const current = setupRef.current, caps = capabilities(); await assertActor();
      setProgress({ total: 1, done: 0, label: 'Aplicando el ajuste…' });
      const operation = buildDesignEditOperation({ setup: current, businessId, actorId, brand: brand.context, generation: caps, settings: settingsRef.current,
        references: [], base: result.asset, change, operationKey: crypto.randomUUID() });
      // The adjusted background keeps the object of the version it came from.
      const object = setupRef.current.layerPairs.find(pair => pair.background === result.job.operation_key);
      if (object) addPair(operation.operation_key, object.object);
      await dispatch(operation);
      const fresh = await refresh(), latest = fresh ? designResults(fresh, businessId, current.documentId).at(-1) : undefined;
      if (latest) setSelectedId(latest.asset.identity.version_id);
      setNotice('Ajuste listo. La versión anterior se conserva.');
    }),
    /** Approves if needed and opens (or creates the first time) the saved editor document of this version. */
    openInEditor: (result: PresentationLibraryResult, onReady: (document: FreeDesignDocument) => void) => run(async () => {
      await assertActor();
      setProgress({ total: 1, done: 0, label: 'Abriendo el editor…' });
      const object = await approveWithObject(result);
      const document = await openVersionDocument({ service, businessId, setup: setupRef.current, result, object });
      if (!alive.current) return;
      setDocuments(value => new Map(value).set(result.asset.identity.version_id, document));
      onReady(document);
    }),
    /** The editor closed: its last saved document becomes this version's preview and download. */
    editorClosed: (versionId: string, document: FreeDesignDocument) => setDocuments(value => new Map(value).set(versionId, document)),
    /** Uploads the final PNG to Xending Design's saved mockups. */
    saveToMockups: (result: PresentationLibraryResult, render: () => Promise<Blob>) => run(async () => {
      await assertActor();
      setProgress({ total: 1, done: 0, label: 'Guardando en Mockups…' });
      const png = await render(), bytes = new Uint8Array(await png.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      try {
        await saveMockup.mutateAsync({ imageBase64: btoa(binary), platform: mockupPlatform(setupRef.current.formatId), businessId, actorId,
          promptUsed: setupRef.current.instruction.slice(0, 4000) || undefined, iterationFeedback: 'Crear y editar' });
      } catch (problem) { throw Object.assign(Error('mockup_save_failed'), { cause: problem }); }
      setNotice('Guardado en Mockups. Ya aparece en Xending Design.');
    }),
    approve: (result: PresentationLibraryResult) => run(async () => {
      await assertActor();
      await approveWithObject(result);
      await refresh(); setNotice('Versión aprobada. Ya puedes usarla y descargarla.');
    }),
    /** `render` turns the saved image into the final file (e.g. a cropped cover with text). */
    download: (result: PresentationLibraryResult, render?: (image: Blob) => Promise<Blob>) => run(async () => {
      const source = await client.asset(result.asset.identity), blob = render ? await render(source) : source;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `diseno-${setupRef.current.formatId}-${result.asset.identity.version_id.slice(0, 8)}.png`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }),
    /** Unlocks the business when a request is stuck: running → uncertain → cancelled. */
    discardStuck: () => run(async () => {
      await assertActor();
      const now = Date.now(), stuck = [...blocking, ...pending].filter(job => job.calls.some(call => call.state === 'uncertain'
        || now - call.updated_at > STALE_MS && UNRESOLVED.includes(call.state)));
      if (!stuck.length) { setNotice('No hay solicitudes atascadas. Si una imagen sigue en proceso, espera a que termine.'); return; }
      for (const job of stuck) {
        await client.command(businessId, { kind: 'cancel', operation_key: job.operation_key });
        const fresh = await refresh(), again = fresh?.jobs.jobs.find(item => item.operation_key === job.operation_key);
        if (again?.calls.some(call => call.state === 'uncertain')) await client.command(businessId, { kind: 'cancel', operation_key: job.operation_key });
      }
      await refresh(); setNotice('Descarté las solicitudes atascadas. Ya puedes generar de nuevo.');
    }),
    imageUrl: async (result: PresentationLibraryResult) => URL.createObjectURL(await client.asset(result.asset.identity)),
    imageBlob: (result: PresentationLibraryResult) => client.asset(result.asset.identity),
  };
}
