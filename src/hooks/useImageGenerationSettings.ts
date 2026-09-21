import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_IMAGE_GENERATION_SETTINGS, imageGenerationPreferenceKey, isImageGenerationSettings,
  parseImageGenerationSettings, type ImageGenerationSettings } from '@/lib/imageGenerationSettings';

const cache = new Map<string, { raw: string | null; value: ImageGenerationSettings; memoryOnly?: boolean }>();
const listeners = new Map<string, Set<() => void>>();
function read(key: string | null): ImageGenerationSettings {
  if (!key) return DEFAULT_IMAGE_GENERATION_SETTINGS;
  if (cache.get(key)?.memoryOnly) return cache.get(key)!.value;
  let raw: string | null;
  try { raw = localStorage.getItem(key); }
  catch { return cache.get(key)?.value ?? DEFAULT_IMAGE_GENERATION_SETTINGS; }
  const saved = cache.get(key);
  if (saved?.raw === raw) return saved.value;
  const value = parseImageGenerationSettings(raw); cache.set(key, { raw, value }); return value;
}
function notify(key: string) { listeners.get(key)?.forEach(listener => listener()); }

/** Preferences are isolated by business and workflow; reading or changing them never generates an image. */
export function useImageGenerationSettings(businessId: string | null | undefined, processKey: string) {
  const key = imageGenerationPreferenceKey(businessId, processKey);
  const subscribe = useCallback((listener: () => void) => {
    if (!key) return () => {};
    const group = listeners.get(key) ?? new Set<() => void>(); group.add(listener); listeners.set(key, group);
    const onStorage = (event: StorageEvent) => { if (event.key === key || event.key === null) { cache.delete(key); notify(key); } };
    window.addEventListener('storage', onStorage);
    return () => { group.delete(listener); if (!group.size) listeners.delete(key); window.removeEventListener('storage', onStorage); };
  }, [key]);
  const snapshot = useCallback(() => read(key), [key]);
  const settings = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_IMAGE_GENERATION_SETTINGS);
  const setSettings = useCallback((value: ImageGenerationSettings) => {
    if (!key || !isImageGenerationSettings(value)) return;
    const next = { model: value.model, quality: value.quality }, raw = JSON.stringify(next);
    cache.set(key, { raw, value: next });
    try { localStorage.setItem(key, raw); } catch { cache.set(key, { raw, value: next, memoryOnly: true }); }
    notify(key);
  }, [key]);
  return { settings, setSettings };
}
