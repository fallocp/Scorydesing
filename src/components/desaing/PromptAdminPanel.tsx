import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DesignServerClient } from '@/lib/desaing/serverClient';
import { DesignServerClientError } from '@/lib/desaing/serverClient';
import { PromptAdminComparison } from './PromptAdminComparison';
import { newPromptAdminDraft, type PromptAdminDraft, type PromptAdminRead, type PromptAdminMutation,
  type PromptAdminReviewInput, type PromptAdminEvidence } from '../../../supabase/functions/_shared/desaing/promptAdmin';
import { assertPromptAdminPending, assertPromptAdminRecovery, currentPromptAdminTest, isPromptAdminDefinitiveRefusal,
  promptLineDiff, samePromptValue, type PromptAdminPending, type PromptAdminAction } from '@/lib/desaing/promptAdminPanelState';
import './PromptAdminPanel.css';

function message(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
  return ({
    prompt_admin_forbidden: 'La publicación de prompts requiere el permiso administrativo específico de Fai.',
    prompt_admin_disabled: 'La administración de prompts no está disponible ahora. El historial permanece guardado.',
    prompt_admin_revision_conflict: 'Otra pestaña cambió el borrador. Recupera lo guardado antes de continuar.',
    prompt_admin_base_changed: 'Cambió la versión publicada. Recupera la versión actual y prepara una propuesta sobre esa base.',
    prompt_admin_evidence_invalid: 'La evidencia debe ser una imagen generada y aprobada de este negocio.',
    prompt_admin_comparison_required: 'Revisa y aprueba las dos imágenes de la comparación para esta revisión antes de publicar.',
    prompt_admin_test_invalid: 'Esta prueba no corresponde al borrador vigente. Guarda y prepara otra comparación.',
    prompt_admin_review_invalid: 'La revisión no coincide con las dos imágenes aprobadas de la comparación.',
    prompt_admin_unchanged: 'La propuesta debe cambiar el texto publicado.',
    prompt_admin_context_too_large: 'El prompt o el caso de prueba supera el espacio permitido. Acorta el caso sin omitir restricciones.',
    prompt_admin_request_conflict: 'Esta solicitud ya corresponde a otro contenido. Recupera su resultado antes de continuar.',
    invalid_prompt_admin_request: 'Revisa la evidencia, los campos y los límites de la propuesta.',
    prompt_admin_pending_invalid: 'No se pudo validar la solicitud pendiente de este navegador. Se bloqueó la publicación; conserva el almacenamiento y vuelve a abrir el panel.',
    prompt_admin_recovery_mismatch: 'La recuperación no coincide con la solicitud original. La edición seguirá bloqueada hasta verificar su resultado.',
    prompt_admin_storage_unavailable: 'No se pudo conservar la solicitud en este navegador. Habilita el almacenamiento antes de guardar.',
    server_session_changed: 'Cambió tu sesión. Se ocultó la información; vuelve a abrir el editor con la cuenta correspondiente.',
  } as Record<string, string>)[code] ?? 'No se confirmó la respuesta. Recupera la solicitud pendiente antes de hacer otro cambio.';
}
const evidenceKey = (item: PromptAdminEvidence) => `${item.asset.asset_id}:${item.asset.version_id}`;

export function PromptAdminPanel({ client, businessId }: { client: DesignServerClient; businessId: string }) {
  const api = useMemo(() => client.promptAdmin?.(businessId), [client, businessId]), queryClient = useQueryClient();
  const [data, setData] = useState<PromptAdminRead | null>(null), [draft, setDraft] = useState<PromptAdminDraft | null>(null);
  const [actor, setActor] = useState(''), [family, setFamily] = useState('general');
  const [pending, setPending] = useState<PromptAdminPending | null>(null), [invalidPending, setInvalidPending] = useState(false);
  const [busy, setBusy] = useState(false), [comparisonBusy, setComparisonBusy] = useState(false), [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [instruction, setInstruction] = useState(''), [copy, setCopy] = useState(''), [withReference, setWithReference] = useState(false);
  const [executor, setExecutor] = useState<'image_api' | 'responses_image'>('image_api');
  const [revertId, setRevertId] = useState(''), [reason, setReason] = useState(''), [preview, setPreview] = useState<string | null>(null);
  const [discardReason, setDiscardReason] = useState('');
  const alive = useRef(true), scope = useRef({ businessId, actorId: '' }), running = useRef(false);
  const pendingRef = useRef<PromptAdminPending | null>(null);
  const storageKey = (actorId: string) => `scory-prompt-admin:${businessId}:${actorId}`;
  function forget() { if (!alive.current) return; setBlocked(true); setData(null); setDraft(null); setActor(''); setPending(null);
    setPreview(null); setCopy(''); setInstruction(''); setReason(''); setNotice(''); setError(message(new Error('server_session_changed'))); }
  async function verifyActor(expected = scope.current.actorId) {
    const session = await client.session();
    if (!alive.current || scope.current.businessId !== businessId || expected && session.actorId !== expected) {
      forget(); throw new DesignServerClientError('server_session_changed');
    }
    return session.actorId;
  }
  function keepPending(value: PromptAdminPending | null, actorId = scope.current.actorId) {
    try { if (value) localStorage.setItem(storageKey(actorId), JSON.stringify(value)); else localStorage.removeItem(storageKey(actorId)); }
    catch { throw new Error('prompt_admin_storage_unavailable'); }
    pendingRef.current = value; setPending(value);
  }
  function adopt(next: PromptAdminRead) {
    setData(next); setFamily(next.prompt_type); setDraft(next.draft?.status === 'draft' ? structuredClone(next.draft) : null);
    setRevertId(''); setReason('');
  }
  async function read(nextFamily = family) {
    if (!api) throw new Error('prompt_admin_disabled');
    const actorId = await verifyActor(), result = await api.read(nextFamily); await verifyActor(actorId); adopt(result);
    return result;
  }
  async function run(action: () => Promise<void>, rethrow = false) {
    if (running.current || blocked) return;
    running.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (problem) {
      if (alive.current) setError(message(problem));
      if (rethrow) throw problem;
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true; scope.current = { businessId, actorId: '' }; let cancelled = false;
    setBusy(true); setError('');
    void (async () => {
      if (!api) throw new Error('prompt_admin_disabled');
      const actorId = await verifyActor(); if (cancelled) return;
      scope.current.actorId = actorId; setActor(actorId);
      const caps = await api.capabilities(); await verifyActor(actorId);
      if (cancelled) return;
      if (!caps.governed || !caps.can_manage) throw new Error('prompt_admin_forbidden');
      let remembered: PromptAdminPending | null = null;
      const serialized = localStorage.getItem(storageKey(actorId));
      if (serialized) {
        try { remembered = JSON.parse(serialized); assertPromptAdminPending(remembered, businessId, actorId); }
        catch { setInvalidPending(true); throw new Error('prompt_admin_pending_invalid'); }
      }
      pendingRef.current = remembered; setPending(remembered);
      const target = remembered?.prompt_type ?? 'general';
      await read(target);
    })().catch(problem => { if (!cancelled) setError(message(problem)); }).finally(() => { if (!cancelled) setBusy(false); });
    const check = () => { if (scope.current.actorId) void verifyActor().catch(() => forget()); };
    window.addEventListener('focus', check); window.addEventListener('storage', check); document.addEventListener('visibilitychange', check);
    return () => { cancelled = true; alive.current = false; window.removeEventListener('focus', check); window.removeEventListener('storage', check); document.removeEventListener('visibilitychange', check); };
  }, [client, businessId, api]);

  const evidence = data?.evidence.find(item => draft && samePromptValue(item.asset, draft.evidence_asset)) ?? null;
  useEffect(() => {
    setPreview(null); if (!evidence || !actor || blocked) return; let cancelled = false, url: string | null = null;
    void (async () => { try { await verifyActor(actor); const blob = await client.asset(evidence.asset); await verifyActor(actor);
      if (!cancelled) { url = URL.createObjectURL(blob); setPreview(url); } } catch { /* Identity remains visible if preview cannot be loaded. */ } })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [evidence?.asset.asset_id, evidence?.asset.version_id, actor, blocked, client]);

  async function complete(envelope: PromptAdminPending, result: PromptAdminMutation) {
    await verifyActor(); assertPromptAdminRecovery(envelope, result, scope.current.actorId);
    keepPending(null);
    if (result.kind === 'save') { setDraft(structuredClone(result.result)); setData(current => current ? { ...current, draft: result.result } : current); }
    if (result.kind === 'discard') { setDraft(null); setDiscardReason(''); setData(current => current ? { ...current, draft: null } : current); }
    if (result.kind === 'test') setData(current => current ? { ...current, tests: [result.result, ...current.tests.filter(item => item.id !== result.result.id)] } : current);
    if (result.kind === 'review') setData(current => current ? { ...current, reviews: [result.result, ...current.reviews.filter(item => item.id !== result.result.id)] } : current);
    if (result.kind === 'publish' || result.kind === 'revert') {
      setDraft(null); setData(current => current ? { ...current, base: { id: result.result.published.id, version: result.result.published.version,
        text: result.result.published.text, hash: result.result.published.hash }, draft: null, receipts: [result.result, ...current.receipts.filter(item => item.request_id !== result.request_id)] } : current);
      setNotice(`Publicación confirmada: versión ${result.result.published.version}. Las imágenes aprobadas conservan su versión.`);
      void queryClient.invalidateQueries({ queryKey: ['master-prompt', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['master-prompt-history', businessId] });
      void queryClient.invalidateQueries({ queryKey: ['image-style-prompts', businessId] });
    } else setNotice(result.kind === 'save' ? 'Borrador guardado. El prompt publicado conserva su versión.' : result.kind === 'discard' ? 'Propuesta descartada. El prompt publicado conserva su versión y puedes preparar una propuesta nueva.' : result.kind === 'test' ? 'Prueba estructural preparada sin generar imágenes.' : 'Revisión visual guardada. Publicar requiere la acción siguiente.');
    const target = envelope.prompt_type;
    try { await read(target); } catch { setError('La acción quedó confirmada. Recupera el editor para actualizar la vista.'); }
  }
  async function dispatch(action: PromptAdminAction | PromptAdminPending) {
    const envelope: PromptAdminPending = { ...action, prompt_type: 'prompt_type' in action ? action.prompt_type : family };
    if (!api) throw new Error('prompt_admin_disabled');
    const actorId = await verifyActor(); assertPromptAdminPending(envelope, businessId, actorId);
    if (pendingRef.current && !samePromptValue(pendingRef.current, envelope)) throw new Error('prompt_admin_request_conflict');
    keepPending(envelope);
    try {
      let result: PromptAdminMutation;
      switch (envelope.kind) {
        case 'save': result = { kind: 'save', request_id: envelope.input.request_id, result: await api.save(envelope.input) }; break;
        case 'test': result = { kind: 'test', request_id: envelope.input.request_id, result: await api.test(envelope.input) }; break;
        case 'review': result = { kind: 'review', request_id: envelope.input.request_id, result: await api.review(envelope.input) }; break;
        case 'publish': result = { kind: 'publish', request_id: envelope.input.request_id, result: await api.publish(envelope.input) }; break;
        case 'revert': result = { kind: 'revert', request_id: envelope.input.request_id, result: await api.revert(envelope.input) }; break;
        case 'discard': result = { kind: 'discard', request_id: envelope.input.request_id, result: await api.discard(envelope.input) }; break;
      }
      await verifyActor(actorId); await complete(envelope, result);
    } catch (problem) { if (isPromptAdminDefinitiveRefusal(problem)) { await verifyActor(actorId); keepPending(null); } throw problem; }
  }
  async function recover() {
    const envelope = pendingRef.current;
    if (!envelope || !api) { await read(); return; }
    const actorId = await verifyActor(), result = await api.recover(envelope.input.request_id); await verifyActor(actorId);
    if (result) await complete(envelope, result);
    else setNotice('Aún no hay un resultado confirmado. Puedes volver a consultar o reenviar exactamente la misma solicitud; su identificador se conserva.');
  }
  const dirty = !!draft && !samePromptValue(draft, data?.draft), frozen = busy || comparisonBusy || !!pending || invalidPending || blocked;
  const test = data ? currentPromptAdminTest(data, draft) : null;
  const baseCurrent = !!draft && !!data && samePromptValue(draft.base, data.base);
  const review = test ? data?.reviews.find(item => item.test_id === test.id && item.test_hash === test.test_hash) : undefined;
  const canPublish = !!test && !!review && review.decision === 'approved' && test.corpus.checks.every(check => check.passed);
  function change<K extends keyof PromptAdminDraft>(key: K, value: PromptAdminDraft[K]) { if (!frozen && draft) setDraft({ ...draft, [key]: value }); }
  function startDraft() {
    if (!data?.evidence.length || !actor || frozen) return;
    setDraft(newPromptAdminDraft(businessId, actor, family, data.base, data.evidence[0].asset));
  }
  function save() { if (draft) return dispatch({ kind: 'save', input: { business_id: businessId, request_id: crypto.randomUUID(), expected_revision: draft.revision, draft: structuredClone(draft) } }); }
  async function prepareTest() {
    if (!draft || dirty) return;
    await dispatch({ kind: 'test', input: { business_id: businessId, request_id: crypto.randomUUID(), draft_id: draft.id,
      expected_revision: draft.revision, executor, visual_case: { instruction, approved_copy: copy,
        references: withReference && evidence ? [{ ...evidence.asset, reference_id: 'approved-evidence', mime_type: 'image/png', roles: ['image_style_reference'] }] : [] } } });
  }
  async function reviewComparison(input: PromptAdminReviewInput) { await run(() => dispatch({ kind: 'review', input }), true); }

  if (blocked) return <section className="pad-panel"><p role="alert">{error}</p></section>;
  return <section className="pad-panel" aria-label="Administración de prompts">
    <header><div><h2>Propuestas del prompt maestro</h2><p>Una familia de este negocio por propuesta. Guardar el borrador y aprobar una imagen no publican el prompt.</p></div>
      <button type="button" disabled={busy || comparisonBusy || invalidPending || dirty && !pending} onClick={() => void run(recover)}>Recuperar editor</button></header>
    {error && <p role="alert" className="pad-error">{error}</p>}{notice && <p role="status" className="pad-notice">{notice}</p>}
    {pending && <div className="pad-pending"><strong>Solicitud pendiente de confirmar: {pending.kind}</strong><p>El contenido permanece congelado mientras recuperas esta solicitud.</p>
      <button disabled={busy || comparisonBusy} onClick={() => void run(recover)}>Consultar resultado</button>
      <button disabled={busy || comparisonBusy} onClick={() => void run(() => dispatch(pending))}>Reenviar misma solicitud</button></div>}
    {!data && !error && <p>Cargando permisos, propuestas e historial…</p>}
    {data && <>
      <div className="pad-toolbar"><label>Familia del prompt<select aria-label="Familia del prompt" value={family} disabled={frozen || dirty} onChange={event => void run(() => read(event.target.value).then(() => undefined))}>
        {data.prompt_types.map(type => <option key={type} value={type}>{type === 'general' ? 'General' : type}</option>)}</select></label><span>Publicado: v{data.base.version}</span></div>
      <details><summary>Texto publicado actual</summary><pre>{data.base.text}</pre></details>
      {!draft && <div className="pad-empty"><p>Elige una imagen generada y aprobada como evidencia para preparar una propuesta.</p>
        {!data.evidence.length && <p>No hay evidencia aprobada disponible en este negocio. Las preferencias del cliente siguen siendo independientes del prompt maestro.</p>}
        <button disabled={frozen || !data.evidence.length} onClick={startDraft}>Crear propuesta</button></div>}
      {draft && <>
        {!baseCurrent && <p role="alert" className="pad-error">La base publicada cambió. Conserva tus cambios para revisarlos; esta propuesta ya no puede publicarse sobre la base anterior.</p>}
        <fieldset disabled={frozen} className="pad-fields"><legend>Evidencia y diagnóstico</legend>
          <label>Imagen aprobada<select aria-label="Imagen aprobada de evidencia" value={evidence ? evidenceKey(evidence) : ''} onChange={event => { const selected = data.evidence.find(item => evidenceKey(item) === event.target.value); if (selected) change('evidence_asset', selected.asset); }}>
            {!evidence && <option value="">Evidencia no disponible</option>}{data.evidence.map(item => <option key={evidenceKey(item)} value={evidenceKey(item)}>{item.asset.asset_id} · {item.asset.version_id.slice(0, 12)}</option>)}</select></label>
          <label>Origen del problema<select aria-label="Origen del problema" value={draft.diagnosis} onChange={event => change('diagnosis', event.target.value as PromptAdminDraft['diagnosis'])}>
            {Object.entries({ copy: 'Texto', reference: 'Referencia', prompt: 'Prompt', render: 'Render', composition: 'Composición', export: 'Exportación' }).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {preview && <img className="pad-evidence" src={preview} alt="Imagen aprobada elegida como evidencia" />}
          {evidence && <div className="pad-evidence-info"><p>Origen del prompt maestro no registrado para esta imagen. El prompt efectivo y su revisión sí forman parte de la evidencia.</p>
            <details><summary>Prompt efectivo de la imagen</summary><pre>{evidence.effective_prompt}</pre></details>
            {evidence.revised_prompt && <details><summary>Prompt revisado por el modelo</summary><pre>{evidence.revised_prompt}</pre></details>}</div>}
          {([['repeat', 'Qué repetir'], ['avoid', 'Qué evitar'], ['hypothesis', 'Hipótesis del cambio'], ['benefit', 'Beneficio esperado'], ['risks', 'Riesgos y regresiones']] as const).map(([key, label]) =>
            <label key={key}>{label}<textarea aria-label={label} value={draft[key]} maxLength={4000} rows={3} onChange={event => change(key, event.target.value)} /></label>)}
        </fieldset>
        <fieldset disabled={frozen}><legend>Propuesta de texto · base v{draft.base.version}</legend>
          <label>Nuevo prompt<textarea aria-label="Nuevo prompt" className="pad-prompt" value={draft.new_text} maxLength={64000} rows={14} onChange={event => change('new_text', event.target.value)} /></label>
          <details open><summary>Diferencias literales con la base de la propuesta</summary><pre className="pad-diff">{promptLineDiff(draft.base.text, draft.new_text).map((line, index) => <span key={index} className={`pad-diff-${line.kind}`}>{line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}{line.text}{'\n'}</span>)}</pre></details>
        </fieldset>
        <div className="pad-actions"><button disabled={frozen || !dirty || !draft.new_text.trim() || !evidence || !baseCurrent} onClick={() => void run(async () => { await save(); })}>Guardar borrador</button>
          {dirty && <button disabled={frozen} onClick={() => setDraft(data.draft?.status === 'draft' ? structuredClone(data.draft) : null)}>Descartar cambios locales</button>}
          {!baseCurrent && <button disabled={frozen} onClick={() => { setDraft({ ...draft, base: structuredClone(data.base) }); setNotice('Base actual cargada. Revisa el diff completo, guarda la propuesta y prepara otra comparación.'); }}>Revisar propuesta sobre la base actual</button>}
          <span>{dirty ? 'Cambios locales sin guardar; la comparación anterior no autoriza publicarlos.' : `Borrador guardado · revisión ${draft.revision}`}</span></div>
        {draft.revision > 0 && <details><summary>Descartar esta propuesta guardada</summary><p>Se conserva el historial. La propuesta y sus pruebas dejarán de autorizar publicaciones.</p>
          <label>Motivo para descartar<textarea aria-label="Motivo para descartar propuesta" value={discardReason} disabled={frozen} maxLength={4000} rows={2} onChange={event => setDiscardReason(event.target.value)} /></label>
          <button disabled={frozen || !discardReason.trim()} onClick={() => void run(() => dispatch({ kind: 'discard', input: { business_id: businessId, request_id: crypto.randomUUID(), draft_id: draft.id, expected_revision: draft.revision, reason: discardReason } }))}>Descartar propuesta</button></details>}
        <fieldset disabled={frozen || dirty || draft.revision === 0}><legend>Prueba estructural y caso de comparación</legend>
          <p>La prueba estructural es gratuita. La comparación visual requiere dos imágenes y autorización explícita; respeta el presupuesto disponible.</p>
          <label>Encargo del caso fijo<textarea aria-label="Encargo del caso fijo" value={instruction} maxLength={2000} rows={3} onChange={event => setInstruction(event.target.value)} /></label>
          <label>Texto literal aprobado<textarea aria-label="Texto literal aprobado para comparación" value={copy} maxLength={2000} rows={2} onChange={event => setCopy(event.target.value)} /></label>
          <label className="pad-check"><input type="checkbox" checked={withReference} onChange={event => setWithReference(event.target.checked)} />Usar la imagen de evidencia como referencia de estilo en ambos resultados</label>
          <label>Motor de la comparación<select aria-label="Motor de la comparación" value={executor} onChange={event => setExecutor(event.target.value as typeof executor)}><option value="image_api">Image API</option><option value="responses_image">Responses con imágenes</option></select></label>
          <button disabled={frozen || dirty || !instruction.trim() || !baseCurrent} onClick={() => void run(prepareTest)}>Preparar prueba sin imágenes</button>
        </fieldset>
        {test && <><div className="pad-corpus"><h3>Prueba estructural de la revisión {test.draft_revision}</h3><ul>{test.corpus.checks.map(check => <li key={check.id}>{check.passed ? '✓' : '✕'} {check.message}</li>)}</ul>
          <details><summary>Caso congelado de esta comparación</summary><p>{test.visual_case.instruction}</p><pre>{test.visual_case.approved_copy}</pre><p>{test.visual_case.references.length} referencias · {test.executor}</p></details></div>
          <PromptAdminComparison key={test.id} client={client} test={test} review={review} disabled={busy || !!pending || invalidPending || blocked} onBusyChange={setComparisonBusy} onReview={reviewComparison} />
          <button className="pad-publish" disabled={frozen || !canPublish} onClick={() => void run(() => dispatch({ kind: 'publish', input: { business_id: businessId, request_id: crypto.randomUUID(), draft_id: draft.id, expected_revision: draft.revision, test_id: test.id, test_hash: test.test_hash, review_id: review!.id } }))}>Publicar esta revisión del prompt</button>
          {!canPublish && <p>La publicación requiere prueba estructural válida, ambas imágenes aprobadas y evaluación visual favorable para esta revisión exacta.</p>}
        </>}
      </>}
      <details className="pad-history"><summary>Versiones publicadas y reversión</summary><p>Revertir crea una versión nueva. Se conserva el historial y las imágenes existentes.</p>
        <label>Versión que deseas recuperar<select aria-label="Versión para revertir" value={revertId} disabled={frozen || dirty} onChange={event => setRevertId(event.target.value)}><option value="">Selecciona una versión</option>{data.versions.filter(version => version.id !== data.base.id).map(version => <option key={version.id} value={version.id}>v{version.version} · {version.created_at ? new Date(version.created_at).toLocaleString() : 'Sin fecha'}</option>)}</select></label>
        {revertId && <pre>{data.versions.find(version => version.id === revertId)?.text}</pre>}
        <label>Motivo de la reversión<textarea aria-label="Motivo de la reversión" value={reason} disabled={frozen || dirty} maxLength={4000} rows={3} onChange={event => setReason(event.target.value)} /></label>
        <button disabled={frozen || dirty || !revertId || !reason.trim()} onClick={() => void run(() => dispatch({ kind: 'revert', input: { business_id: businessId, request_id: crypto.randomUUID(), prompt_type: family, expected_base_hash: data.base.hash, expected_base_id: data.base.id, expected_base_version: data.base.version, version_id: revertId, reason } }))}>Revertir como nueva versión</button>
        {data.receipts.map(receipt => <article key={receipt.request_id}><strong>v{receipt.published.version} · {receipt.kind === 'revert' ? 'Reversión' : 'Publicación'}</strong><p>{new Date(receipt.published_at).toLocaleString()} · {receipt.reason || `Propuesta revisión ${receipt.draft_revision}`}</p></article>)}
      </details>
    </>}
  </section>;
}
