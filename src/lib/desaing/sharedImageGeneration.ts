import { supabase } from '@/integrations/supabase/client';
import { createDesignServerClient } from './serverClient';
import { createAssetGenerationClient, type SharedImageRequest, type SharedImageScope, type SharedDesignImageResult } from './assetGenerationClient';
import { normalizeDesignImageReference } from './imageReference';
export type { SharedImageRequest, SharedImageScope, SharedDesignImageResult };
let configured: ReturnType<typeof createAssetGenerationClient> | undefined;

/** The authenticated common engine; no fallback to a legacy image executor. */
function engine() {
  if (import.meta.env.VITE_DESAING_SERVER_ENABLED !== 'true') throw new Error('Activa el motor compartido de diseño para generar imágenes.');
  return configured ??= createAssetGenerationClient({
    client: createDesignServerClient({ endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/desaing-server`,
      publicKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      async getSession() { const { data, error } = await supabase.auth.getSession();
        return error || !data.session ? null : { actorId: data.session.user.id, accessToken: data.session.access_token }; } }),
    storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key), key: index => localStorage.key(index), get length() { return localStorage.length; } },
    normalizeReference: normalizeDesignImageReference,
    async exclusive(key, action) {
      if (!navigator.locks) throw new Error('Abre el generador en un navegador compatible con recuperación de imágenes.');
      return navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Hay una generación en curso. Espera su resultado antes de iniciar otra.');
        return action();
      });
    },
    async prepare(request) {
      const { referenceImageBase64: _reference, imageCount: _count, business_id: _business, ...metadata } = request;
      // Preserve the original prompt branch; its only permitted operation here is text preparation.
      const { data, error } = await supabase.functions.invoke('generate-design-image', { body: { ...metadata, mode: 'prompts' } });
      if (error || data?.error || !data?.promptUsed?.promptFinal) throw new Error('No se pudo preparar el prompt de imagen. Revisa el encargo.');
      return { promptFinal: data.promptUsed.promptFinal, negativeInstructions: data.promptUsed.negativeInstructions };
    },
  });
}
const changed = () => window.dispatchEvent(new Event('scory:shared-images-changed'));
export async function generateSharedDesignImage(request: SharedImageRequest, scope: SharedImageScope) {
  try { return await engine().generate(request, scope); } finally { changed(); }
}
export const recoverSharedDesignImage = (scope: SharedImageScope) => engine().recover(scope);
export async function acknowledgeSharedDesignImage(result: SharedDesignImageResult) {
  await engine().acknowledge(result); changed();
}
export const listPendingSharedImages = (businessId: string, process?: SharedImageScope['process']) => engine().pending(businessId, process);
