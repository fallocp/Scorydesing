/** The slide being worked on survives a remount or reload of the presentations page,
 * so reopening the design popup never jumps back to slide 1 (and its own sessions). */
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
const key = (businessId: string, presentationId: string) => `xending-active-slide-${businessId}-${presentationId}`;
const browserStorage = () => { try { return globalThis.localStorage; } catch { return undefined; } };

export function rememberActiveSlide(businessId: string, presentationId: string, slideId: string, storage: Writer | undefined = browserStorage()) {
  try { storage?.setItem(key(businessId, presentationId), slideId); } catch { /* Selection hint only. */ }
}

/** The «Diseñar diapositiva» popup survives a remount or reload of the page in this tab (sessionStorage):
 * its open state is page state, so any remount used to close it while its session stayed saved. */
const popupKey = (businessId: string, presentationId: string) => `xending-design-popup-${businessId}-${presentationId}`;
const tabStorage = () => { try { return globalThis.sessionStorage; } catch { return undefined; } };
export function rememberDesignPopup(businessId: string, presentationId: string, open: boolean,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = tabStorage()) {
  try { if (open) storage?.setItem(popupKey(businessId, presentationId), '1'); else storage?.removeItem(popupKey(businessId, presentationId)); }
  catch { /* Hint only. */ }
}
export function rememberedDesignPopup(businessId: string, presentationId: string, storage: Reader | undefined = tabStorage()): boolean {
  try { return storage?.getItem(popupKey(businessId, presentationId)) === '1'; } catch { return false; }
}

/** Index of the remembered slide in this deck, or 0 when it no longer exists. */
export function rememberedSlideIndex(slides: ReadonlyArray<{ id: string }>, businessId: string, presentationId: string,
  storage: Reader | undefined = browserStorage()): number {
  let id: string | null = null;
  try { id = storage?.getItem(key(businessId, presentationId)) ?? null; } catch { /* Selection hint only. */ }
  return Math.max(0, slides.findIndex(slide => slide.id === id));
}
