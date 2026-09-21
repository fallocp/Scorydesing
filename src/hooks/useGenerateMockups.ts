import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { createStudioGenerationClient } from '@/lib/desaing/studioGenerationClient';
import { normalizeDesignImageReference as normalizeReference } from '@/lib/desaing/imageReference';
import type { GenerateMockupsRequest } from '@/types/design-studio';


export function useGenerateMockups() {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const service = usePresentationDesignService();
  const [pending, setPending] = useState(false), [recovering, setRecovering] = useState(false);
  const scopeKey = JSON.stringify([activeBusinessId, user?.id]);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
  const controller = useMemo(() => service && activeBusinessId && user?.id ? createStudioGenerationClient({
    client: service.client, businessId: activeBusinessId, actorId: user.id, normalizeReference,
    async prepare(request) {
      if (!service.client.prepareStudio) throw new Error('Actualiza el servidor para usar el motor compartido de Studio.');
      return service.client.prepareStudio(request);
    },
    storage: {
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key),
    },
    async exclusive(key, action) {
      if (!navigator.locks) throw new Error('Abre Studio en un navegador compatible para proteger la recuperación de imágenes.');
      return navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Hay una generación en curso en otra pestaña. Espera y recupera su resultado.');
        return action();
      });
    },
    onPending: value => { if (currentScope.current === scopeKey) setPending(value); },
  }) : null, [service, activeBusinessId, user, scopeKey]);
  useEffect(() => {
    let active = true; setPending(false);
    void controller?.hasPending().catch(() => { if (active) setPending(true); });
    return () => { active = false; };
  }, [controller]);
  const requireController = () => {
    if (!controller) throw new Error('Activa el motor compartido de diseño para generar desde Studio.');
    return controller;
  };
  const mutation = useMutation({ mutationKey: ['studio-shared-generation', activeBusinessId], retry: false,
    mutationFn: (request: GenerateMockupsRequest) => requireController().generate(request) });
  return { ...mutation, pending, busy: mutation.isPending || recovering,
    async recoverAsync() {
      setRecovering(true);
      try { return await requireController().recover(); } finally { setRecovering(false); }
    },
    async ackAsync(operationKey: string) { await requireController().acknowledge(operationKey); },
  };
}
