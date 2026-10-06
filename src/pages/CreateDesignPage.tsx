import { useState } from 'react';
import { CreateEditShell } from '@/components/create-edit/CreateEditShell';
import { BusinessControl } from '@/components/create-edit/BusinessControl';
import { CreateDesignWorkspace } from '@/components/create-edit/CreateDesignWorkspace';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useAuth } from '@/hooks/useAuth';
import { useBusinessSwitch } from '@/lib/create-edit/useBusinessSwitch';
import { entryKey, readEntry } from '@/lib/create-edit/entry';

/** Crear y editar → Diseño nuevo: format, Xending style, references and versions. */
export default function CreateDesignPage() {
  const { user } = useAuth();
  const { activeBusinessId } = useActiveBusiness();
  const service = usePresentationDesignService();
  const business = useBusinessSwitch();
  const actor = user?.id ?? null, ready = !!actor && !!activeBusinessId && !business.switching;
  const [brief] = useState(() => {
    try { return actor && activeBusinessId ? readEntry(window.sessionStorage, entryKey(actor, activeBusinessId)).brief : ''; } catch { return ''; }
  });
  return <CreateEditShell businessControl={<BusinessControl switching={business.switching} switchBusiness={business.switchBusiness} />}
    ready={ready} freeDesign={!!service} materials={!!service?.client.materials} trail={[{ label: 'Crear y editar', to: '/create' }, { label: 'Diseño nuevo' }]}>
    {business.switchError && <p role="alert" className="ce-error">{business.switchError}</p>}
    {!service ? <p className="ce-notice">El diseño con IA no está habilitado en este entorno.</p>
      : !ready ? <p className="ce-notice">Selecciona un negocio en la cabecera para empezar.</p>
        : <CreateDesignWorkspace key={`${actor}:${activeBusinessId}`} service={service} businessId={activeBusinessId!} actorId={actor!} initialInstruction={brief} />}
  </CreateEditShell>;
}
