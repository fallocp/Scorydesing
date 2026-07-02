/**
 * useInitActiveBusiness — Inicializa/rehidrata el negocio activo al arrancar.
 *
 * Resuelve dos problemas:
 *
 * 1. El negocio activo se persiste en localStorage (via `persist` en el
 *    designStore), pero la metadata de sesión de Supabase usada por las RLS
 *    (RPC `set_active_business`) NO se persiste. Al recargar hay que volver a
 *    escribirla para que las consultas con RLS por sesión funcionen.
 *
 * 2. En modo `single` (default) el selector de negocio está oculto y no había
 *    auto-selección, dejando `activeBusinessId` en null. Aquí se auto-selecciona
 *    el primer negocio disponible (y también cuando solo hay uno en modo multi).
 *
 * Debe montarse una sola vez, dentro del contexto autenticado.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBusinessTenants } from './useBusinessTenants';
import { useActiveBusiness } from './useActiveBusiness';
import { useDeploymentMode } from './useDeploymentMode';

export function useInitActiveBusiness() {
  const { data: businesses } = useBusinessTenants();
  const { activeBusiness, setActiveBusiness } = useActiveBusiness();
  const deploymentMode = useDeploymentMode();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    if (!businesses) return; // aún cargando la lista

    // Caso 1: hay un negocio persistido/activo → validar y re-sincronizar RPC.
    if (activeBusiness) {
      const stillExists = businesses.some((b) => b.id === activeBusiness.id);
      if (!stillExists) {
        // El negocio persistido ya no pertenece al usuario: limpiarlo.
        setActiveBusiness(null).catch(() => { /* noop */ });
        return;
      }
      doneRef.current = true;
      // Re-sincroniza la metadata de sesión sin tocar el store (para no borrar
      // la selección si el RPC falla de forma transitoria).
      supabase
        .rpc('set_active_business', { business_id: activeBusiness.id })
        .then(({ error }) => {
          if (error) {
            console.error('No se pudo re-sincronizar el negocio activo en la sesión:', error.message);
          }
        });
      return;
    }

    // Caso 2: no hay negocio activo → auto-seleccionar.
    // En single siempre elegimos el primero; en multi solo si hay exactamente uno.
    if (businesses.length === 0) return;
    const shouldAutoSelect = deploymentMode === 'single' || businesses.length === 1;
    if (!shouldAutoSelect) return;

    doneRef.current = true;
    setActiveBusiness(businesses[0]).catch((err) => {
      doneRef.current = false; // permitir reintento si falló
      console.error('Auto-selección de negocio falló:', err instanceof Error ? err.message : err);
    });
  }, [businesses, activeBusiness, setActiveBusiness, deploymentMode]);
}
