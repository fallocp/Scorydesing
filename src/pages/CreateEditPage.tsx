import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateEditHome } from '@/components/create-edit/CreateEditHome';
import { BusinessControl } from '@/components/create-edit/BusinessControl';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessSwitch } from '@/lib/create-edit/useBusinessSwitch';
import { entryKey, entryRoute, emptyEntry, readEntry, type CreateEntry } from '@/lib/create-edit/entry';

export default function CreateEditPage() {
  const { user } = useAuth();
  const { activeBusinessId } = useActiveBusiness();
  const business = useBusinessSwitch();
  // Keep the RPC's pending/error state above the scope remount: the existing
  // business hook updates Zustand optimistically before it confirms the session.
  return <ScopedCreateEditPage key={`${user?.id ?? ''}:${activeBusinessId ?? ''}`} actor={user?.id ?? null} {...business} />;
}

function ScopedCreateEditPage({ actor, switching, switchError, switchBusiness }: {
  actor: string | null; switching: boolean; switchError: string; switchBusiness: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const service = usePresentationDesignService();
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const [error, setError] = useState('');
  const key = actor && activeBusinessId ? entryKey(actor, activeBusinessId) : null;
  const [entry, setEntry] = useState<CreateEntry>(() => {
    try { return key ? readEntry(window.sessionStorage, key) : { ...emptyEntry }; }
    catch { return { ...emptyEntry }; }
  });
  function change(next: CreateEntry) {
    setEntry(next);
    if (!key) return;
    try { window.sessionStorage.setItem(key, JSON.stringify(next)); setError(''); }
    catch { setError('No se pudo conservar el borrador en esta pestaña. Copia tus indicaciones antes de salir.'); }
  }
  function open() {
    if (!key || switching || entry.origin === 'template' || entry.piece === 'free' && !service) return;
    try { window.sessionStorage.setItem(key, JSON.stringify(entry)); }
    catch { setError('No se pudo conservar el borrador. Copia tus indicaciones antes de abrir otra herramienta.'); return; }
    const route = entryRoute(entry);
    navigate(`${route}${route.includes('?') ? '&' : '?'}from=create`);
  }
  return <CreateEditHome businessName={activeBusiness?.name ?? 'Tu negocio'} brandName={activeBusinessId ? 'Contexto activo' : undefined}
    businessControl={<BusinessControl switching={switching} switchBusiness={switchBusiness} />}
    ready={!!key && !switching} freeDesign={!!service} materials={!!service?.client.materials} onboarding={!!service?.client.onboarding}
    entry={entry} onChange={change} onOpen={open} error={switchError || error} />;
}
