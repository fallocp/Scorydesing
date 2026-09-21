import { useEffect, useRef, useState } from 'react';
import type { DesignServerClient } from '../desaing/serverClient';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import type { PresentationReferenceScope } from '../../../supabase/functions/_shared/desaing/presentationReferenceScope';
import { assertPresentationReferenceSelection, openPresentationReferenceStore, presentationReferenceSelectionKey,
  type PreparedPresentationReference } from './presentationReferences';
import type { DesignReference } from '../../../supabase/functions/_shared/desaing/contracts';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { designSurfaceBrand, designSurfaceWorkspace, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';

const signature = presentationReferenceSelectionKey;
export function usePresentationReferences(options: { client: DesignServerClient; businessId: string; documentId: string; slideId: string;
  destination?: DesignSurfaceDestination; captureSlots?: 0 | 1 }) {
  const [items, setItems] = useState<PreparedPresentationReference[]>([]);
  const [recreateReferenceId, setSource] = useState<string | undefined>();
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lifetime = useRef<{ active: boolean; store: Awaited<ReturnType<typeof openPresentationReferenceStore>> | null;
    revision: number; key: string; items: PreparedPresentationReference[]; source?: string; locked: boolean } | null>(null);
  useEffect(() => {
    const life = { active: true, store: null as Awaited<ReturnType<typeof openPresentationReferenceStore>> | null,
      revision: 0, key: '', items: [] as PreparedPresentationReference[], source: undefined as string | undefined, locked: false };
    lifetime.current = life; setReady(false); setItems([]); setSource(undefined); setError(''); setBusy(false);
    void (async () => {
      const { actorId } = await options.client.session();
      const scope = { actor_id: actorId, business_id: options.businessId, document_id: options.documentId,
        slide_id: options.destination ? `${designSurfaceWorkspace(options.destination)}:${options.destination.document_type}:${options.slideId}` : options.slideId };
      const store = await openPresentationReferenceStore(scope);
      if (!life.active) { store.close(); return; }
      life.store = store; life.key = `desaing-reference-source:${JSON.stringify(scope)}`;
      const saved = await store.read();
      if (!life.active) return;
      life.revision = saved?.revision ?? 0; life.items = saved?.value.items ?? [];
      const source = localStorage.getItem(life.key) ?? undefined;
      life.source = life.items.some(item => item.id === source && item.role === 'object_reference') ? source : undefined;
      setItems(life.items); setSource(life.source); setReady(true);
    })().catch(() => { if (life.active) setError('No se pudieron recuperar tus referencias. Cierra y vuelve a abrir el panel.'); });
    return () => { life.active = false; life.store?.close(); };
  }, [options.client, options.businessId, options.documentId, options.slideId, options.destination?.document_type, options.destination?.page_id, options.destination?.brand_id, options.destination?.workspace]);
  async function change(next: PreparedPresentationReference[]) {
    const life = lifetime.current;
    if (!life?.active || !life.store || life.locked || !ready) return;
    life.locked = true; setBusy(true); setError('');
    try {
      const saved = await life.store.write(life.revision, next);
      if (!life.active) return;
      life.revision = saved.revision; life.items = saved.value.items;
      if (!life.items.some(item => item.id === life.source && item.role === 'object_reference')) {
        localStorage.removeItem(life.key); life.source = undefined; setSource(undefined);
      }
      setItems(life.items);
    } catch { if (life.active) { setReady(false); setError('Otra pestaña cambió las referencias o no se pudieron guardar. Cierra y vuelve a abrir para recuperar la versión guardada.'); } }
    finally { life.locked = false; if (life.active) setBusy(false); }
  }
  function chooseSource(source?: string) {
    const life = lifetime.current;
    if (!life?.active || !ready || life.locked) return;
    if (source && !life.items.some(item => item.id === source && item.role === 'object_reference')) return;
    try {
      if (source) localStorage.setItem(life.key, source); else localStorage.removeItem(life.key);
      life.source = source; setSource(source);
    } catch { setError('No se pudo guardar esta elección. Conservamos la acción anterior.'); }
  }
  const referenceScope: PresentationReferenceScope = { references: items.map(item => ({ reference_id: item.id, role: item.role })),
    ...(recreateReferenceId ? { recreate_reference_id: recreateReferenceId } : {}) };
  const referenceKey = JSON.stringify(referenceScope);
  async function prepare(generation: Pick<ServerGenerationCapabilities, 'max_references' | 'supports_recreation'>) {
    const life = lifetime.current, frozen = items, expected = signature(items), source = recreateReferenceId;
    if (!life?.active || !life.store || !ready || life.locked) throw new Error('presentation_references_unavailable');
    if (items.length + (options.captureSlots ?? 1) > (generation.max_references ?? 2)) throw new Error('server_generation_reference_limit');
    if (source && !generation.supports_recreation) throw new Error('invalid_recreation_source');
    const assertCurrent = async () => {
      if (!life.active || lifetime.current !== life || signature(life.items) !== expected || life.source !== source) throw new Error('visual_proposal_context_changed');
    };
    const uploaded: { reference: DesignReference; version: RegisteredAssetVersion }[] = [];
    for (const item of frozen) {
      await assertCurrent();
      const result = await life.store.upload(item, options.client, { brandId: designSurfaceBrand(options.destination), projectId: options.documentId, assertCurrent });
      await assertCurrent();
      try { assertPresentationReferenceSelection(frozen, result.record.value.items); }
      catch (problem) {
        // Do not acknowledge a revision containing unseen edits from another
        // tab: a later write with stale items could overwrite those references.
        setReady(false); setError('Otra pestaña cambió las referencias. Cierra y vuelve a abrir para recuperar la versión guardada.');
        throw problem;
      }
      life.revision = result.record.revision;
      uploaded.push({ reference: result.reference, version: result.version });
    }
    return uploaded;
  }
  return { items, ready, busy, error, change, recreateReferenceId, chooseSource, referenceScope, referenceKey, prepare };
}
