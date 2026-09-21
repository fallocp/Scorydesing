/**
 * useFxKit — genera y administra el kit de objetos del Daily Report FX.
 *
 * Cada objeto se genera UNA vez con el motor compartido de DesAIng y se
 * sube a Storage con nombre fijo (`{business}/fx-kit/{id}.png`, upsert). El reporte
 * diario reutiliza esas URLs; regenerar o reemplazar un objeto sobrescribe su PNG.
 *
 * No requiere tabla: la existencia se consulta listando la carpeta en Storage.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';
import { useImageGenerationSettings } from './useImageGenerationSettings';
import { imageGenerationRequestFields } from '@/lib/imageGenerationSettings';
import { acknowledgeSharedDesignImage, generateSharedDesignImage, recoverSharedDesignImage } from '@/lib/desaing/sharedImageGeneration';
import {
  FX_KIT,
  FX_KIT_BUCKET,
  fxKitStoragePath,
  type FxKitObjectId,
} from '@/utils/design-studio/fxDailyKit';

type KitStatus = 'idle' | 'generating' | 'done' | 'error';

/** base64 → Blob PNG. */
function base64ToBlob(base64: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

export function useFxKit() {
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const actorId = user?.id;
  const scopeKey = JSON.stringify([activeBusinessId, actorId]);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
  const [stateScope, setStateScope] = useState(scopeKey);
  const { settings: imageSettings, setSettings: setImageSettings } = useImageGenerationSettings(activeBusinessId, 'fx-kit');
  const [urls, setUrls] = useState<Partial<Record<FxKitObjectId, string>>>({});
  const [statuses, setStatuses] = useState<Partial<Record<FxKitObjectId, KitStatus>>>({});
  const [isBusy, setIsBusy] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FxKitObjectId, string>>>({});
  const busyObjects = useRef(new Set<string>());
  const busyBatch = useRef<string | null>(null);
  const assertScope = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (!actorId || error || data.session?.user.id !== actorId || currentScope.current !== scopeKey) {
      throw new Error('La sesión o el negocio cambiaron. Recupera el objeto desde su contexto original.');
    }
  }, [actorId, scopeKey]);

  const publicUrl = useCallback(
    (id: FxKitObjectId): string => {
      const { data } = supabase.storage.from(FX_KIT_BUCKET).getPublicUrl(fxKitStoragePath(activeBusinessId ?? '', id));
      // Cache-bust para ver el objeto regenerado sin recargar.
      return `${data.publicUrl}?v=${Date.now()}`;
    },
    [activeBusinessId],
  );

  // Al montar: detecta qué objetos ya existen en Storage.
  useEffect(() => {
    setUrls({}); setStatuses({}); setErrors({}); setIsBusy(false); setStateScope(scopeKey);
    if (!activeBusinessId || !actorId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from(FX_KIT_BUCKET)
        .list(`${activeBusinessId}/fx-kit`, { limit: 100 });
      if (cancelled || currentScope.current !== scopeKey || error || !data) return;
      const present: Partial<Record<FxKitObjectId, string>> = {};
      for (const file of data) {
        const id = file.name.replace(/\.png$/, '') as FxKitObjectId;
        if (FX_KIT.some((o) => o.id === id)) {
          const { data: pub } = supabase.storage
            .from(FX_KIT_BUCKET)
            .getPublicUrl(fxKitStoragePath(activeBusinessId, id));
          present[id] = pub.publicUrl;
        }
      }
      setUrls(present);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, actorId, scopeKey]);

  /** Genera un objeto y lo sube a su ruta fija (sobrescribe). */
  const generateObject = useCallback(
    async (id: FxKitObjectId): Promise<boolean> => {
      if (!activeBusinessId || !actorId || currentScope.current !== scopeKey) return false;
      const obj = FX_KIT.find((o) => o.id === id);
      if (!obj) return false;
      const businessId = activeBusinessId;
      const busyKey = `${scopeKey}:${id}`;
      if (busyObjects.current.has(busyKey)) return false;
      busyObjects.current.add(busyKey);

      setStatuses((s) => ({ ...s, [id]: 'generating' }));
      setErrors((s) => ({ ...s, [id]: undefined }));
      try {
        await assertScope();
        // El hero es una escena (banda superior) → horizontal. Los objetos van
        // aislados en cuadrado.
        const imageSize = id === 'hero' ? '1536x1024' : '1024x1024';
        const aspectRatio = id === 'hero' ? '3:2' : '1:1';
        const scope = { businessId, actorId, process: 'fx' as const, slotKey: `kit:${id}` };
        const recovered = await recoverSharedDesignImage(scope);
        await assertScope();
        const result = recovered ?? await generateSharedDesignImage({
            business_id: activeBusinessId,
            userRequest: obj.label,
            brand: 'xending',
            mode: 'generate',
            promptFinal: obj.prompt,
            imageType: 'fotografia',
            aspectRatio,
            imageSize,
            ...imageGenerationRequestFields(imageSettings),
        }, scope);
        const assertActor = async () => {
          await assertScope();
          if (result.actor_id !== actorId || result.business_id !== businessId) throw new Error('La imagen pertenece a otra sesión. Recupera el objeto desde la sesión original.');
        };
        await assertActor();
        const blob = base64ToBlob(result.imageBase64);
        const immutablePath = `${result.business_id}/fx-kit-versions/${id}/${result.operation_key}.png`;
        const { error: versionError } = await supabase.storage.from(FX_KIT_BUCKET)
          .upload(immutablePath, blob, { contentType: 'image/png', upsert: false });
        if (versionError) {
          const duplicate = String((versionError as { statusCode?: string | number }).statusCode) === '409' || /already exists|duplicate/i.test(versionError.message);
          if (!duplicate) throw new Error(versionError.message);
          const { data: previous, error } = await supabase.storage.from(FX_KIT_BUCKET).download(immutablePath);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const stored = previous && new Uint8Array(await previous.arrayBuffer());
          if (error || !stored || stored.length !== bytes.length || stored.some((byte, i) => byte !== bytes[i])) {
            throw new Error('La versión guardada no coincide. No se reemplazó el objeto.');
          }
        }

        await assertActor();
        const { error: upErr } = await supabase.storage
          .from(FX_KIT_BUCKET)
          .upload(fxKitStoragePath(result.business_id, id), blob, {
            contentType: 'image/png',
            upsert: true,
          });
        if (upErr) throw new Error(upErr.message);
        await acknowledgeSharedDesignImage(result);
        if (currentScope.current === scopeKey) {
          setUrls((u) => ({ ...u, [id]: publicUrl(id) }));
          setStatuses((s) => ({ ...s, [id]: 'done' }));
        }
        return true;
      } catch (error) {
        if (currentScope.current === scopeKey) {
          setStatuses((s) => ({ ...s, [id]: 'error' }));
          setErrors((s) => ({ ...s, [id]: error instanceof Error ? error.message : 'No se pudo guardar el objeto. Recupera el resultado para continuar.' }));
        }
        return false;
      } finally {
        busyObjects.current.delete(busyKey);
      }
    },
    [activeBusinessId, actorId, scopeKey, assertScope, publicUrl, imageSettings],
  );

  /** Sube una imagen propia como objeto del kit (reemplazo manual). */
  const replaceObject = useCallback(
    async (id: FxKitObjectId, file: File): Promise<boolean> => {
      if (!activeBusinessId || !actorId || currentScope.current !== scopeKey) return false;
      const businessId = activeBusinessId;
      const busyKey = `${scopeKey}:${id}`;
      if (busyObjects.current.has(busyKey)) return false;
      busyObjects.current.add(busyKey);
      setStatuses((s) => ({ ...s, [id]: 'generating' }));
      try {
        await assertScope();
        const { error: upErr } = await supabase.storage
          .from(FX_KIT_BUCKET)
          .upload(fxKitStoragePath(businessId, id), file, {
            contentType: file.type || 'image/png',
            upsert: true,
          });
        if (upErr) throw new Error(upErr.message);
        await assertScope();
        setUrls((u) => ({ ...u, [id]: publicUrl(id) }));
        setStatuses((s) => ({ ...s, [id]: 'done' }));
        return true;
      } catch {
        if (currentScope.current === scopeKey) setStatuses((s) => ({ ...s, [id]: 'error' }));
        return false;
      } finally {
        busyObjects.current.delete(busyKey);
      }
    },
    [activeBusinessId, actorId, scopeKey, assertScope, publicUrl],
  );

  /** Genera todos los objetos que faltan (o todos). */
  const generateMissing = useCallback(async (): Promise<void> => {
    if (!activeBusinessId || !actorId || currentScope.current !== scopeKey || busyBatch.current === scopeKey) return;
    busyBatch.current = scopeKey;
    setIsBusy(true);
    try {
      for (const obj of FX_KIT) {
        await assertScope();
        if (urls[obj.id]) continue;
        await generateObject(obj.id);
      }
    } catch {
      // A changed session ends this batch. Any started job remains recoverable.
    } finally {
      if (busyBatch.current === scopeKey) busyBatch.current = null;
      if (currentScope.current === scopeKey) setIsBusy(false);
    }
  }, [activeBusinessId, actorId, scopeKey, assertScope, urls, generateObject]);

  const isComplete = FX_KIT.every((o) => !!urls[o.id]);

  const visible = stateScope === scopeKey;
  return { urls: visible ? urls : {}, statuses: visible ? statuses : {}, errors: visible ? errors : {},
    isBusy: visible && isBusy, isComplete: visible && isComplete, generateObject, replaceObject, generateMissing, imageSettings, setImageSettings };
}
