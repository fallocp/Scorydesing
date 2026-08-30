/**
 * useFxKit — genera y administra el kit de objetos del Daily Report FX.
 *
 * Cada objeto se genera UNA vez con `generate-design-image` (mode generate) y se
 * sube a Storage con nombre fijo (`{business}/fx-kit/{id}.png`, upsert). El reporte
 * diario reutiliza esas URLs; regenerar o reemplazar un objeto sobrescribe su PNG.
 *
 * No requiere tabla: la existencia se consulta listando la carpeta en Storage.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
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
  const [urls, setUrls] = useState<Partial<Record<FxKitObjectId, string>>>({});
  const [statuses, setStatuses] = useState<Partial<Record<FxKitObjectId, KitStatus>>>({});
  const [isBusy, setIsBusy] = useState(false);

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
    if (!activeBusinessId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.storage
        .from(FX_KIT_BUCKET)
        .list(`${activeBusinessId}/fx-kit`, { limit: 100 });
      if (cancelled || error || !data) return;
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
  }, [activeBusinessId]);

  /** Genera un objeto y lo sube a su ruta fija (sobrescribe). */
  const generateObject = useCallback(
    async (id: FxKitObjectId): Promise<boolean> => {
      if (!activeBusinessId) return false;
      const obj = FX_KIT.find((o) => o.id === id);
      if (!obj) return false;

      setStatuses((s) => ({ ...s, [id]: 'generating' }));
      try {
        // El hero es una escena (banda superior) → horizontal. Los objetos van
        // aislados en cuadrado.
        const imageSize = id === 'hero' ? '1536x1024' : '1024x1024';
        const aspectRatio = id === 'hero' ? '3:2' : '1:1';
        const { data, error: fnError } = await supabase.functions.invoke('generate-design-image', {
          body: {
            business_id: activeBusinessId,
            userRequest: obj.label,
            brand: 'xending',
            mode: 'generate',
            promptFinal: obj.prompt,
            imageType: 'fotografia',
            aspectRatio,
            imageSize,
            imageQuality: 'medium',
          },
        });
        const base64: string | undefined = (data as { imageBase64?: string })?.imageBase64;
        if (fnError || !base64) {
          throw new Error((data as { message?: string })?.message ?? fnError?.message ?? 'No se generó el objeto');
        }

        const { error: upErr } = await supabase.storage
          .from(FX_KIT_BUCKET)
          .upload(fxKitStoragePath(activeBusinessId, id), base64ToBlob(base64), {
            contentType: 'image/png',
            upsert: true,
          });
        if (upErr) throw new Error(upErr.message);

        setUrls((u) => ({ ...u, [id]: publicUrl(id) }));
        setStatuses((s) => ({ ...s, [id]: 'done' }));
        return true;
      } catch {
        setStatuses((s) => ({ ...s, [id]: 'error' }));
        return false;
      }
    },
    [activeBusinessId, publicUrl],
  );

  /** Sube una imagen propia como objeto del kit (reemplazo manual). */
  const replaceObject = useCallback(
    async (id: FxKitObjectId, file: File): Promise<boolean> => {
      if (!activeBusinessId) return false;
      setStatuses((s) => ({ ...s, [id]: 'generating' }));
      try {
        const { error: upErr } = await supabase.storage
          .from(FX_KIT_BUCKET)
          .upload(fxKitStoragePath(activeBusinessId, id), file, {
            contentType: file.type || 'image/png',
            upsert: true,
          });
        if (upErr) throw new Error(upErr.message);
        setUrls((u) => ({ ...u, [id]: publicUrl(id) }));
        setStatuses((s) => ({ ...s, [id]: 'done' }));
        return true;
      } catch {
        setStatuses((s) => ({ ...s, [id]: 'error' }));
        return false;
      }
    },
    [activeBusinessId, publicUrl],
  );

  /** Genera todos los objetos que faltan (o todos). */
  const generateMissing = useCallback(async (): Promise<void> => {
    setIsBusy(true);
    try {
      for (const obj of FX_KIT) {
        if (urls[obj.id]) continue;
        await generateObject(obj.id);
      }
    } finally {
      setIsBusy(false);
    }
  }, [urls, generateObject]);

  const isComplete = FX_KIT.every((o) => !!urls[o.id]);

  return { urls, statuses, isBusy, isComplete, generateObject, replaceObject, generateMissing };
}
