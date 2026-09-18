import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Plus, Trash2, X } from 'lucide-react';
import type { DesignServerClient } from '@/lib/desaing/serverClient';
import type { PresentationSlide } from '@/lib/presentations/presentationDocument';
import { buildReviewedPresentation, deckComposerRowHash, extractPresentationTemplate, makeDeckComposerRow,
  renderPresentationTemplate, type DeckComposerRow } from '@/lib/presentations/presentationTemplate';
import { assertDeckComposerDraft, deckComposerPublicationHash, makeDeckComposerDraft, openDeckComposerStore,
  type DeckComposerDraft, type DeckComposerRecord } from '@/lib/presentations/deckComposerStore';
import './DeckComposerPanel.css';

export interface DeckComposerPanelProps {
  businessId: string;
  documentId: string;
  source: PresentationSlide;
  client: DesignServerClient;
  onApply(slides: PresentationSlide[], name: string, draftId: string): Promise<void>;
  onClose(): void;
}
type Life = { active: boolean; actor: string; store: Awaited<ReturnType<typeof openDeckComposerStore>> | null;
  record: DeckComposerRecord | null; draft: DeckComposerDraft | null; work: Promise<unknown>; blocked: boolean; sessionChanged: boolean; locked: boolean; sequence: number };
const message = (problem: unknown) => {
  const code = problem instanceof Error ? problem.message : '';
  const messages: Record<string, string> = {
    deck_template_without_fields: 'Este diseño no tiene texto HTML editable. Primero conviértelo a HTML o elige una diapositiva con textos separados de la imagen.',
    deck_template_too_many_fields: 'Esta plantilla contiene demasiados campos. Elige una diapositiva más sencilla para reutilizar su diseño.',
    deck_field_too_long: 'Uno de los textos de la plantilla supera los 4.000 caracteres. Acórtalo antes de reutilizarla.',
    deck_copy_too_long: 'El contenido de una diapositiva supera los 20.000 caracteres.',
    deck_revision_conflict: 'Otra pestaña cambió este borrador. Cierra y vuelve a abrir para recuperar sus cambios.',
    deck_content_required: 'Escribe un nombre y al menos un campo de contenido para esta diapositiva.',
    deck_review_required: 'Revisa y aprueba cada diapositiva antes de crear la presentación.',
    deck_store_unavailable: 'No se pudo guardar el borrador en este navegador. Mantén el panel abierto y vuelve a intentar.',
    server_session_changed: 'Cambió tu sesión. Cierra y vuelve a abrir el panel con la cuenta correspondiente.',
  };
  return messages[code] ?? 'No se pudo completar la acción. Conservamos el borrador y el identificador de la presentación para volver a intentar.';
};

function TemplatePreview({ html, width, height, onReady }: { html: string; width: number; height: number; onReady(): void }) {
  const container = useRef<HTMLDivElement>(null), [available, setAvailable] = useState(0);
  useEffect(() => {
    const target = container.current; if (!target) return;
    const observer = new ResizeObserver(() => setAvailable(target.clientWidth)); observer.observe(target);
    setAvailable(target.clientWidth); return () => observer.disconnect();
  }, []);
  return <div ref={container} className="dcp-preview" style={{ aspectRatio: `${width}/${height}` }}>
    <iframe title="Vista previa de la diapositiva" sandbox="" referrerPolicy="no-referrer" srcDoc={html} onLoad={onReady}
      style={{ width, height, transform: `scale(${available / width})` }} />
  </div>;
}

export function DeckComposerPanel({ businessId, documentId, source, client, onApply, onClose }: DeckComposerPanelProps) {
  const [draft, setDraft] = useState<DeckComposerDraft | null>(null), [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [saved, setSaved] = useState(false), [loadedPreview, setLoadedPreview] = useState('');
  const lifeRef = useRef<Life | null>(null);
  const active = (life: Life) => life.active && lifeRef.current === life;
  function ensure(life: Life) { if (!active(life)) throw new Error('deck_view_closed'); if (life.blocked) throw new Error(life.sessionChanged ? 'server_session_changed' : 'deck_revision_conflict'); }
  function invalidateSession(life: Life) {
    life.blocked = true; life.sessionChanged = true; life.draft = null;
    if (active(life)) {
      setDraft(null); setSelected(''); setLoadedPreview(''); setSaved(false); setBusy(false);
      setError(message(new Error('server_session_changed')));
    }
  }
  async function assertSession(life: Life, allowClosed = false) {
    if (life.sessionChanged) throw new Error('server_session_changed');
    try { if ((await client.session()).actorId !== life.actor) throw new Error('server_session_changed'); }
    catch { invalidateSession(life); throw new Error('server_session_changed'); }
    if (life.blocked) throw new Error(life.sessionChanged ? 'server_session_changed' : 'deck_revision_conflict');
    if (!allowClosed) ensure(life);
  }
  function persist(life: Life, value = life.draft) {
    if (!value) return Promise.resolve();
    const frozen = structuredClone(value), sequence = life.sequence;
    const task = life.work.then(async () => {
      if (!life.store || life.blocked) throw new Error(life.sessionChanged ? 'server_session_changed' : life.blocked ? 'deck_revision_conflict' : 'deck_store_unavailable');
      try {
        // A route close may finish its local edit, but an account change may not.
        await assertSession(life, true);
        life.record = await life.store.write(life.record?.revision ?? 0, frozen);
        await assertSession(life, true);
        if (active(life) && sequence === life.sequence) setSaved(true);
      } catch (problem) { if (problem instanceof Error && problem.message === 'deck_revision_conflict') life.blocked = true; throw problem; }
    });
    life.work = task.catch(() => {}); return task;
  }
  function update(change: (value: DeckComposerDraft) => DeckComposerDraft) {
    const life = lifeRef.current; if (!life?.draft || !active(life) || life.locked || life.blocked || life.draft.publication) return;
    const next = change(structuredClone(life.draft));
    try { assertDeckComposerDraft(next, { actor: life.actor, business: businessId, document: documentId, source: source.id }); }
    catch (problem) { setError(message(problem)); return; }
    life.draft = next; life.sequence++; setDraft(next); setSaved(false); setError('');
    void assertSession(life).catch(problem => { if (active(life)) setError(message(problem)); });
  }
  async function run(action: (life: Life) => Promise<void>) {
    const life = lifeRef.current; if (!life || !active(life) || life.locked) return;
    life.locked = true; setBusy(true); setError('');
    try { await life.work; await assertSession(life); await action(life); }
    catch (problem) { if (active(life)) setError(message(problem)); }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  useEffect(() => {
    const life: Life = { active: true, actor: '', store: null, record: null, draft: null, work: Promise.resolve(), blocked: false, sessionChanged: false, locked: true, sequence: 0 };
    lifeRef.current = life; setDraft(null); setSaved(false); setBusy(true); setError('');
    const opening = (async () => {
      life.actor = (await client.session()).actorId;
      const store = await openDeckComposerStore({ actor: life.actor, business: businessId, document: documentId, source: source.id });
      if (!active(life)) { store.close(); return; } life.store = store;
      await assertSession(life); life.record = await store.read(); await assertSession(life);
      if (!life.record) {
        const template = await extractPresentationTemplate(source, businessId); await assertSession(life);
        life.record = await store.write(0, makeDeckComposerDraft(template)); await assertSession(life);
      }
      life.draft = life.record.value; setDraft(life.draft); setSelected(life.draft.rows[0].id); setSaved(true);
    })();
    life.work = opening.catch(problem => { if (active(life)) setError(message(problem)); });
    void life.work.finally(() => { life.locked = false; if (active(life)) setBusy(false); });
    return () => {
      // Finish a pending local edit even if routing or business selection closes the panel.
      if (life.draft && !life.blocked) void persist(life).catch(() => {});
      life.active = false; void life.work.finally(() => life.store?.close());
    };
  }, [businessId, documentId, source.id, client]);
  useEffect(() => {
    const verify = () => {
      const life = lifeRef.current; if (!life?.actor || !active(life) || life.sessionChanged) return;
      void assertSession(life).catch(problem => { if (active(life)) setError(message(problem)); });
    };
    window.addEventListener('focus', verify); window.addEventListener('storage', verify); document.addEventListener('visibilitychange', verify);
    return () => { window.removeEventListener('focus', verify); window.removeEventListener('storage', verify); document.removeEventListener('visibilitychange', verify); };
  }, [client]);
  useEffect(() => {
    const life = lifeRef.current; if (!draft || !life || !active(life) || saved || busy || life.blocked) return;
    const timer = setTimeout(() => { void persist(life).catch(problem => { if (active(life)) setError(message(problem)); }); }, 250);
    return () => clearTimeout(timer);
  }, [draft, saved, busy]);

  const row = draft?.rows.find(item => item.id === selected) ?? draft?.rows[0];
  const preview = useMemo(() => draft && row ? renderPresentationTemplate(draft.template, row) : null, [draft?.template, row]);
  const previewToken = row ? JSON.stringify([row.id, row.title, row.values]) : '';
  const frozen = !!draft?.publication, completed = draft?.publication?.status === 'completed';
  const reviewed = draft?.rows.filter(item => item.reviewed_hash).length ?? 0;
  const locked = busy || !!lifeRef.current?.blocked;
  function changeRow(change: (value: DeckComposerRow) => DeckComposerRow) {
    if (!row) return;
    update(value => ({ ...value, rows: value.rows.map(item => item.id === row.id ? { ...change(item), reviewed_hash: null } : item) }));
  }
  function addRow(duplicate: boolean) {
    if (!draft || !row || draft.rows.length >= 20) return;
    const next = duplicate ? { ...structuredClone(row), id: crypto.randomUUID(), title: `${row.title.slice(0, 150)} (copia)`, reviewed_hash: null }
      : makeDeckComposerRow(draft.template, `Diapositiva ${draft.rows.length + 1}`);
    update(value => ({ ...value, rows: [...value.rows, next] })); setSelected(next.id);
  }
  const close = () => {
    const life = lifeRef.current;
    if (!life?.draft || life.blocked) { onClose(); return; }
    void run(async current => { await persist(current); ensure(current); onClose(); });
  };
  return <div className="dcp-overlay"><section className="dcp-dialog" role="dialog" aria-modal="true" aria-labelledby="dcp-title">
    <header className="dcp-header"><div><h2 id="dcp-title">Crear presentación completa</h2>
      <p>Reutiliza este diseño y sus imágenes. Edita y revisa de 2 a 20 diapositivas antes de crear un proyecto nuevo.</p></div>
      <button className="dcp-icon" aria-label="Cerrar creador de presentación" disabled={busy} onClick={close}><X size={20} /></button></header>
    {draft && row && preview ? <div className="dcp-body"><aside className="dcp-sidebar">
      <label>Nombre de la presentación<input aria-label="Nombre de la presentación nueva" value={draft.name} maxLength={160} disabled={locked || frozen}
        onChange={event => update(value => ({ ...value, name: event.target.value }))} /></label>
      <div className="dcp-source"><strong>Diseño: {draft.template.source.title}</strong><span>Versión {draft.template.source.revision} · {draft.template.fields.length} campos editables</span>
        {draft.template.source.revision !== source.revision && <span>Recuperamos el diseño guardado con este borrador.</span>}</div>
      <label className="dcp-check"><input type="checkbox" checked={draft.template_reviewed} disabled={locked || frozen}
        onChange={event => update(value => ({ ...value, template_reviewed: event.target.checked,
          rows: event.target.checked ? value.rows : value.rows.map(item => ({ ...item, reviewed_hash: null })) }))} />
        He revisado este diseño y quiero reutilizarlo.</label>
      <p className="dcp-note">Preparar las diapositivas y reutilizar las imágenes no genera llamadas de IA.</p>
      <nav aria-label="Diapositivas de la nueva presentación" className="dcp-rows">{draft.rows.map((item, index) => <button key={item.id}
        aria-current={item.id === row.id ? 'page' : undefined} disabled={busy} onClick={() => setSelected(item.id)}>
        <span>{index + 1}. {item.title || 'Sin nombre'}</span><small>{item.reviewed_hash ? 'Revisada' : 'Por revisar'}</small></button>)}</nav>
      <div className="dcp-actions"><button disabled={locked || frozen || draft.rows.length >= 20} onClick={() => addRow(false)}><Plus size={15} />Añadir diapositiva</button>
        <button disabled={locked || frozen || draft.rows.length >= 20} onClick={() => addRow(true)}><Copy size={15} />Duplicar esta</button></div>
      <p className="dcp-note">{reviewed} de {draft.rows.length} revisadas · {saved ? 'Borrador guardado en este navegador' : 'Guardando borrador…'}</p>
    </aside><main className="dcp-content">
      <div className="dcp-row-header"><label>Nombre de la diapositiva<input aria-label="Nombre de la diapositiva" value={row.title} maxLength={160} disabled={locked || frozen}
        onChange={event => changeRow(value => ({ ...value, title: event.target.value }))} /></label>
        <div className="dcp-actions">{([-1, 1] as const).map(direction => <button key={direction} aria-label={direction < 0 ? 'Subir diapositiva' : 'Bajar diapositiva'}
          disabled={locked || frozen || draft.rows.indexOf(row) + direction < 0 || draft.rows.indexOf(row) + direction >= draft.rows.length}
          onClick={() => update(value => { const index = value.rows.findIndex(item => item.id === row.id), next = index + direction;
            [value.rows[index], value.rows[next]] = [value.rows[next], value.rows[index]]; return value; })}>{direction < 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}</button>)}
          <button aria-label="Eliminar diapositiva del borrador" disabled={locked || frozen || draft.rows.length <= 2}
            onClick={() => { const next = draft.rows.find(item => item.id !== row.id)!; update(value => ({ ...value, rows: value.rows.filter(item => item.id !== row.id) })); setSelected(next.id); }}><Trash2 size={16} /></button></div></div>
      <TemplatePreview key={previewToken} html={preview.html} width={draft.template.canvas.width} height={draft.template.canvas.height}
        onReady={() => setLoadedPreview(previewToken)} />
      <p className="dcp-note">Los textos permanecen editables. Revisa saltos de línea, espacio y contenido; las imágenes y el diseño son los de la plantilla.</p>
      <div className="dcp-fields">{draft.template.fields.map(field => <label key={field.id}>{field.label}<textarea aria-label={`Texto ${field.label}`}
        value={row.values[field.id]} maxLength={4000} rows={row.values[field.id].length > 160 ? 4 : 2} disabled={locked || frozen}
        onChange={event => changeRow(value => ({ ...value, values: { ...value.values, [field.id]: event.target.value } }))} /></label>)}</div>
      <button className="dcp-primary dcp-review" disabled={locked || frozen || !draft.template_reviewed || loadedPreview !== previewToken || !!row.reviewed_hash}
        onClick={() => void run(async life => {
          const current = structuredClone(life.draft!), chosen = current.rows.find(item => item.id === row.id)!;
          if (!chosen.title.trim() || !Object.values(chosen.values).some(value => value.trim())) throw new Error('deck_content_required');
          chosen.reviewed_hash = await deckComposerRowHash(current.template, chosen); ensure(life);
          life.draft = current; life.sequence++; setDraft(current); setSaved(false); await persist(life, current);
        })}><Check size={16} />{row.reviewed_hash ? 'Diapositiva revisada' : 'Aprobar esta diapositiva'}</button>
    </main></div> : <div className="dcp-empty">{busy ? 'Abriendo el borrador de la presentación…' : 'Elige una diapositiva con HTML editable para preparar la presentación.'}</div>}
    <footer className="dcp-footer"><div>{error && <p className="dcp-error" role="alert">{error}</p>}
      {frozen && !completed && <p className="dcp-note">El guardado está pendiente. Al reintentar se comprueba el mismo proyecto, sin crear otra copia.</p>}
      {!frozen && <p className="dcp-note">La presentación abierta permanece intacta. El nuevo proyecto se guarda al pulsar Crear.</p>}
      {completed && <p className="dcp-note">La presentación revisada ya se guardó como proyecto nuevo.</p>}</div>
      {completed ? <button disabled={locked} onClick={() => void run(async life => {
        life.draft = makeDeckComposerDraft(life.draft!.template); life.sequence++; setDraft(life.draft); setSelected(life.draft.rows[0].id); setSaved(false); await persist(life);
      })}>Preparar otra presentación</button> : <button className="dcp-primary" disabled={locked || !draft || !draft.name.trim() || !draft.template_reviewed || reviewed !== draft.rows.length}
        onClick={() => void run(async life => {
          const current = structuredClone(life.draft!);
          const slides = await buildReviewedPresentation(current.template, current.rows); ensure(life);
          await assertSession(life);
          if (!current.publication) current.publication = { fingerprint: await deckComposerPublicationHash(current), status: 'pending' };
          life.draft = current; life.sequence++; setDraft(current); setSaved(false); await persist(life, current); ensure(life);
          await assertSession(life);
          await onApply(slides, current.name, current.id);
          await assertSession(life);
          current.publication.status = 'completed'; life.draft = current; life.sequence++;
          await persist(life, current); if (active(life)) { setDraft(current); onClose(); }
        })}>{busy ? 'Guardando…' : frozen ? 'Reintentar guardar presentación' : 'Crear presentación revisada'}</button>}
    </footer>
  </section></div>;
}
