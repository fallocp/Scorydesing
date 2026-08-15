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
  accumulatedFxImpact,
  brandElementsForSlide,
  DEFAULT_CAROUSEL_OBJECTIVE,
  type CarouselObjective,
  buildFigureDocuments,
  computeCarouselFx,
  DEFAULT_CAROUSEL_FX,
  CAROUSEL_ASPECT_RATIO,
  CAROUSEL_DIMENSIONS,
  CAROUSEL_ROLE_BRIEFS,
  CAROUSEL_ROLE_LAYOUT_HINT,
  getCarouselPreset,
  type CarouselFigureScenario,
  type CarouselFxAssumptions,
  type CarouselMeta,
  type CarouselSlideRole,
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
 * What each moment is called in the table the script agent reads.
 *
 * Named by position in the mechanism, not by the stamp a slide prints. The stamps
 * differ per slide — the two-state comparison stamps HOY and PAGO on the base and
 * the final moment, while the accumulation slide stamps three successive purchases
 * across all three — so a single set of stamps here would describe one slide and
 * misdescribe the other. `buildFigureDocuments` owns the stamps.
 */
const FX_MOMENT_LABELS = ['MOMENTO BASE', 'MOMENTO INTERMEDIO', 'MOMENTO FINAL'];

/**
 * Which slides carry figure documents, and which numeric story each one tells.
 *
 * Only two beats need numbers: the one explaining the mechanism, which needs the
 * same operation at two moments, and the one about repetition, which needs the same
 * operation several times. The rest communicate without figures — the guidance is
 * one numeric slide per set, two at most.
 */
const FIGURE_SCENARIO_BY_ROLE: Partial<Record<CarouselSlideRole, CarouselFigureScenario>> = {
  shift: 'two_moment',
  risk: 'repeated_purchases',
  problem: 'two_moment',
  example: 'repeated_purchases',
};

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
  /** What the set is for. Decides the closing and the brand budget. */
  const [objective, setObjective] = useState<CarouselObjective>(DEFAULT_CAROUSEL_OBJECTIVE);
  const [isScripting, setIsScripting] = useState(false);
  const [isBuildingPrompts, setIsBuildingPrompts] = useState(false);
  /** Fetching the visual spec from the single-image path. */
  const [isBuildingAnchor, setIsBuildingAnchor] = useState(false);
  /** Slide whose prompt is being written, or null. One request at a time. */
  const [promptingIndex, setPromptingIndex] = useState<number | null>(null);
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
      setObjective(DEFAULT_CAROUSEL_OBJECTIVE);
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
    setVisualMotif(carousel.visualMotif ?? '');
    setGroupId(carousel.groupId);
    setPresetSlug(carousel.presetSlug);
    // Older carousels have no objective. They were written under the fixed rules,
    // which are what 'vender' now reproduces, so that is the honest label for them.
    setObjective(carousel.objective ?? 'vender');
    setError(null);
  }, [bankItem?.row.id, bankItem?.meta.carousel, applySlots]);

  /** Write the carousel back onto the seed copy's bank row. */
  const persist = useCallback(
    async (next: {
      slots: CarouselSlotRuntime[];
      visualAnchor?: string;
      visualMotif?: string;
      groupId?: string;
      presetSlug?: string;
      objective?: CarouselObjective;
      imageType?: DesignImageType;
    }) => {
      if (!bankItem) return;

      const meta: CarouselMeta = {
        presetSlug: next.presetSlug ?? presetSlug ?? '',
        objective: next.objective ?? objective,
        visualAnchor: next.visualAnchor ?? visualAnchor,
        visualMotif: next.visualMotif ?? visualMotif,
        visualMode: getCarouselPreset(next.presetSlug ?? presetSlug ?? '').visualMode,
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
    [bankItem, presetSlug, objective, visualAnchor, visualMotif, groupId, imageType, updateBankMeta, persistMeta],
  );

  // -------------------------------------------------------------------------
  // 1. Script: seed copy → slide copies + visual motif
  // -------------------------------------------------------------------------

  const createScript = useCallback(
    async (params: {
      presetSlug: string;
      objective?: CarouselObjective;
      guidance?: string;
      fx?: CarouselFxAssumptions;
    }) => {
      if (!bankItem || !activeBusinessId) return false;

      const preset = getCarouselPreset(params.presetSlug);
      /**
       * Read from the params, not from state.
       *
       * The panel owns the chips and calls this in the same tick it would have set
       * the hook's state, so reading state here would send the previous objective on
       * the very first script — the one case where getting it wrong is most visible.
       */
      const nextObjective = params.objective ?? objective;
      const fxMoments = computeCarouselFx(params.fx ?? DEFAULT_CAROUSEL_FX);
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
              slides: preset.roles.map((role, i) => ({
                role,
                brief: CAROUSEL_ROLE_BRIEFS[role],
                brandElements: brandElementsForSlide(preset, i),
                // Composition that suits this beat. The agent may override it; what
                // it may not do is use the same one twice in the set.
                layoutHint: CAROUSEL_ROLE_LAYOUT_HINT[role],
              })),
              // Text density belongs to the preset, not to the agent.
              visualMode: preset.visualMode,
              // Y cómo se lee la estructura: sin esto, un checklist sale escrito con
              // las reglas de un arco encadenado y deja de ser un checklist.
              narrativeRules: preset.narrativeRules,
              // What the set is for: decides who owns the closing line and whether
              // the brand name appears in the copy at all.
              objective: nextObjective,
              angleName: bankItem.meta.angleName,
              industryName: bankItem.meta.industryName,
              imageType,
              /**
               * Figures computed here, not by the agent.
               *
               * The rate and the totals have to satisfy USD x TC = MXN when a reader
               * multiplies them, and a language model does not produce three
               * mutually consistent numbers reliably. The agent never places these —
               * they reach the image as documents — it only writes copy that agrees
               * with the mechanism they describe.
               */
              fxMoments: fxMoments.map((m, i) => ({
                label: FX_MOMENT_LABELS[i] ?? `MOMENTO ${i + 1}`,
                ...m.labels,
              })),
              /** The number the repetition slide is about: the gaps adding up. */
              fxAccumulated: accumulatedFxImpact(fxMoments).label,
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
            // Art direction from the script agent. Persisted so a regeneration keeps
            // the same intent instead of drifting back to a generic hero shot.
            brief: scripted.brief ?? undefined,
            // Filled in step 3, after the user settles the copy.
            prompt: '',
            brandElements: brandElementsForSlide(preset, i),
            status: 'idle' as CarouselSlotStatus,
          };
        });

        const scriptedMotif = typeof data.visualMotif === 'string' ? data.visualMotif : '';

        /**
         * Attach the figure documents in code, by role.
         *
         * The agent decides the narrative and the composition; it never decides a
         * number or which document a number belongs to. That is what produced three
         * cards showing the same 18.93 and a stray +4.0%: a flat list of labels has
         * no way to say which value goes where.
         */
        const withFigures = nextSlots.map((slot) => {
          const scenario = FIGURE_SCENARIO_BY_ROLE[slot.role];
          if (!scenario || !slot.brief) return slot;

          const documents = buildFigureDocuments(scenario, fxMoments);
          return {
            ...slot,
            brief: {
              ...slot.brief,
              documents,
              accumulatedLabel:
                scenario === 'repeated_purchases'
                  ? accumulatedFxImpact(fxMoments).label
                  : undefined,
            },
          };
        });

        applySlots(withFigures);
        setVisualMotif(scriptedMotif);
        setGroupId(newGroupId);
        setPresetSlug(params.presetSlug);
        setObjective(nextObjective);
        setVisualAnchor('');

        await persist({
          slots: withFigures,
          visualAnchor: '',
          // Passed explicitly: the state setter above has not landed yet, so the
          // value in `persist`'s closure is still the previous motif.
          visualMotif: scriptedMotif,
          groupId: newGroupId,
          presetSlug: params.presetSlug,
          objective: nextObjective,
        });

        return true;
      } catch (err) {
        setError(errorMessage(err, 'Error generando el guion del carrusel'));
        return false;
      } finally {
        setIsScripting(false);
      }
    },
    [bankItem, activeBusinessId, branchId, imageType, objective, persist, applySlots],
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

  /**
   * What this slide's image must communicate.
   *
   * Editable for the same reason the copy is: the agent decides it, and if it
   * picks the wrong idea the only alternative used to be regenerating the whole
   * script. Changing it invalidates the prompt, because the prompt carries the
   * scene that was built from this text.
   */
  const updateSlideImageIntent = useCallback(
    (index: number, value: string) => {
      applySlots(
        slotsRef.current.map((s) =>
          s.index === index
            ? { ...s, imageIntent: value, prompt: '', status: 'idle' as CarouselSlotStatus }
            : s,
        ),
      );
    },
    [applySlots],
  );

  /**
   * The recurring subject of the set.
   *
   * Shared by every slide, so editing it invalidates ALL the prompts — each one
   * names the motif and a set built under two different motifs stops reading as a
   * series.
   */
  const updateVisualMotif = useCallback(
    (value: string) => {
      setVisualMotif(value);
      applySlots(
        slotsRef.current.map((s) => ({
          ...s,
          prompt: '',
          status: 'idle' as CarouselSlotStatus,
        })),
      );
    },
    [applySlots],
  );

  const saveSlideCopy = useCallback(async () => {
    if (slotsRef.current.length === 0) return;
    await persist({ slots: slotsRef.current, visualMotif });
  }, [persist, visualMotif]);

  // -------------------------------------------------------------------------
  // 2.5 Visual anchor: borrow the single-image flow's own prompt
  // -------------------------------------------------------------------------

  /**
   * Bring in the visual spec from the single-image path.
   *
   * The two paths share the same master image prompt as their system message but
   * NOT their output contract: the single flow asks the model for the finished
   * `prompt_final`, while the carousel used to ask for a `designBlock` — a summary
   * the model writes about its own instructions. Anything the master prompt would
   * have injected that the summary skipped was simply lost, which is why the slides
   * came out looking less like the brand than the individual pieces.
   *
   * So instead of asking for a summary, this runs the real single-image call and
   * keeps the prompt it produces for the chosen medium. The set then inherits an
   * actual, master-faithful prompt, and the user can read and edit it — the old
   * anchor was generated, stored and never shown.
   */
  const buildVisualAnchor = useCallback(async () => {
    if (!bankItem || !activeBusinessId) return false;

    const promptSelection = resolveMasterImagePromptSelection(background);
    const variant = imageTypeToPromptVariant(imageType);

    setIsBuildingAnchor(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-design-image', {
        body: {
          // The single-image contract, narrowed to the medium this set uses: the
          // anchor only reads one variant, and asking for the other two is what
          // made the response run long enough to come back incomplete.
          mode: 'prompts',
          promptVariant: variant,
          // Sistema visual sin escena: este texto se inserta en los N slides, así
          // que cualquier objeto que traiga se repetiría en todos.
          promptScope: 'style_only',
          userRequest: bankItem.row.headline,
          brand: brandSlug === 'xending-capital' ? 'xending_capital' : 'xending',
          business_id: activeBusinessId,
          branch_id: branchId,
          vertical_id: bankItem.row.vertical_id ?? undefined,
          headline: bankItem.row.headline,
          body: bankItem.row.subcopy ?? '',
          cta: bankItem.row.cta ?? '',
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

      const promptFinal: string | undefined = data?.prompts?.[variant]?.prompt_final;
      if (fnError || !promptFinal?.trim()) {
        throw new Error(
          data?.message ?? fnError?.message ?? 'No se obtuvo el estilo de la imagen individual',
        );
      }

      // Every slide prompt quotes the anchor, so a new anchor makes the existing
      // prompts stale: they still carry the previous visual system.
      const nextSlots = slotsRef.current.map((s) => ({
        ...s,
        prompt: '',
        status: 'idle' as CarouselSlotStatus,
        error: undefined,
      }));

      applySlots(nextSlots);
      setVisualAnchor(promptFinal.trim());
      await persist({ slots: nextSlots, visualAnchor: promptFinal.trim(), visualMotif });

      return true;
    } catch (err) {
      setError(errorMessage(err, 'Error trayendo el estilo de la imagen individual'));
      return false;
    } finally {
      setIsBuildingAnchor(false);
    }
  }, [
    bankItem, activeBusinessId, branchId, background, imageType, brandSlug,
    visualMotif, persist, applySlots,
  ]);

  /** Manual edits to the anchor invalidate every prompt built from it. */
  const updateVisualAnchor = useCallback(
    (value: string) => {
      setVisualAnchor(value);
      applySlots(
        slotsRef.current.map((s) => ({
          ...s,
          prompt: '',
          status: 'idle' as CarouselSlotStatus,
        })),
      );
    },
    [applySlots],
  );

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

    /**
     * Start from a clean slate.
     *
     * Every slide of a set has to carry the SAME design block, and each build
     * produces a fresh one. Leaving the old prompts in place would let a build
     * that fails halfway leave the set straddling two visual specs, which is
     * invisible until the images come out looking unrelated.
     */
    applySlots(
      slotsRef.current.map((s) => ({
        ...s,
        prompt: '',
        status: 'idle' as CarouselSlotStatus,
        error: undefined,
      })),
    );

    // Shared context. Identical in every call so the slides stay in one family.
    const baseBody = {
      // Required by the function's shared validation.
      userRequest: bankItem.row.headline,
      brand: brandSlug === 'xending-capital' ? 'xending_capital' : 'xending',
      business_id: activeBusinessId,
      branch_id: branchId,
      vertical_id: bankItem.row.vertical_id ?? undefined,
      mode: 'carousel_prompts',
      imageType: imageTypeToPromptVariant(imageType),
      visualMotif,
      carouselTotalSlides: current.length,
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
    };

    /**
     * One request per slide, in reading order.
     *
     * Asking for the design spec plus every scene in a single response is what
     * made a 5-slide set time out at the platform's 110s ceiling, and it made one
     * slow response cost the whole set.
     *
     * Starting from an existing anchor (see `buildVisualAnchor`) means NO call has
     * to write a design block: every slide only writes its own scene, and the whole
     * set inherits the single-image flow's visual system verbatim. Without one, the
     * first call still produces a block so the flow keeps working on its own.
     */
    let anchor = visualAnchor.trim();

    try {
      for (const slot of current) {
        setPromptingIndex(slot.index);

        const { data, error: fnError } = await supabase.functions.invoke('generate-design-image', {
          body: {
            ...baseBody,
            carouselDesignBlock: anchor || undefined,
            carouselSlides: [{
              index: slot.index,
              role: slot.role,
              headline: slot.slideCopy.headline,
              body: slot.slideCopy.body,
              cta: slot.slideCopy.cta,
              imageIntent: slot.imageIntent || slot.slideCopy.headline,
              // Art direction travels with the slide: without it the prompt can only
              // ask for "an image related to this text".
              brief: slot.brief,
              brandElements: slot.brandElements,
            }],
          },
        });

        const built = data?.carousel?.slides?.[0];
        if (fnError || !built?.promptFinal) {
          throw new Error(
            data?.message ?? fnError?.message
            ?? `No se generó el prompt del slide ${slot.index + 1}`,
          );
        }

        if (!anchor && typeof data.carousel.designBlock === 'string') {
          anchor = data.carousel.designBlock;
        }

        // Write as they land: the user watches the set build, and a failure
        // partway leaves the finished prompts visible instead of discarding them.
        applySlots(
          slotsRef.current.map((s) =>
            s.index === slot.index
              ? { ...s, prompt: built.promptFinal, status: 'idle' as CarouselSlotStatus, error: undefined }
              : s,
          ),
        );
      }

      setVisualAnchor(anchor);
      await persist({ slots: slotsRef.current, visualAnchor: anchor, visualMotif });

      return true;
    } catch (err) {
      setError(errorMessage(err, 'Error generando los prompts del carrusel'));
      return false;
    } finally {
      setIsBuildingPrompts(false);
      setPromptingIndex(null);
    }
  }, [
    bankItem, activeBusinessId, branchId, background, imageType, visualMotif,
    visualAnchor, brandSlug, persist, applySlots,
  ]);

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
            /**
             * Same quality every other image flow uses (it is the function's
             * default; the carousel was the only caller asking for 'high').
             *
             * 'high' at 1024² did not come back inside the 110s the function
             * allows itself before the platform gateway kills the request, so
             * every slide failed with a timeout. A carousel is the flow that can
             * least afford it: five renders in a row means five chances to hit
             * the ceiling. Going back to 'high' needs the render to stop being a
             * synchronous request, not a longer timeout.
             */
            imageQuality: 'medium',
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
          // Links the catalogue entry the function just created to this mockup, so
          // deleting the slide also removes it from the asset library.
          imageLibraryId: data?.imageLibraryId ?? null,
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
    objective,
    // Flags
    isScripting,
    isBuildingPrompts,
    isBuildingAnchor,
    promptingIndex,
    renderingIndex,
    isBusy: isScripting || isBuildingPrompts || renderingIndex !== null,
    hasPrompts,
    doneCount,
    error,
    // Actions
    createScript,
    updateSlideCopy,
    updateSlideImageIntent,
    updateVisualMotif,
    saveSlideCopy,
    buildVisualAnchor,
    updateVisualAnchor,
    buildPrompts,
    updateSlotPrompt,
    generateSlot,
    generateAll,
    cancelQueue,
    reset,
  };
}
