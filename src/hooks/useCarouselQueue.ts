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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
/**
 * El registro de repertorios visuales, compartido con las edge functions.
 *
 * Se importa desde `_shared` a propósito, igual que `brand-onboarding-types`: la
 * mecánica de cifras la deciden el frontend (que arma los documentos, porque la
 * aritmética va en código) y el escritor de escena (que arma la utilería), y las dos
 * tienen que estar de acuerdo. Dos tablas separadas divergen.
 *
 * `sceneKitRegistry` no importa nada por URL, que es lo que impide importar
 * `copyKitRegistry` desde aquí.
 */
import {
  branchUsesFigures,
  getSceneKit,
} from '../../supabase/functions/_shared/sceneKitRegistry';
/**
 * La misma regla de "el plan cubre este set" que usa la edge function.
 *
 * Compartida y no reimplementada: si el frontend y el guion discrepan sobre cuándo el
 * plan aplica, el set se escribe con una de las dos respuestas y la UI reporta la otra.
 */
import { planCoversRoles } from '../../supabase/functions/_shared/buildCarouselScriptBeats';
import { useActiveBusiness } from './useActiveBusiness';
import { useSaveMockup } from './useDesignMockups';
import { useUpdateBankMeta, type CopyBankItem } from './useDesignCopyBank';
import {
  brandElementsForSlide,
  buildCarouselEconomicScenario,
  buildPlanFigureDocuments,
  projectCarouselEconomicFacts,
  DEFAULT_CAROUSEL_FX,
  DEFAULT_CAROUSEL_OBJECTIVE,
  CAROUSEL_ASPECT_RATIO,
  CAROUSEL_DIMENSIONS,
  getCarouselPreset,
  type CarouselCreativePlan,
  type CarouselCommercialIntent,
  type CarouselEconomicScenario,
  type CarouselObjective,
  type CarouselPlanDigest,
  type CarouselFxAssumptions,
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
  /**
   * Slug o nombre de la rama, para resolver su scene kit.
   *
   * Separado de `branchId` porque el kit se indexa por slug y el `row` del bankItem
   * viene de `generated_ideas`, que no tiene esa columna. El resolutor acepta slug
   * o nombre, y los slugs anteriores a la migración 20260816 siguen mapeando.
   */
  branchSlug: string | null;
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

/*
 * Aquí vivía `figureScenarioFor`, que resolvía el escenario numérico de un slide contra
 * una tabla del scene kit indexada por ROL. Murió con el camino sin plan.
 *
 * La razón por la que tenía que morir: la tabla le ponía documentos a `shift` y a `risk`
 * pase lo que pase, así que en una ruta de margen —que prohíbe apilar documentos— el
 * rol `risk` recibía tres compras sucesivas, la evidencia de otra ruta. El slide salía
 * impecable contando una historia que nadie decidió.
 *
 * Ahora el escenario lo declara el beat en `figureRequirement.scenarioId`, y lo traduce
 * a documentos `buildPlanFigureDocuments`.
 */

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
  branchSlug,
  background,
  imageType,
  brandSlug,
  persistMeta,
}: UseCarouselQueueParams) {
  const { activeBusinessId } = useActiveBusiness();
  const saveMockup = useSaveMockup();
  const updateBankMeta = useUpdateBankMeta();

  /**
   * Repertorio visual de la rama. `null` en las tres ramas draft, que no tienen.
   *
   * De aquí sale la mecánica de cifras del set. La versión anterior la decidía una
   * tabla global por rol, así que un set de velocidad recibía documentos de
   * cotización con USD 10,000 a 18.20 en una pieza sobre una hora de corte.
   */
  const sceneKit = useMemo(() => getSceneKit(branchSlug), [branchSlug]);

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
  /**
   * La historia con la que se escribió este set, cuando el usuario eligió una.
   *
   * Vive en el hook y no solo en el panel porque `persist` reconstruye el meta completo
   * en cada escritura —después de editar copy, después de cada render—, y un campo que
   * solo existe en el panel se perdería en la primera de esas escrituras.
   */
  const [plan, setPlan] = useState<CarouselCreativePlan | null>(null);
  const [planDigest, setPlanDigest] = useState<CarouselPlanDigest | null>(null);
  const [economicScenario, setEconomicScenario] = useState<CarouselEconomicScenario | null>(null);
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
      setPlan(null);
      setPlanDigest(null);
      setEconomicScenario(null);
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
    setPlan(carousel.plan ?? null);
    setPlanDigest(carousel.planDigest ?? null);
    setEconomicScenario(carousel.economicScenario ?? null);
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
      /**
       * `null` borra el plan; `undefined` conserva el que ya está en el estado.
       *
       * La distinción existe porque `persist` corre después de cada render y de cada
       * edición de copy, y esas llamadas no saben nada del plan: si no pasar nada
       * significara "sin plan", la primera de ellas lo borraría.
       */
      plan?: CarouselCreativePlan | null;
      planDigest?: CarouselPlanDigest | null;
      economicScenario?: CarouselEconomicScenario | null;
    }) => {
      if (!bankItem) return;

      const nextPlan = next.plan === undefined ? plan : next.plan;
      const nextDigest = next.planDigest === undefined ? planDigest : next.planDigest;
      const nextEconomicScenario =
        next.economicScenario === undefined ? economicScenario : next.economicScenario;

      const meta: CarouselMeta = {
        presetSlug: next.presetSlug ?? presetSlug ?? '',
        objective: next.objective ?? objective,
        commercialIntent:
          nextPlan?.commercialIntent ?? bankItem.meta.carousel?.commercialIntent,
        visualAnchor: next.visualAnchor ?? visualAnchor,
        visualMotif: next.visualMotif ?? visualMotif,
        visualMode: getCarouselPreset(next.presetSlug ?? presetSlug ?? '').visualMode,
        groupId: next.groupId ?? groupId ?? crypto.randomUUID(),
        imageType: next.imageType ?? imageType,
        slots: toPersisted(next.slots),
        plan: nextPlan ?? undefined,
        economicScenario: nextEconomicScenario ?? undefined,
        planDigest: nextDigest ?? undefined,
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
    [
      bankItem, presetSlug, objective, visualAnchor, visualMotif, groupId, imageType,
      plan, planDigest, economicScenario, updateBankMeta, persistMeta,
    ],
  );

  // -------------------------------------------------------------------------
  // 1. Script: seed copy → slide copies + visual motif
  // -------------------------------------------------------------------------

  const createScript = useCallback(
    async (params: {
      presetSlug: string;
      objective?: CarouselObjective;
      commercialIntent: CarouselCommercialIntent;
      guidance?: string;
      fx?: CarouselFxAssumptions;
      /**
       * La historia elegida por el usuario. OBLIGATORIA.
       *
       * No es opcional desde que se eliminó el camino sin plan. Mientras conviviera con
       * el sistema por rol, el viejo ganaba por concreción: un brief que nombra un objeto
       * le gana a una ruta que describe una idea, así que tres historias distintas
       * devolvían los mismos beats 3, 4 y 5. Y cada arreglo había que hacerlo dos veces.
       */
      plan: CarouselCreativePlan;
      planDigest?: CarouselPlanDigest | null;
    }) => {
      if (!bankItem || !activeBusinessId) return false;

      const preset = getCarouselPreset(params.presetSlug);
      /**
       * El plan tiene que ser del mismo preset y cubrir los mismos roles.
       *
       * El usuario puede generar un plan con un preset y luego cambiar el selector antes
       * de picar "Generar guion". La función de guion también lo verifica —tiene que
       * hacerlo, es su contrato, y ahí es un 400— pero rechazarlo aquí es lo que permite
       * decirlo en la UI con el motivo a la vista.
       */
      const plan =
        params.plan.presetSlug === params.presetSlug &&
        planCoversRoles(params.plan, preset.roles)
          ? params.plan
          : null;

      if (!plan) {
        setError(
          'La historia elegida es de otra estructura. Cambia el preset al que usaste para el plan, o genera un plan nuevo.',
        );
        return false;
      }

      const resolvedBranchSlug = sceneKit?.branchSlug ?? branchSlug?.trim().toLowerCase();
      if (!resolvedBranchSlug || plan.branchSlug !== resolvedBranchSlug) {
        setError(
          'La historia elegida pertenece a otra rama. Genera y selecciona un plan nuevo para este copy.',
        );
        return false;
      }

      if (plan.commercialIntent !== params.commercialIntent) {
        setError(
          'La historia elegida usa otro mecanismo comercial. Genera un plan nuevo con el mecanismo seleccionado.',
        );
        return false;
      }
      /**
       * Read from the params, not from state.
       *
       * The panel owns the chips and calls this in the same tick it would have set
       * the hook's state, so reading state here would send the previous objective on
       * the very first script — the one case where getting it wrong is most visible.
       */
      const nextObjective = params.objective ?? objective;
      /**
       * Las cifras solo existen si la rama las usa.
       *
       * Antes se calculaban y se enviaban siempre, así que el agente de guion recibía
       * una mecánica de tipo de cambio —18.20 → 18.56 sobre USD 10,000— con la
       * instrucción de escribir un texto compatible con ella, incluso en un set de
       * velocidad cuya historia es una hora de corte. El prompt ya tiene su rama
       * alternativa ("CIFRAS: no uses ninguna"); nunca se activaba porque el arreglo
       * siempre llegaba lleno.
       */
      const usesFigures = branchUsesFigures(sceneKit);
      /**
       * Las asunciones completas, no solo los momentos ya calculados.
       *
       * El motor del plan las necesita enteras: una historia de margen deriva el precio de
       * venta del margen objetivo, y eso no está en la lista de momentos del tipo de
       * cambio. Los momentos se siguen calculando porque el prompt del guion los lleva
       * como tabla de contexto: son la mecánica con la que el texto tiene que cuadrar.
       */
      const fxAssumptions = params.fx ?? DEFAULT_CAROUSEL_FX;
      const nextEconomicScenario =
        usesFigures && plan.figureScenarioId !== 'none'
          ? buildCarouselEconomicScenario(plan.figureScenarioId, fxAssumptions)
          : null;
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
              /**
               * Solo el rol y los elementos de marca. Nada de contenido ni de layout.
               *
               * El contenido lo declara el beat y la composición viaja en
               * `beat.compositionFamily`. Mandar además un brief o un layoutHint le daría
               * al guionista dos fuentes que se contradicen, y la que gana es la más
               * concreta, que es la equivocada.
               */
              slides: preset.roles.map((role, i) => ({
                role,
                brandElements: brandElementsForSlide(preset, i),
              })),
              /**
               * La historia ya decidida. Con esto el guion solo elige las palabras.
               *
               * Va el plan completo y no un extracto: `normalizeBrief` del otro lado usa
               * `compositionFamily` y `primaryObjects` de cada beat como autoridad, no
               * como sugerencia, y un extracto obligaría a mantener dos formas del mismo
               * contrato.
               */
              plan,
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
               * Una sola fuente financiera para todo el set. El guionista puede leer la
               * mecánica, pero no copiar valores; cada beat recibe su proyección después.
               */
              economicScenario: nextEconomicScenario ?? undefined,
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
         * Los documentos con cifras se arman en código. Nunca los escribe un modelo.
         *
         * Eso no cambió: el agente decide la narrativa y la composición, jamás un número
         * ni a qué documento pertenece. Es lo que produjo tres tarjetas con el mismo 18.93
         * y un "+4.0%" suelto — una lista plana de etiquetas no puede decir qué valor va
         * dónde.
         *
         * Lo que sí cambió es QUIÉN elige el escenario: lo elige el BEAT.
         *
         * Antes lo elegía el ROL, contra una tabla de la rama, y por eso el render
         * contradecía la historia: en una ruta de margen —que prohíbe explícitamente
         * apilar documentos— el rol `risk` recibía tres compras sucesivas, que son la
         * evidencia de la ruta de acumulación. El slide salía impecable contando otra
         * historia. Y los dos vocabularios ni se cruzaban: el plan pedía
         * `margin_sensitivity` y el scene kit solo sabía de `two_moment` y
         * `repeated_purchases`.
         */
        const withFigures = nextSlots.map((slot, i) => {
          if (!slot.brief || !nextEconomicScenario) return slot;

          const beat = plan.storyboard[i];
          if (!beat || beat.figureRequirement.mode !== 'illustrative') return slot;

          const requirement = beat.figureRequirement;

          // Plan anterior al contrato de hechos: conserva exactamente su adaptador
          // documental en vez de reinterpretarlo con una superficie nueva.
          if (requirement.factKeys === undefined) {
            const { documents, accumulatedLabel } = buildPlanFigureDocuments(
              requirement.scenarioId,
              fxAssumptions,
            );
            return documents.length > 0
              ? { ...slot, brief: { ...slot.brief, documents, accumulatedLabel } }
              : slot;
          }

          const economicFacts = projectCarouselEconomicFacts(
            nextEconomicScenario,
            requirement.factKeys ?? [],
          );
          if (economicFacts.length === 0) return slot;

          const figurePresentation = {
            scenarioId: requirement.scenarioId,
            qualifier: nextEconomicScenario.qualifier,
            narrativePurpose: requirement.narrativePurpose ?? beat.visualEvidence,
            weight: requirement.weight ?? 'inline',
            suggestedSurface: requirement.suggestedSurface ?? 'freeform',
          } as const;

          /*
           * El documento es un adaptador explícito, no el formato universal de una cifra.
           * Carruseles antiguos conservan sus `brief.documents`; los nuevos solo los
           * construyen cuando la superficie elegida es realmente document.
           */
          if (figurePresentation.suggestedSurface === 'document') {
            const { documents, accumulatedLabel } = buildPlanFigureDocuments(
              requirement.scenarioId,
              fxAssumptions,
            );
            return {
              ...slot,
              brief: {
                ...slot.brief,
                economicFacts,
                figurePresentation,
                documents: documents.length > 0 ? documents : undefined,
                accumulatedLabel,
              },
            };
          }

          return {
            ...slot,
            brief: {
              ...slot.brief,
              economicFacts,
              figurePresentation,
              documents: undefined,
              accumulatedLabel: undefined,
            },
          };
        });

        applySlots(withFigures);
        setVisualMotif(scriptedMotif);
        setGroupId(newGroupId);
        setPresetSlug(params.presetSlug);
        setObjective(nextObjective);
        setPlan(plan);
        setPlanDigest(params.planDigest ?? null);
        setEconomicScenario(nextEconomicScenario);
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
          /**
           * Explícito: el plan con el que se escribió ESTE set.
           *
           * Se pasa aunque ya esté en el state porque el setter de arriba todavía no
           * aterrizó, así que el valor en el closure de `persist` sigue siendo el
           * anterior — y el storyboard del panel describiría unos slides que ya no
           * existen.
           */
          plan,
          planDigest: params.planDigest ?? null,
          economicScenario: nextEconomicScenario,
        });

        return true;
      } catch (err) {
        setError(errorMessage(err, 'Error generando el guion del carrusel'));
        return false;
      } finally {
        setIsScripting(false);
      }
    },
    [bankItem, activeBusinessId, branchId, branchSlug, sceneKit, imageType, objective, persist, applySlots],
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
    setPlan(null);
    setPlanDigest(null);
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
    /**
     * La historia con la que se escribió el set, o `null`.
     *
     * El panel la lee para mostrar el storyboard del set ya generado, que es otra cosa
     * que las historias candidatas del planificador: estas se comparan, esta ya se usó.
     */
    plan,
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
