/**
 * useCarouselQueue — Stage C of the Design Studio flow.
 *
 * Owns the lifecycle of a carousel derived from an approved bank copy:
 *
 *   1. `createScript`   copy semilla → N slide copies + a recurring visual motif
 *   2. `updateSlideCopy` the user fixes the wording (mandatory before step 3)
 *   3. `buildPrompts`   one self-contained image prompt per slide, single call
 *   4. `generateSlot`   renders ONE slide; `generateAll` runs the same path in
 *                       sequence, so a bad slide is retried on its own
 *
 * Source of truth is `piece_v2.carousel` on the seed copy's bank row, not the
 * session store: the carousel belongs to the copy, and duplicating it in the
 * store would give two places to disagree. Only the rendered base64 is kept in
 * memory — persisting four images inside a JSONB column would add megabytes to
 * every copy-bank query.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useSaveMockup } from './useDesignMockups';
import { useUpdateBankMeta, type CopyBankItem } from './useDesignCopyBank';
import {
  brandElementsForRole,
  CAROUSEL_ASPECT_RATIO,
  CAROUSEL_DIMENSIONS,
  CAROUSEL_ROLE_BRIEFS,
  getCarouselPreset,
  type CarouselMeta,
  type CarouselSlideCopy,
  type CarouselSlot,
  type CarouselSlotStatus,
  type DesignImageType,
} from '@/types/design-studio';
import {
  imageTypeToPromptVariant,
  resolveMasterImagePromptSelection,
} from '@/utils/design-studio/masterImagePrompt';

/** A slot plus the transient render output, which is never persisted. */
export interface CarouselSlotRuntime extends CarouselSlot {
  /** In-memory only — lives until the page is reloaded. */
  imageBase64?: string;
}

export interface UseCarouselQueueParams {
  /** The approved bank copy this carousel derives from. */
  bankItem: CopyBankItem | null;
  branchId: string | null;
  /** Visible "Fondo" choice, resolved to a master prompt snapshot. */
  background: string | null;
  /** Medium for the whole set. Mixing mediums breaks the set. */
  imageType: DesignImageType;
  brandSlug: string | undefined;
  /**
   * Where to write the carousel state.
   *
   * Defaults to `generated_ideas.piece_v2` via useUpdateBankMeta, which is
   * correct for v1 bank rows. Copies coming from `copy_bank_items` pass their own
   * writer: their id does not exist in generated_ideas, so the default update
   * would match zero rows and silently drop the carousel.
   */
  persistMeta?: (patch: {
    imageMode: 'carousel';
    carousel: CarouselMeta;
  }) => Promise<void>;
}

const IMAGE_SIZE = `${CAROUSEL_DIMENSIONS.width}x${CAROUSEL_DIMENSIONS.height}`;

/**
 * Platform recorded on the saved mockups. Carousel slides use the same square
 * canvas as a regular post, so they belong to the same platform bucket.
 */
const CAROUSEL_PLATFORM = 'instagram-post';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Drop the in-memory image before writing the carousel back to the bank row. */
function toPersisted(slots: CarouselSlotRuntime[]): CarouselSlot[] {
  return slots.map(({ imageBase64: _omit, ...slot }) => slot);
}

export function useCarouselQueue({
  bankItem,
  branchId,
  background,
  imageType,
  brandSlug,
  persistMeta,
}: UseCarouselQueueParams) {
  const { activeBusinessId } = useActiveBusiness();
  const saveMockup = useSaveMockup();
  const updateBankMeta = useUpdateBankMeta();

  const [slots, setSlots] = useState<CarouselSlotRuntime[]>([]);
  /**
   * Mirror of `slots` updated synchronously on every write.
   *
   * `generateAll` awaits `generateSlot` in a loop, so reading `slots` from the
   * closure would hand every iteration the state as it looked before the loop
   * started and each slide would overwrite the previous one's result. Reading
   * the ref keeps the queue consistent and also keeps `generateSlot` identity
   * stable across renders.
   */
  const slotsRef = useRef<CarouselSlotRuntime[]>([]);
  const [visualAnchor, setVisualAnchor] = useState('');
  const [visualMotif, setVisualMotif] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [presetSlug, setPresetSlug] = useState<string | null>(null);
  const [isScripting, setIsScripting] = useState(false);
  const [isBuildingPrompts, setIsBuildingPrompts] = useState(false);
  /** Index currently rendering, or null. Only one image at a time. */
  const [renderingIndex, setRenderingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Lets `generateAll` bail out mid-queue. */
  const cancelRef = useRef(false);

  /** Single write path: keeps the ref and the state in lockstep. */
  const applySlots = useCallback((next: CarouselSlotRuntime[]) => {
    slotsRef.current = next;
    setSlots(next);
  }, []);

  const patchSlot = useCallback(
    (index: number, patch: Partial<CarouselSlotRuntime>) => {
      applySlots(
        slotsRef.current.map((s) => (s.index === index ? { ...s, ...patch } : s)),
      );
    },
    [applySlots],
  );

  // Hydrate from the active bank row. Images are not persisted, so a restored
  // carousel shows its prompts and copy but its slides render as pending.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    const rowId = bankItem?.row.id ?? null;
    if (hydratedFor.current === rowId) return;
    hydratedFor.current = rowId;

    const carousel = bankItem?.meta.carousel;
    if (!carousel) {
      applySlots([]);
      setVisualAnchor('');
      setVisualMotif('');
      setGroupId(null);
      setPresetSlug(null);
      setError(null);
      return;
    }

    applySlots(
      carousel.slots.map((slot) => ({
        ...slot,
        // A slide with a stored image is done even though the base64 is gone.
        status: slot.imageUrl ? 'done' : slot.status === 'done' ? 'idle' : slot.status,
      })),
    );
    setVisualAnchor(carousel.visualAnchor);
    setGroupId(carousel.groupId);
    setPresetSlug(carousel.presetSlug);
    setError(null);
  }, [bankItem?.row.id, bankItem?.meta.carousel, applySlots]);

  /** Write the carousel back onto the seed copy's bank row. */
  const persist = useCallback(
    async (next: {
      slots: CarouselSlotRuntime[];
      visualAnchor?: string;
      groupId?: string;
      presetSlug?: string;
      imageType?: DesignImageType;
    }) => {
      if (!bankItem) return;

      const meta: CarouselMeta = {
        presetSlug: next.presetSlug ?? presetSlug ?? '',
        visualAnchor: next.visualAnchor ?? visualAnchor,
        groupId: next.groupId ?? groupId ?? crypto.randomUUID(),
        imageType: next.imageType ?? imageType,
        slots: toPersisted(next.slots),
        createdAt: bankItem.meta.carousel?.createdAt ?? new Date().toISOString(),
      };

      if (persistMeta) {
        await persistMeta({ imageMode: 'carousel', carousel: meta });
        return;
      }

      await updateBankMeta.mutateAsync({
        id: bankItem.row.id,
        currentMeta: bankItem.meta,
        meta: { imageMode: 'carousel', carousel: meta },
      });
    },
    [bankItem, presetSlug, visualAnchor, groupId, imageType, updateBankMeta, persistMeta],
  );

  // -------------------------------------------------------------------------
  // 1. Script: seed copy → slide copies + visual motif
  // -------------------------------------------------------------------------

  const createScript = useCallback(
    async (params: { presetSlug: string; guidance?: string }) => {
      if (!bankItem || !activeBusinessId) return false;

      const preset = getCarouselPreset(params.presetSlug);
      setIsScripting(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'generate-carousel-script',
          {
            body: {
              business_id: activeBusinessId,
              branch_id: branchId,
              vertical_id: bankItem.row.vertical_id ?? null,
              seedCopy: {
                headline: bankItem.row.headline,
                body: bankItem.row.subcopy ?? '',
                cta: bankItem.row.cta ?? '',
              },
              slides: preset.roles.map((role) => ({
                role,
                brief: CAROUSEL_ROLE_BRIEFS[role],
                brandElements: brandElementsForRole(preset, role),
              })),
              angleName: bankItem.meta.angleName,
              industryName: bankItem.meta.industryName,
              imageType,
              guidance: params.guidance?.trim() || undefined,
            },
          },
        );

        if (fnError || !Array.isArray(data?.slides)) {
          throw new Error(data?.message ?? fnError?.message ?? 'No se generó el guion');
        }

        const newGroupId = crypto.randomUUID();
        const nextSlots: CarouselSlotRuntime[] = preset.roles.map((role, i) => {
          const scripted = data.slides[i] ?? {};
          return {
            id: crypto.randomUUID(),
            index: i,
            role,
            slideCopy: {
              headline: scripted.headline ?? '',
              body: scripted.body ?? '',
              cta: scripted.cta ?? '',
            },
            imageIntent: scripted.imageIntent ?? '',
            // Filled in step 3, after the user settles the copy.
            prompt: '',
            brandElements: brandElementsForRole(preset, role),
            status: 'idle' as CarouselSlotStatus,
          };
        });

        applySlots(nextSlots);
        setVisualMotif(typeof data.visualMotif === 'string' ? data.visualMotif : '');
        setGroupId(newGroupId);
        setPresetSlug(params.presetSlug);
        setVisualAnchor('');

        await persist({
          slots: nextSlots,
          visualAnchor: '',
          groupId: newGroupId,
          presetSlug: params.presetSlug,
        });

        return true;
      } catch (err) {
        setError(errorMessage(err, 'Error generando el guion del carrusel'));
        return false;
      } finally {
        setIsScripting(false);
      }
    },
    [bankItem, activeBusinessId, branchId, imageType, persist, applySlots],
  );

  // -------------------------------------------------------------------------
  // 2. Copy edits — the exact text is baked into the prompt, so it has to be
  //    final before prompts are built.
  // -------------------------------------------------------------------------

  const updateSlideCopy = useCallback(
    (index: number, field: keyof CarouselSlideCopy, value: string) => {
      applySlots(
        slotsRef.current.map((s) =>
          s.index === index
            ? {
                ...s,
                slideCopy: { ...s.slideCopy, [field]: value },
                // The prompt quotes the old wording verbatim, so it is now
                // stale: dropping it forces a rebuild instead of rendering
                // text the user already changed.
                prompt: '',
                status: 'idle' as CarouselSlotStatus,
              }
            : s,
        ),
      );
    },
    [applySlots],
  );

  const saveSlideCopy = useCallback(async () => {
    if (slotsRef.current.length === 0) return;
    await persist({ slots: slotsRef.current });
  }, [persist]);

  // -------------------------------------------------------------------------
  // 3. Prompts: one self-contained prompt per slide, single call
  // -------------------------------------------------------------------------

  const buildPrompts = useCallback(async () => {
    const current = slotsRef.current;
    if (!bankItem || !activeBusinessId || current.length === 0) return false;

    const incomplete = current.filter((s) => !s.slideCopy.headline.trim());
    if (incomplete.length > 0) {
      setError(`${incomplete.length} slide(s) sin headline. Complétalos antes de generar los prompts.`);
      return false;
    }

    const promptSelection = resolveMasterImagePromptSelection(background);
    setIsBuildingPrompts(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-design-image', {
        body: {
          // Required by the function's shared validation.
          userRequest: bankItem.row.headline,
          brand: brandSlug === 'xending-capital' ? 'xending_capital' : 'xending',
          business_id: activeBusinessId,
          branch_id: branchId,
          vertical_id: bankItem.row.vertical_id ?? undefined,
          mode: 'carousel_prompts',
          imageType: imageTypeToPromptVariant(imageType),
          visualMotif,
          carouselSlides: current.map((s) => ({
            index: s.index,
            role: s.role,
            headline: s.slideCopy.headline,
            body: s.slideCopy.body,
            cta: s.slideCopy.cta,
            imageIntent: s.imageIntent || s.slideCopy.headline,
            brandElements: s.brandElements,
          })),
          // Seed-level context for the interpolated master prompt.
          headline: bankItem.row.headline,
          body: bankItem.row.subcopy ?? '',
          imageIntent: visualMotif || bankItem.row.headline,
          angle: bankItem.meta.angleName ?? 'general',
          backgroundStyle: promptSelection.backgroundStyle,
          masterPromptVersion: promptSelection.masterPromptVersion,
          corridorMode: bankItem.meta.corridorOverride?.mode ?? 'auto',
          corridorFlowType: bankItem.meta.corridorOverride?.flowType ?? 'auto',
          aspectRatio: CAROUSEL_ASPECT_RATIO,
          imageSize: IMAGE_SIZE,
        },
      });

      const built = data?.carousel?.slides;
      if (fnError || !Array.isArray(built)) {
        throw new Error(data?.message ?? fnError?.message ?? 'No se generaron los prompts');
      }

      const promptByIndex = new Map<number, string>(
        built.map((s: { index: number; promptFinal: string }) => [s.index, s.promptFinal]),
      );

      const nextSlots = current.map((s) => ({
        ...s,
        prompt: promptByIndex.get(s.index) ?? s.prompt,
        status: 'idle' as CarouselSlotStatus,
        error: undefined,
      }));

      const anchor = typeof data.carousel.designBlock === 'string' ? data.carousel.designBlock : '';

      applySlots(nextSlots);
      setVisualAnchor(anchor);
      await persist({ slots: nextSlots, visualAnchor: anchor });

      return true;
    } catch (err) {
      setError(errorMessage(err, 'Error generando los prompts del carrusel'));
      return false;
    } finally {
      setIsBuildingPrompts(false);
    }
  }, [bankItem, activeBusinessId, branchId, background, imageType, visualMotif, brandSlug, persist, applySlots]);

  const updateSlotPrompt = useCallback(
    (index: number, prompt: string) => {
      patchSlot(index, { prompt, status: 'idle', error: undefined });
    },
    [patchSlot],
  );

  // -------------------------------------------------------------------------
  // 4. Render — one slide at a time
  // -------------------------------------------------------------------------

  /**
   * Render a single slide. `generateAll` calls this same function in sequence,
   * so retrying one failed slide behaves identically to generating it the first
   * time — there is no second code path that could drift.
   */
  const generateSlot = useCallback(
    async (index: number): Promise<boolean> => {
      if (!activeBusinessId || !bankItem) return false;

      const slot = slotsRef.current.find((s) => s.index === index);
      if (!slot) return false;

      if (!slot.prompt.trim()) {
        patchSlot(index, { status: 'error', error: 'Este slide no tiene prompt todavía.' });
        return false;
      }

      const effectiveGroupId = groupId ?? crypto.randomUUID();
      if (!groupId) setGroupId(effectiveGroupId);

      setRenderingIndex(index);
      patchSlot(index, { status: 'generating', error: undefined });

      try {
        const { data, error: fnError } = await supabase.functions.invoke('generate-design-image', {
          body: {
            userRequest: slot.slideCopy.headline,
            brand: brandSlug === 'xending-capital' ? 'xending_capital' : 'xending',
            business_id: activeBusinessId,
            branch_id: branchId,
            vertical_id: bankItem.row.vertical_id ?? undefined,
            mode: 'generate',
            imageType: imageTypeToPromptVariant(imageType),
            // Passed verbatim to the image model — no rebuilding.
            promptFinal: slot.prompt,
            imageIntent: slot.imageIntent,
            angle: bankItem.meta.angleName ?? 'general',
            aspectRatio: CAROUSEL_ASPECT_RATIO,
            imageSize: IMAGE_SIZE,
            imageQuality: 'high',
          },
        });

        const imageBase64: string | undefined = data?.imageBase64;
        if (fnError || !imageBase64) {
          throw new Error(data?.message ?? fnError?.message ?? 'No se generó la imagen');
        }

        const saved = await saveMockup.mutateAsync({
          imageBase64,
          platform: CAROUSEL_PLATFORM,
          promptUsed: slot.prompt,
          carouselGroupId: effectiveGroupId,
          carouselIndex: index,
        });

        // Persist the pointer, keep the pixels in memory. Read from the ref so a
        // queued run picks up the slides finished by earlier iterations.
        const nextSlots = slotsRef.current.map((s) =>
          s.index === index
            ? {
                ...s,
                status: 'done' as CarouselSlotStatus,
                mockupId: saved.mockupId,
                imageUrl: saved.imageUrl,
                imageBase64,
                error: undefined,
              }
            : s,
        );
        applySlots(nextSlots);
        await persist({ slots: nextSlots, groupId: effectiveGroupId });

        return true;
      } catch (err) {
        const message = errorMessage(err, 'Error generando la imagen');
        patchSlot(index, { status: 'error', error: message });
        setError(message);
        return false;
      } finally {
        setRenderingIndex(null);
      }
    },
    [activeBusinessId, bankItem, groupId, branchId, imageType, brandSlug, saveMockup, patchSlot, persist, applySlots],
  );

  /**
   * Render every pending slide in order. Sequential, not parallel: the image API
   * rate-limits bursts, and a serial queue lets the user watch the set build and
   * stop it partway without wasting the remaining renders.
   */
  const generateAll = useCallback(async () => {
    cancelRef.current = false;
    const pending = slotsRef.current.filter((s) => s.status !== 'done').map((s) => s.index);
    if (pending.length === 0) return;

    applySlots(
      slotsRef.current.map((s) =>
        pending.includes(s.index) ? { ...s, status: 'queued' as CarouselSlotStatus } : s,
      ),
    );

    for (const index of pending) {
      if (cancelRef.current) break;
      // Stop on the first failure instead of burning the remaining renders on a
      // set that is already incomplete. The user retries that slide alone.
      const ok = await generateSlot(index);
      if (!ok) break;
    }

    applySlots(
      slotsRef.current.map((s) =>
        s.status === 'queued' ? { ...s, status: 'idle' as CarouselSlotStatus } : s,
      ),
    );
  }, [generateSlot, applySlots]);

  const cancelQueue = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    applySlots([]);
    setVisualAnchor('');
    setVisualMotif('');
    setGroupId(null);
    setPresetSlug(null);
    setError(null);
    hydratedFor.current = null;
  }, [applySlots]);

  const hasPrompts = slots.length > 0 && slots.every((s) => s.prompt.trim().length > 0);
  const doneCount = slots.filter((s) => s.status === 'done').length;

  return {
    slots,
    visualAnchor,
    visualMotif,
    groupId,
    presetSlug,
    // Flags
    isScripting,
    isBuildingPrompts,
    renderingIndex,
    isBusy: isScripting || isBuildingPrompts || renderingIndex !== null,
    hasPrompts,
    doneCount,
    error,
    // Actions
    createScript,
    updateSlideCopy,
    saveSlideCopy,
    buildPrompts,
    updateSlotPrompt,
    generateSlot,
    generateAll,
    cancelQueue,
    reset,
  };
}
