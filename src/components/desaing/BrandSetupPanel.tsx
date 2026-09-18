import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, FileText, Palette, RefreshCw, Save } from 'lucide-react';
import { MaterialsPanel, type ReviewedMaterialsSelection } from '@/components/desaing/MaterialsPanel';
import { ServerDesignPanel } from '@/components/presentations/ServerDesignPanel';
import type { PresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { PresentationSlide } from '@/lib/presentations/presentationDocument';
import { BRAND_SETUP_CANVAS, assertBrandSetupDraft, assertBrandSetupPublishInput, assertBrandSetupProfile, brandSetupDesignHash,
  buildBrandSetupBrief, newBrandSetupDraft, type BrandSetupDraft, type BrandSetupProfile, type BrandSetupPublishInput,
  type BrandSetupReceipt, type BrandSetupBase } from '../../../supabase/functions/_shared/desaing/onboarding';
import type { DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import { buildReviewedMaterialsSelection } from '@/lib/desaing/materialsPanelState';
import { brandProfileDifferences, isBrandSetupPublicationRefusal, rebaseBrandSetupDraft, suggestBrandSetupProfile } from '@/lib/desaing/brandSetupPanelState';
import { DesignServerClientError } from '@/lib/desaing/serverClient';
import './BrandSetupPanel.css';

interface ProfileFields {
  name: string;
  colors: { primary: string; secondary: string; accent: string };
  fonts: { display: string; body: string; mono: string };
  tone: string;
  audience: string;
  positioning: string;
  style: string;
  restrictions: string[];
  preferences: { increase: string[]; decrease: string[] };
}

const same = (left: unknown, right: unknown) => canonicalExploration(left) === canonicalExploration(right);
const lines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);
const problemCode = (problem: unknown) => problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : problem instanceof Error ? problem.message : '';
function message(problem: unknown): string {
  return ({
    server_session_changed: 'Cambió tu sesión. Vuelve a abrir la dirección de marca con la cuenta correspondiente.',
    onboarding_revision_conflict: 'Otra pestaña modificó este borrador. Recupera la versión guardada antes de continuar.',
    server_onboarding_revision_conflict: 'Otra pestaña modificó este borrador. Recupera la versión guardada antes de continuar.',
    server_onboarding_base_changed: 'Cambió el perfil publicado de este negocio. Recupera el borrador y revisa sus diferencias antes de continuar.',
    server_onboarding_materials_changed: 'Cambió la ficha aprobada. Recupera el borrador y vuelve a incorporar la ficha vigente antes de guardar.',
    server_onboarding_direction_changed: 'La dirección aprobada ya no corresponde a este borrador. Recupera su versión y revisa otra dirección.',
    server_onboarding_publish_conflict: 'La solicitud de guardado corresponde a otra revisión. Recupera el borrador para consultar lo confirmado.',
    server_onboarding_unavailable: 'No se pudo confirmar el guardado del servidor. Conservamos la solicitud; recupera su estado antes de continuar.',
    server_onboarding_invalid_response: 'La respuesta no permite confirmar el guardado. Recupera su estado con la misma solicitud.',
    server_onboarding_brief_too_large: 'La ficha y el perfil superan el espacio disponible para el encargo visual. Selecciona menos hallazgos o resume los campos del perfil antes de confirmar.',
    server_onboarding_context_too_large: 'La ficha elegida supera el espacio disponible. Selecciona menos hallazgos o acorta sus correcciones antes de incorporarla.',
    server_onboarding_direction_required: 'Revisa y aprueba una versión visual en media antes de guardar la dirección de marca.',
    server_onboarding_direction_not_approved: 'Esta versión visual no está aprobada. Recupera el borrador y revisa su resultado antes de guardar.',
    server_onboarding_materials_required: 'Incorpora una ficha aprobada de materiales antes de confirmar el perfil.',
    server_onboarding_outcome_unknown: 'La respuesta no permite confirmar el guardado. Recupera su resultado; conservamos la misma solicitud.',
    onboarding_profile_changed: 'El perfil de este negocio cambió. Recupera el borrador y revisa sus diferencias antes de guardar.',
    onboarding_materials_changed: 'La ficha de materiales cambió. Vuelve a revisarla para usar su versión vigente.',
    onboarding_materials_required: 'Selecciona y aprueba una ficha de materiales para continuar.',
    onboarding_profile_confirmation_required: 'Revisa y confirma los campos del perfil antes de diseñar su dirección.',
    onboarding_direction_required: 'Revisa y aprueba una versión visual en media antes de guardar la dirección de marca.',
    onboarding_direction_stale: 'La dirección visual corresponde a otra versión del perfil. Revisa una propuesta para este borrador.',
    onboarding_publish_unknown: 'El guardado quedó pendiente de confirmar. Recupera el resultado con la misma solicitud.',
    server_response_unknown: 'No se confirmó la respuesta. Recupera lo guardado antes de continuar.',
    business_write_denied: 'Tu acceso permite consultar esta marca; guardar su dirección requiere permisos de edición.',
    onboarding_local_storage_unavailable: 'No se pudo conservar la solicitud de guardado en este navegador. Habilita el almacenamiento antes de guardar la dirección.',
    onboarding_draft_invalid: 'Revisa los campos: colores en formato #RRGGBB y textos dentro de sus límites.',
    invalid_onboarding_request: 'Revisa los campos: colores en formato #RRGGBB, hasta 20 reglas por lista y 500 caracteres por regla.',
    server_invalid_request: 'Revisa los campos del borrador y sus referencias antes de guardar.',
    onboarding_suggestions_too_long: 'Los hallazgos elegidos superan el espacio de un campo. Selecciona menos hallazgos o acorta sus correcciones.',
    design_brief_too_large: 'La ficha y el perfil superan el espacio del encargo visual. Acorta los campos o elige menos hallazgos.',
  } as Record<string, string>)[problemCode(problem)] ?? 'No se pudo completar la acción. El borrador guardado se conserva; recupera su versión antes de continuar.';
}

function ProfileEditor({ value, disabled, onChange }: { value: ProfileFields; disabled: boolean; onChange(value: ProfileFields): void }) {
  const [restrictions, setRestrictions] = useState(value.restrictions.join('\n'));
  const [increase, setIncrease] = useState(value.preferences.increase.join('\n'));
  const [decrease, setDecrease] = useState(value.preferences.decrease.join('\n'));
  useEffect(() => { setRestrictions(value.restrictions.join('\n')); setIncrease(value.preferences.increase.join('\n')); setDecrease(value.preferences.decrease.join('\n')); }, [value]);
  function change<K extends keyof ProfileFields>(key: K, next: ProfileFields[K]) { onChange({ ...value, [key]: next }); }
  return <div className="bsp-fields">
    <label className="bsp-field-wide">Nombre de la marca<input aria-label="Nombre de la marca" value={value.name} maxLength={160} disabled={disabled}
      onChange={event => change('name', event.target.value)} /><span className="bsp-note">Al guardar la dirección también se actualizará el nombre de este negocio.</span></label>
    <div className="bsp-field-wide bsp-colors">{([['primary', 'Principal'], ['secondary', 'Secundario'], ['accent', 'Acento']] as const).map(([key, label]) =>
      <label key={key}>{label}<span className="bsp-color"><span className="bsp-color-swatch" aria-hidden="true" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(value.colors[key]) ? value.colors[key] : 'transparent' }} />
        <input aria-label={`Color ${label.toLowerCase()}`} value={value.colors[key]} maxLength={7} placeholder="#145E62" disabled={disabled}
          onChange={event => change('colors', { ...value.colors, [key]: event.target.value })} /></span></label>)}</div>
    {([['display', 'Tipografía de títulos'], ['body', 'Tipografía de texto'], ['mono', 'Tipografía de cifras o código']] as const).map(([key, label]) =>
      <label key={key}>{label}<input aria-label={label} value={value.fonts[key]} maxLength={120} disabled={disabled}
        onChange={event => change('fonts', { ...value.fonts, [key]: event.target.value })} /></label>)}
    {([['tone', 'Tono de comunicación'], ['audience', 'Audiencia'], ['positioning', 'Posicionamiento'], ['style', 'Estilo visual']] as const).map(([key, label]) =>
      <label key={key}>{label}<textarea aria-label={label} value={value[key]} maxLength={2000} rows={3} disabled={disabled} onChange={event => change(key, event.target.value)} /></label>)}
    <label className="bsp-field-wide">Restricciones que conservar<textarea aria-label="Restricciones de marca" value={restrictions} maxLength={4000} rows={3} disabled={disabled}
      onChange={event => setRestrictions(event.target.value)} onBlur={() => { if (!same(lines(restrictions), value.restrictions)) change('restrictions', lines(restrictions)); }} /><span className="bsp-note">Una regla por línea. Estas decisiones de marca no sustituyen las reglas administrativas de cumplimiento.</span></label>
    <label>Favorecer en los diseños<textarea aria-label="Preferencias a favorecer" value={increase} maxLength={4000} rows={3} disabled={disabled} onChange={event => setIncrease(event.target.value)}
      onBlur={() => { if (!same(lines(increase), value.preferences.increase)) change('preferences', { ...value.preferences, increase: lines(increase) }); }} /></label>
    <label>Evitar en los diseños<textarea aria-label="Preferencias a evitar" value={decrease} maxLength={4000} rows={3} disabled={disabled} onChange={event => setDecrease(event.target.value)}
      onBlur={() => { if (!same(lines(decrease), value.preferences.decrease)) change('preferences', { ...value.preferences, decrease: lines(decrease) }); }} /></label>
  </div>;
}

export interface BrandSetupPanelProps { service: PresentationDesignService; businessId: string; onClose?(): void; onSaved?(receipt: BrandSetupReceipt): Promise<void> }

type PendingPublication = { schema_version: 1; actor_id: string; input: BrandSetupPublishInput; draft: BrandSetupDraft };
type Life = { active: boolean; actor: string; draft: BrandSetupDraft | null; base: BrandSetupBase | null; canWrite: boolean;
  locked: boolean; blocked: boolean; sessionChanged: boolean; pending: PendingPublication | null };
const publicationKey = (businessId: string, actor: string) => `scory-brand-setup-publication:${businessId}:${actor}`;
function readPublication(businessId: string, actor: string): PendingPublication | null {
  const raw = localStorage.getItem(publicationKey(businessId, actor)); if (!raw) return null;
  const value: PendingPublication = JSON.parse(raw); assertBrandSetupPublishInput(value.input); assertBrandSetupDraft(value.draft);
  if (value.schema_version !== 1 || value.actor_id !== actor || value.draft.actor_id !== actor || value.input.business_id !== businessId
    || value.draft.business_id !== businessId || value.input.draft_id !== value.draft.id || value.input.expected_revision !== value.draft.revision
    || value.input.publish_id !== value.draft.id || value.draft.status !== 'draft') throw new Error('onboarding_draft_invalid');
  return value;
}
function writePublication(value: PendingPublication) {
  try { const key = publicationKey(value.input.business_id, value.actor_id), raw = JSON.stringify(value); localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error('storage unavailable'); }
  catch { throw new Error('onboarding_local_storage_unavailable'); }
}
function clearPublication(businessId: string, actor: string) {
  // A durable receipt remains authoritative even if the browser cannot remove its recovery marker.
  try { localStorage.removeItem(publicationKey(businessId, actor)); } catch { /* The next server read still recovers the same receipt. */ }
}
function designCanvas(draft: BrandSetupDraft): PresentationSlide {
  return { id: draft.page_id, revision: draft.design_revision, title: `Dirección visual de ${draft.profile.name}`,
    html: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${BRAND_SETUP_CANVAS.width}px;height:${BRAND_SETUP_CANVAS.height}px;overflow:hidden;background:#fff}.lab-canvas{width:${BRAND_SETUP_CANVAS.width}px;height:${BRAND_SETUP_CANVAS.height}px;position:relative}</style></head><body><main class="lab-canvas"></main></body></html>`, mounted_assets: [] };
}

export function BrandSetupPanel({ service, businessId, onClose, onSaved }: BrandSetupPanelProps) {
  const api = useMemo(() => service.client.onboarding?.(businessId), [service.client, businessId]);
  const [draft, setDraft] = useState<BrandSetupDraft | null>(null), [profile, setProfile] = useState<BrandSetupProfile | null>(null);
  const [base, setBase] = useState<BrandSetupBase | null>(null);
  const [baseReview, setBaseReview] = useState<{ base: BrandSetupBase; profile: BrandSetupProfile; draftId: string; revision: number; materialsCurrent: boolean } | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [canWrite, setCanWrite] = useState(false), [pending, setPending] = useState<PendingPublication | null>(null);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [visual, setVisual] = useState<{ draft: BrandSetupDraft; destination: DesignSurfaceDestination } | null>(null);
  const [preview, setPreview] = useState<string | null>(null), [previewError, setPreviewError] = useState(false);
  const lifeRef = useRef<Life | null>(null), profileRef = useRef(profile), materialsTrigger = useRef<HTMLButtonElement>(null);
  profileRef.current = profile;
  const active = (life: Life) => life.active && lifeRef.current === life;
  function ensure(life: Life) { if (!active(life)) throw new Error('onboarding_view_closed'); if (life.sessionChanged) throw new Error('server_session_changed'); }
  function invalidateSession(life: Life) {
    life.sessionChanged = true; life.blocked = true; life.draft = null; life.base = null; life.pending = null;
    if (active(life)) { setDraft(null); setProfile(null); setBase(null); setBaseReview(null); setPending(null); setCanWrite(false); setMaterialsOpen(false); setVisual(null);
      setPreview(null); setPreviewError(false); setNotice(''); setError(message(new Error('server_session_changed'))); }
  }
  async function verifyActor(life: Life) {
    ensure(life); try { if ((await service.client.session()).actorId !== life.actor) throw new Error('server_session_changed'); }
    catch { invalidateSession(life); throw new Error('server_session_changed'); } ensure(life);
  }
  function adopt(life: Life, next: BrandSetupDraft) {
    ensure(life); assertBrandSetupDraft(next);
    if (next.business_id !== businessId || next.actor_id !== life.actor) { invalidateSession(life); throw new Error('server_session_changed'); }
    life.draft = next; setDraft(next); setProfile(structuredClone(next.profile)); profileRef.current = structuredClone(next.profile);
  }
  async function refresh(life: Life) {
    if (!api) throw new Error('onboarding_unavailable'); await verifyActor(life);
    const response = await api.read(); await verifyActor(life); life.base = response.base; setBase(response.base); setBaseReview(null); life.canWrite = response.can_write; setCanWrite(response.can_write);
    const next = response.draft ?? newBrandSetupDraft(businessId, life.actor, response.base);
    if (next.status === 'published' && next.receipt) {
      clearPublication(businessId, life.actor); life.pending = null; setPending(null); adopt(life, next);
      if (onSaved) { try { await onSaved(next.receipt); } catch { if (active(life) && !life.sessionChanged) setNotice('La dirección está guardada. Vuelve a abrir la página para actualizar los datos del negocio.'); } ensure(life); }
    } else {
      const stored = readPublication(businessId, life.actor);
      if (stored) { life.pending = stored; setPending(stored); adopt(life, stored.draft); }
      else { life.pending = null; setPending(null); adopt(life, next); }
    }
    life.blocked = false;
  }
  async function run(action: (life: Life) => Promise<void>, allowBlocked = false, propagate = false) {
    const life = lifeRef.current; if (!life || !active(life) || life.locked || (life.blocked && !allowBlocked)) return;
    life.locked = true; setBusy(true); setError(''); setNotice('');
    try { await verifyActor(life); await action(life); }
    catch (problem) { if (active(life)) { if (/revision_conflict|outcome_unknown|server_response_unknown/.test(problemCode(problem))) life.blocked = true; setError(message(problem)); } if (propagate) throw problem; }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  async function save(life: Life, changes: Partial<Pick<BrandSetupDraft, 'profile' | 'reviewed_materials' | 'direction' | 'confirmed_profile'>> = {}) {
    if (!api || !life.draft) throw new Error('onboarding_unavailable');
    if (!life.canWrite || life.pending || life.draft.status === 'published') throw new Error('business_write_denied');
    await verifyActor(life);
    const next = structuredClone(life.draft), intended = profileRef.current ?? next.profile;
    if (!same(intended, next.profile)) { next.profile = structuredClone(intended); next.confirmed_profile = false; next.direction = null; }
    Object.assign(next, changes);
    assertBrandSetupProfile(next.profile, next.confirmed_profile);
    if (next.revision > 0 && same(next, life.draft)) return life.draft;
    const saved = await api.save({ business_id: businessId, expected_revision: life.draft.revision, draft: next });
    await verifyActor(life); adopt(life, saved); return saved;
  }
  useEffect(() => {
    const life: Life = { active: true, actor: '', draft: null, base: null, canWrite: false, locked: true, blocked: false, sessionChanged: false, pending: null };
    lifeRef.current = life; setDraft(null); setProfile(null); setBase(null); setBaseReview(null); setPending(null); setMaterialsOpen(false); setVisual(null); setBusy(true); setError(''); setNotice(''); setPreview(null);
    void (async () => { life.actor = (await service.client.session()).actorId; ensure(life); await refresh(life); })()
      .catch(problem => { if (active(life)) setError(message(problem)); })
      .finally(() => { life.locked = false; if (active(life)) setBusy(false); });
    return () => { life.active = false; };
  }, [api, businessId, service.client]);
  useEffect(() => {
    const verify = () => { const life = lifeRef.current; if (life?.actor && active(life) && !life.sessionChanged) void verifyActor(life).catch(() => {}); };
    window.addEventListener('focus', verify); window.addEventListener('storage', verify); document.addEventListener('visibilitychange', verify);
    return () => { window.removeEventListener('focus', verify); window.removeEventListener('storage', verify); document.removeEventListener('visibilitychange', verify); };
  }, [businessId, service.client]);
  const directionKey = draft?.direction ? JSON.stringify(draft.direction) : '';
  useEffect(() => {
    let current = true, url: string | null = null; setPreview(null); setPreviewError(false);
    const life = lifeRef.current, direction = draft?.direction;
    if (life && direction) void (async () => { await verifyActor(life); const blob = await service.client.asset(direction); await verifyActor(life);
      if (current) { url = URL.createObjectURL(blob); setPreview(url); } })().catch(() => { if (current && active(life) && !life.sessionChanged) setPreviewError(true); });
    return () => { current = false; if (url) URL.revokeObjectURL(url); };
  }, [directionKey, businessId, service.client]);
  const dirty = !!draft && !!profile && !same(profile, draft.profile);
  const published = draft?.status === 'published';
  const baseChanged = !published && !!draft && !!base && (draft.base_fingerprint !== base.fingerprint || draft.base_profile_version !== base.profile_version);
  const blocked = busy || !draft || !canWrite || !!lifeRef.current?.blocked || !!pending || published || materialsOpen || !!visual || !!baseReview;
  const confirmed = !!draft?.confirmed_profile && !dirty && !baseChanged;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  async function acceptMaterials(selection: ReviewedMaterialsSelection) {
    const life = lifeRef.current; if (!life || life.locked || life.pending) throw new Error('onboarding_unavailable');
    life.locked = true; setBusy(true); setError('');
    try {
      await verifyActor(life);
      if (selection.businessId !== businessId) throw new Error('server_session_changed');
      await save(life, { reviewed_materials: { collection_id: selection.collectionId, analysis_key: selection.analysisKey,
        source_hash: selection.sourceHash, review_revision: selection.reviewRevision, finding_ids: selection.findings.map(finding => finding.id) },
        confirmed_profile: false, direction: null });
      setMaterialsOpen(false); setNotice('Ficha incorporada al borrador. Revisa los campos del perfil antes de confirmar su dirección.');
    } catch (problem) { if (active(life)) { if (/revision_conflict|outcome_unknown|server_response_unknown/.test(problemCode(problem))) life.blocked = true; setError(message(problem)); } throw problem; }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  async function acceptDirection(asset: RegisteredAssetVersion, expected: BrandSetupDraft, approvedCopy?: string) {
    await run(async life => {
      if (!life.draft || life.draft.id !== expected.id || life.draft.design_revision !== expected.design_revision || dirty
        || (approvedCopy !== undefined && approvedCopy !== expected.profile.name)) throw new Error('onboarding_direction_stale');
      await save(life, { direction: asset.identity }); setVisual(null); setNotice('Dirección visual incorporada al borrador. Guardar dirección de marca publicará el perfil revisado.');
    }, false, true);
  }
  async function applyMaterialSuggestions(life: Life) {
    const materials = service.client.materials?.(businessId), expected = life.draft?.reviewed_materials;
    if (!materials || !expected || !profileRef.current) throw new Error('onboarding_materials_required');
    const current = await materials.read(expected.collection_id); await verifyActor(life);
    if (current.revision !== expected.review_revision || current.review?.approved !== true || current.review.analysis_key !== expected.analysis_key
      || current.review.source_hash !== expected.source_hash) throw new Error('onboarding_materials_changed');
    const history = await materials.history(expected.collection_id); await verifyActor(life);
    const result = history.find(item => item.request.request_key === expected.analysis_key)?.result;
    if (!result) throw new Error('onboarding_materials_changed');
    const selection = await buildReviewedMaterialsSelection(current, result, expected.finding_ids); await verifyActor(life);
    const suggested = suggestBrandSetupProfile(profileRef.current, selection);
    setProfile(suggested.profile); profileRef.current = suggested.profile;
    setNotice(suggested.fields.length ? `Sugerencias aplicadas al borrador: ${suggested.fields.join(', ')}. Revisa los campos antes de confirmarlos.`
      : 'No hay sugerencias inequívocas que cambien estos campos. La ficha conserva el resto de los hallazgos para tu revisión.');
  }
  async function reviewCurrentBase(life: Life) {
    if (!api || !life.draft || !profileRef.current || life.pending) throw new Error('onboarding_unavailable');
    const expected = structuredClone(life.draft), edited = structuredClone(profileRef.current);
    const fresh = await api.read(); await verifyActor(life);
    life.canWrite = fresh.can_write; setCanWrite(fresh.can_write);
    if (!fresh.can_write) throw new Error('business_write_denied');
    if (expected.revision > 0 && (!fresh.draft || fresh.draft.id !== expected.id || fresh.draft.revision !== expected.revision)
      || expected.revision === 0 && fresh.draft) throw new Error('server_onboarding_revision_conflict');
    life.base = fresh.base; setBase(fresh.base);
    if (fresh.base.fingerprint === expected.base_fingerprint && fresh.base.profile_version === expected.base_profile_version) {
      setNotice('Los datos publicados no han cambiado. Conservamos las ediciones de tu borrador.'); return;
    }
    let materialsCurrent = true;
    if (expected.reviewed_materials) {
      const materials = service.client.materials?.(businessId); if (!materials) throw new Error('onboarding_unavailable');
      const ref = expected.reviewed_materials, collection = await materials.read(ref.collection_id); await verifyActor(life);
      materialsCurrent = collection.revision === ref.review_revision && collection.review?.approved === true
        && collection.review.analysis_key === ref.analysis_key && collection.review.source_hash === ref.source_hash;
    }
    setBaseReview({ base: structuredClone(fresh.base), profile: edited, draftId: expected.id, revision: expected.revision, materialsCurrent });
  }
  async function acceptBase(life: Life, choice: 'keep_edits' | 'load_current') {
    if (!api || !baseReview || !life.draft || life.pending) throw new Error('onboarding_rebase_invalid');
    if (life.draft.id !== baseReview.draftId || life.draft.revision !== baseReview.revision) throw new Error('server_onboarding_revision_conflict');
    const snapshot = rebaseBrandSetupDraft(life.draft, baseReview.base, baseReview.profile, choice, baseReview.materialsCurrent);
    await verifyActor(life);
    const next = await api.save({ business_id: businessId, expected_revision: snapshot.revision, draft: snapshot }); await verifyActor(life);
    adopt(life, next); life.base = baseReview.base; setBase(baseReview.base); setBaseReview(null);
    setNotice(baseReview.materialsCurrent ? 'Borrador actualizado. Conservamos la ficha; confirma el perfil y revisa una dirección para esta nueva base.'
      : 'Borrador actualizado. Los archivos y el historial se conservan; incorpora una ficha vigente antes de confirmar el perfil y revisar su dirección.');
  }
  async function finishPublication(life: Life, receipt: BrandSetupReceipt) {
    await verifyActor(life); const frozen = life.pending?.draft ?? life.draft;
    if (!frozen || receipt.business_id !== businessId || receipt.actor_id !== life.actor || receipt.draft_id !== frozen.id
      || receipt.publish_id !== frozen.id || receipt.draft_revision !== frozen.revision || !same(receipt.direction, frozen.direction)) throw new Error('onboarding_publish_unknown');
    adopt(life, { ...frozen, revision: receipt.draft_revision + 1, status: 'published', receipt });
    clearPublication(businessId, life.actor); life.pending = null; setPending(null); life.blocked = false;
    setNotice(`Dirección de marca guardada como versión ${receipt.profile_version}.`);
    if (onSaved) { try { await onSaved(receipt); } catch { if (active(life) && !life.sessionChanged) setNotice('La dirección está guardada. Vuelve a abrir la página para actualizar los datos del negocio.'); } }
  }
  async function publish(life: Life) {
    if (!api || !life.draft) throw new Error('onboarding_unavailable');
    if (!life.pending) {
      const next = await save(life);
      if (!next.reviewed_materials) throw new Error('onboarding_materials_required');
      if (!next.confirmed_profile) throw new Error('onboarding_profile_confirmation_required');
      if (!next.direction) throw new Error('onboarding_direction_required');
      const value: PendingPublication = { schema_version: 1, actor_id: life.actor, draft: structuredClone(next),
        input: { business_id: businessId, publish_id: next.id, draft_id: next.id, expected_revision: next.revision } };
      writePublication(value); life.pending = value; setPending(value);
    }
    await verifyActor(life);
    let receipt: BrandSetupReceipt;
    try { receipt = await api.publish(life.pending.input); }
    catch (problem) {
      const refused = problem instanceof DesignServerClientError && isBrandSetupPublicationRefusal(problem.code, problem.httpStatus);
      if (refused && active(life) && !life.sessionChanged) {
        clearPublication(businessId, life.actor); life.pending = null; setPending(null); life.blocked = true;
        setNotice('El servidor rechazó esta solicitud sin publicar cambios. Recupera el borrador para corregirlo.');
      }
      throw problem;
    }
    await finishPublication(life, receipt);
  }
  async function close() {
    if (!onClose) return;
    const life = lifeRef.current;
    if (!life?.draft || life.blocked || life.pending || life.draft.status === 'published' || !dirty) { onClose(); return; }
    await run(async current => { await save(current); ensure(current); onClose(); });
  }
  return <><section className="bsp-panel" aria-label="Configurar dirección de marca" aria-busy={busy}>
    <header className="bsp-header"><div><span className="bsp-eyebrow">Primera comprensión de tu marca</span><h1>Dirección de marca</h1>
      <p>Parte de tus materiales, confirma lo que entendimos y explora una dirección visual antes de guardar el perfil de este negocio.</p></div>
      {onClose && <button disabled={busy} onClick={() => void close()}><ChevronLeft size={16} />Volver</button>}</header>
    <ol className="bsp-steps"><li data-complete={!!draft?.reviewed_materials}><span className="bsp-step-number">{draft?.reviewed_materials ? <Check size={14} /> : '1'}</span>Materiales y comprensión</li>
      <li data-complete={confirmed}><span className="bsp-step-number">{confirmed ? <Check size={14} /> : '2'}</span>Perfil confirmado</li>
      <li data-complete={published}><span className="bsp-step-number">{published ? <Check size={14} /> : '3'}</span>Dirección revisada</li></ol>
    {error && <p className="bsp-error" role="alert">{error}</p>}{notice && <p className="bsp-success" role="status">{notice}</p>}
    {!draft || !profile ? <div className="bsp-loading">{busy ? 'Recuperando el borrador de tu marca…' : <><span>No se pudo abrir el borrador de marca.</span>
      <button disabled={!lifeRef.current?.actor || lifeRef.current.sessionChanged} onClick={() => void run(refresh, true)}><RefreshCw size={15} />Recuperar borrador</button></>}</div> : <>
      {!canWrite && <p className="bsp-warning">Puedes consultar este negocio. Guardar su dirección requiere permisos de edición.</p>}
      {pending && <p className="bsp-warning">Hay un guardado pendiente de confirmar. Conservamos exactamente el perfil, la ficha y la dirección enviados; recupera el resultado antes de editar.</p>}
      {baseChanged && <p className="bsp-warning">Los datos publicados del negocio cambiaron desde que comenzaste. Revisa los datos actuales para decidir qué conservar antes de confirmar otra dirección.</p>}
      {!published && <div className="bsp-actions bsp-base-toolbar"><button disabled={blocked} onClick={() => void run(reviewCurrentBase)}><RefreshCw size={15} />Revisar datos actuales</button></div>}
      {baseReview && <section className="bsp-card bsp-base-review" aria-label="Comparar datos actuales"><h2>Datos actuales del negocio</h2>
        <p className="bsp-note">Comparamos tu borrador, incluidas las ediciones pendientes, con el perfil publicado versión {baseReview.base.profile_version}. Ninguna de estas decisiones publica el perfil.</p>
        {brandProfileDifferences(baseReview.profile, baseReview.base.profile).length > 0 ? <div className="bsp-differences"><table><thead><tr><th>Campo</th><th>Tu borrador</th><th>Datos actuales</th></tr></thead><tbody>
          {brandProfileDifferences(baseReview.profile, baseReview.base.profile).map(difference => <tr key={difference.label}><th>{difference.label}</th><td>{difference.edited || 'Sin definir'}</td><td>{difference.current || 'Sin definir'}</td></tr>)}
        </tbody></table></div> : <p className="bsp-note">Los campos de marca coinciden; cambió otra configuración del negocio o la versión del perfil.</p>}
        <p className="bsp-warning">Tendrás que confirmar el perfil y revisar una nueva dirección visual. Los diseños anteriores se conservan en el historial.</p>
        {!baseReview.materialsCurrent && <p className="bsp-warning">La ficha de materiales también cambió. Conservamos sus archivos e historial; después deberás incorporar una ficha vigente.</p>}
        <div className="bsp-actions"><button className="bsp-primary" disabled={busy} onClick={() => void run(life => acceptBase(life, 'keep_edits'))}>Conservar mis datos editados</button>
          <button disabled={busy} onClick={() => void run(life => acceptBase(life, 'load_current'))}>Cargar los datos actuales</button>
          <button disabled={busy} onClick={() => setBaseReview(null)}>Cancelar revisión</button></div>
      </section>}
      <section className="bsp-card"><div className="bsp-card-heading"><div><h2>1. Materiales y comprensión</h2><p className="bsp-note">PDFs, imágenes, documentación e ideas de tu biblioteca privada. Corregir y aprobar una ficha no modifica el perfil.</p></div>
        <button ref={materialsTrigger} disabled={blocked || !service.client.materials} onClick={() => void run(async life => { if (!life.draft?.revision) await save(life); setMaterialsOpen(true); })}><FileText size={16} />{draft.reviewed_materials ? 'Revisar materiales' : 'Añadir materiales'}</button></div>
        {draft.reviewed_materials ? <><div className="bsp-sources"><span>Ficha aprobada · revisión {draft.reviewed_materials.review_revision}</span><span>{draft.reviewed_materials.finding_ids.length} hallazgos elegidos</span><span>Fuentes {draft.reviewed_materials.source_hash.slice(0, 12)}</span></div>
          <p className="bsp-summary">{draft.material_context}</p></> : <p className="bsp-note">Abre la biblioteca, selecciona los materiales y revisa su ficha antes de incorporarla a esta marca.</p>}
      </section>
      <section className="bsp-card"><div className="bsp-card-heading"><div><h2>2. Revisa el perfil de marca</h2><p className="bsp-note">Los valores parten únicamente de este negocio. Conserva lo confirmado y corrige lo que falte; puedes dejar vacíos los datos que aún no estén definidos.</p></div><span className="bsp-badge">{confirmed ? 'Perfil confirmado' : 'Por revisar'}</span></div>
        {draft.reviewed_materials && <div className="bsp-actions"><button disabled={blocked || !service.client.materials} onClick={() => void run(applyMaterialSuggestions)}>Aplicar sugerencias de la ficha al borrador</button>
          <p className="bsp-note">Reemplaza tono, audiencia, identidad, composición y colores con rol explícito cuando hay hallazgos aplicables. Después podrás corregirlos.</p></div>}
        <ProfileEditor value={profile} disabled={blocked} onChange={next => { setProfile(next); profileRef.current = next; setNotice(''); }} />
        {dirty && <p className="bsp-warning">Cambios pendientes de guardar. Al guardarlos tendrás que confirmar el perfil y revisar una dirección para esta nueva versión.</p>}
        <div className="bsp-actions"><button disabled={blocked || (!dirty && draft.revision > 0)} onClick={() => void run(async life => { await save(life); setNotice('Borrador guardado. El perfil publicado sigue vigente hasta Guardar dirección de marca.'); })}><Save size={15} />Guardar borrador</button>
          <button className="bsp-primary" disabled={blocked || baseChanged || !draft.reviewed_materials || confirmed} onClick={() => void run(async life => { await save(life, { confirmed_profile: true, direction: null }); setNotice('Perfil confirmado para explorar su dirección visual.'); })}><Check size={15} />Confirmar perfil revisado</button></div>
      </section>
      <section className="bsp-card"><div className="bsp-card-heading"><div><h2>3. Explora y revisa la dirección</h2><p className="bsp-note">Usa las cinco ideas compartidas, combina lo que te guste y revisa los borradores. Aprobar una dirección y generar su versión en media son acciones diferentes.</p></div>
        <button className="bsp-primary" disabled={blocked || !confirmed || !draft.reviewed_materials} onClick={() => void run(async life => {
          const source = await save(life); if (!source.confirmed_profile || !source.reviewed_materials) throw new Error('onboarding_profile_confirmation_required');
          const frozen = structuredClone(source), hash = await brandSetupDesignHash(frozen); ensure(life);
          setVisual({ draft: frozen, destination: { workspace: 'onboarding', document_type: 'special', page_id: frozen.page_id, brand_id: businessId, brief_hash: hash } });
        })}><Palette size={16} />{draft.direction ? 'Revisar otra dirección' : 'Explorar dirección visual'}</button></div>
        <div className="bsp-preview">{preview && !dirty ? <img src={preview} alt={`Dirección visual revisada de ${draft.profile.name}`} /> : <div className="bsp-preview-empty">{previewError ? 'No se pudo cargar la imagen guardada. Recupera el borrador para volver a consultarla.' : draft.direction && !dirty ? 'Cargando dirección aprobada…' : 'La dirección aparecerá aquí después de revisar y aprobar su versión en media.'}</div>}</div>
        {draft.direction && !dirty && <p className="bsp-note">Versión visual aprobada · {draft.direction.version_id.slice(0, 12)}. {published ? 'Esta versión forma parte del perfil guardado.' : 'Esta selección aún no cambia el perfil del negocio.'}</p>}
      </section>
      <section className="bsp-card bsp-save-card"><h2>{published ? 'Dirección de marca guardada' : 'Guardar la dirección revisada'}</h2>
        <p className="bsp-note">{published ? `El perfil creativo versión ${draft.receipt!.profile_version} conserva esta ficha y la dirección visual aprobada.`
          : 'Esta acción sincroniza los datos revisados del negocio, una nueva versión del perfil creativo y sus referencias. No publica cambios en el prompt maestro.'}</p>
        <div className="bsp-actions">{!published && !pending && <button className="bsp-primary" disabled={blocked || !confirmed || !draft.direction || !preview}
          onClick={() => void run(publish)}><Save size={16} />Guardar dirección de marca</button>}
          {pending && <><button className="bsp-primary" disabled={busy || lifeRef.current?.sessionChanged} onClick={() => void run(async life => {
            if (!api || !life.pending) return; const receipt = await api.recover(life.pending.input.publish_id); await verifyActor(life);
            if (receipt) await finishPublication(life, receipt); else setNotice('Aún no hay un guardado confirmado. Puedes reenviar la misma solicitud; no genera imágenes ni otro perfil si ya quedó guardado.');
          }, true)}><RefreshCw size={15} />Recuperar guardado</button>
            <button disabled={busy || lifeRef.current?.sessionChanged} onClick={() => void run(publish, true)}>Reintentar el mismo guardado</button></>}
          <button disabled={busy || materialsOpen || !!visual || lifeRef.current?.sessionChanged} onClick={() => void run(async life => {
            if (dirty && !life.pending && !life.blocked && life.canWrite) await save(life); await refresh(life); setNotice('Borrador recuperado. No se generaron nuevas imágenes.');
          }, true)}><RefreshCw size={15} />Recuperar borrador</button></div>
      </section>
    </>}
  </section>
    {materialsOpen && <MaterialsPanel client={service.client} businessId={businessId} returnFocus={materialsTrigger.current} onClose={() => setMaterialsOpen(false)} onUse={acceptMaterials} />}
    {visual && <ServerDesignPanel service={service} businessId={businessId} documentId={visual.draft.id} slide={designCanvas(visual.draft)}
      destination={visual.destination} initialScope="full_design" initialInstruction={buildBrandSetupBrief(visual.draft)} initialCopy={visual.draft.profile.name}
      onClose={() => setVisual(null)} onUseBrandDirection={(asset, copy) => acceptDirection(asset, visual.draft, copy)} />}
  </>;
}
