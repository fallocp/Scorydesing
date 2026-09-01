/**
 * useNewsEdition — dueño del ciclo de vida de una edición de Xending News.
 *
 * Orquesta los cables PROPIOS de News y reutiliza los genéricos:
 *
 *   1. `generatePlan`     raw input → slide_plan   (edge: generate-news-plan)
 *   2. `resolveVisuals`   slide_plan → prompts      (edge: generate-news-visuals)
 *   3. `generateSlide`    prompt → imagen           (edge: generate-design-image, mode generate)
 *      `generateAll`      corre el paso 3 slide por slide, en orden
 *
 * NO usa `useCarouselQueue` a propósito: esa cola importa scene-kits comerciales,
 * y News es 100% independiente. Aquí solo se reutiliza el cable genérico de
 * generación de imagen (mode generate consume el `promptFinal` verbatim) y el
 * guardado de mockups en Storage.
 *
 * Dos vías de imagen (decisión del usuario):
 *   - Vía A (default): genera la imagen dentro de la app.
 *   - Vía B: no genera; el prompt queda listo para pegarse en GPT-Image.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useSaveMockup } from './useDesignMockups';
import {
  useLoadNewsEdition,
  useSaveNewsEdition,
  type NewsEditionRow,
} from './useNewsEditions';
import { CAROUSEL_ASPECT_RATIO, CAROUSEL_DIMENSIONS } from '@/types/design-studio';
import { buildNewsSlideHtml } from '@/utils/design-studio/buildNewsSlideHtml';
import { renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer';
import type {
  GenerateNewsPlanResponse,
  GenerateNewsVisualsResponse,
  NewsEditionType,
  NewsInputFormat,
  NewsNormalizedEdition,
  NewsSlidePlan,
  NewsSlideVisual,
} from '../../supabase/functions/_shared/news/news-types';

/** Un slide con su prompt resuelto más el resultado de imagen (en memoria). */
export interface NewsSlideRuntime extends NewsSlideVisual {
  status: 'idle' | 'generating' | 'done' | 'error';
  /** base64 de la pieza COMPUESTA (con texto) en memoria hasta recargar. */
  imageBase64?: string;
  /**
   * base64 de la ESCENA sin texto, en memoria. Permite re-hornear el texto sin
   * volver a llamar a la IA de imagen. No se persiste (pesa); tras recargar,
   * editar texto exige regenerar la imagen.
   */
  sceneBase64?: string;
  /** URL pública tras guardar en Storage. */
  imageUrl?: string;
  mockupId?: string;
  error?: string;
}

/** Campos de texto editables por slide (viven en el slide plan). */
export type NewsSlideTextPatch = Partial<
  Pick<NewsSlidePlan, 'headline' | 'subcopy' | 'key_data' | 'data_label' | 'secondary_data' | 'source'>
>;

/**
 * Mismo lienzo y ratio que el carrusel (mirror). Se reusa la constante
 * compartida en vez de un literal, para que News siga cualquier cambio del
 * tamaño canónico y no vuelva a divergir (fue lo que rompió con 1080x1080).
 */
const NEWS_IMAGE_SIZE = `${CAROUSEL_DIMENSIONS.width}x${CAROUSEL_DIMENSIONS.height}`;
const NEWS_PLATFORM = 'instagram-post';

/** Fecha de la edición (o de hoy), formateada "22 AGO 2026". */
function formatEditionDate(raw?: string | null): string {
  const d = raw ? new Date(raw) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  return safe
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
}

export function useNewsEdition() {
  const { activeBusinessId } = useActiveBusiness();
  const saveMockup = useSaveMockup();
  const saveEditionMutation = useSaveNewsEdition();
  const loadEditionMutation = useLoadNewsEdition();

  const [editionId, setEditionId] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [editionType, setEditionType] = useState<NewsEditionType>('daily');
  const [targetSlides, setTargetSlides] = useState<number>(7);

  const [detectedFormat, setDetectedFormat] = useState<NewsInputFormat | null>(null);
  const [normalized, setNormalized] = useState<NewsNormalizedEdition | null>(null);
  const [slidePlan, setSlidePlan] = useState<NewsSlidePlan[]>([]);
  const [slides, setSlides] = useState<NewsSlideRuntime[]>([]);

  const [isPlanning, setIsPlanning] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Espejos sincrónicos: el estado de React no se aplica entre dos pasos de un
  // mismo callback (generateAll, recompose tras editar texto).
  const slidesRef = useRef<NewsSlideRuntime[]>([]);
  const applySlides = useCallback((next: NewsSlideRuntime[]) => {
    slidesRef.current = next;
    setSlides(next);
  }, []);

  const slidePlanRef = useRef<NewsSlidePlan[]>([]);
  const applySlidePlan = useCallback((next: NewsSlidePlan[]) => {
    slidePlanRef.current = next;
    setSlidePlan(next);
  }, []);

  const normalizedRef = useRef<NewsNormalizedEdition | null>(null);
  const applyNormalized = useCallback((next: NewsNormalizedEdition | null) => {
    normalizedRef.current = next;
    setNormalized(next);
  }, []);

  /** Aplica un parche a un slide runtime por su número. */
  const patchSlide = useCallback(
    (slideNumber: number, partial: Partial<NewsSlideRuntime>) => {
      applySlides(
        slidesRef.current.map((s) => (s.slide_number === slideNumber ? { ...s, ...partial } : s)),
      );
    },
    [applySlides],
  );

  /**
   * Hornea el texto (slide plan actual) sobre una escena dada y guarda el PNG
   * compuesto. Lee de los refs para ver siempre el texto más reciente, aunque
   * se acabe de editar. Devuelve lo necesario para actualizar el slide.
   */
  const composeAndSave = useCallback(
    async (slideNumber: number, sceneBase64: string) => {
      const slide = slidesRef.current.find((s) => s.slide_number === slideNumber);
      if (!slide) throw new Error('slide no encontrado');
      const plan = slidePlanRef.current.find((p) => p.slide_number === slideNumber);

      const html = buildNewsSlideHtml({
        imageUrl: `data:image/png;base64,${sceneBase64}`,
        width: CAROUSEL_DIMENSIONS.width,
        height: CAROUSEL_DIMENSIONS.height,
        eyebrow: (slide.domain ?? '').replace(/_/g, ' ').toUpperCase(),
        headline: plan?.headline ?? slide.visual_subject,
        subcopy: plan?.subcopy ?? '',
        keyData: plan?.key_data ?? '',
        dataLabel: plan?.data_label ?? '',
        delta: plan?.secondary_data ?? '',
        source: (plan?.source ?? []).join(' · '),
        dateLabel: formatEditionDate(normalizedRef.current?.date),
        slideNumber,
        totalSlides: slidesRef.current.length,
        textSafeArea: slide.text_safe_area,
        // El tratamiento Executive View (texto a la izquierda, L4) se dispara por
        // el ARQUETIPO resuelto, no solo por la bandera del plan: el resolver
        // puede marcar archetype 'executive_wrap' en el último slide aunque no
        // sea el comentario de cierre "Xending View". Sin esto, esa pieza queda
        // con el texto a la derecha sobre la foto.
        isExecutiveWrap: plan?.is_executive_wrap || slide.archetype === 'executive_wrap',
      });

      const composedDataUrl = await renderHtmlToPng(
        html,
        'xending-news',
        CAROUSEL_DIMENSIONS.width,
        CAROUSEL_DIMENSIONS.height,
      );
      const composedBase64 = composedDataUrl.split(',')[1] ?? sceneBase64;

      const saved = await saveMockup.mutateAsync({
        imageBase64: composedBase64,
        platform: NEWS_PLATFORM,
        promptUsed: slide.image_prompt,
      });

      return { composedBase64, imageUrl: saved.imageUrl, mockupId: saved.mockupId };
    },
    [saveMockup],
  );

  // --- Paso 1: plan -------------------------------------------------------
  const generatePlan = useCallback(async (): Promise<boolean> => {
    if (!activeBusinessId || !rawInput.trim()) return false;
    setIsPlanning(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-news-plan', {
        body: {
          business_id: activeBusinessId,
          raw_input: rawInput,
          target_slides: targetSlides,
          edition_type: editionType,
        },
      });
      const res = data as GenerateNewsPlanResponse | undefined;
      if (fnError || !res?.slide_plan?.length) {
        throw new Error((data as { message?: string })?.message ?? fnError?.message ?? 'No se generó el plan');
      }
      setDetectedFormat(res.detected_format);
      applyNormalized(res.normalized);
      applySlidePlan(res.slide_plan);
      // Un plan nuevo invalida los visuales previos.
      applySlides([]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error generando el plan de News');
      return false;
    } finally {
      setIsPlanning(false);
    }
  }, [activeBusinessId, rawInput, targetSlides, editionType, applySlides, applyNormalized, applySlidePlan]);

  // --- Paso 2: visuales ---------------------------------------------------
  const resolveVisuals = useCallback(async (): Promise<boolean> => {
    if (!activeBusinessId || slidePlan.length === 0) return false;
    setIsResolving(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-news-visuals', {
        body: {
          business_id: activeBusinessId,
          slide_plan: slidePlan,
          edition_type: editionType,
        },
      });
      const res = data as GenerateNewsVisualsResponse | undefined;
      if (fnError || !res?.slides?.length) {
        throw new Error((data as { message?: string })?.message ?? fnError?.message ?? 'No se resolvieron los visuales');
      }
      applySlides(res.slides.map((s) => ({ ...s, status: 'idle' as const })));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error resolviendo la dirección visual');
      return false;
    } finally {
      setIsResolving(false);
    }
  }, [activeBusinessId, slidePlan, editionType, applySlides]);

  // --- Paso 3: imagen por slide (Vía A) -----------------------------------
  // Genera la ESCENA (IA), la guarda en memoria, hornea el texto encima y guarda
  // el PNG compuesto. La escena queda disponible para re-hornear texto sin
  // volver a llamar a la IA (ver recomposeSlide).
  const generateSlide = useCallback(
    async (slideNumber: number): Promise<boolean> => {
      if (!activeBusinessId) return false;
      const slide = slidesRef.current.find((s) => s.slide_number === slideNumber);
      if (!slide) return false;

      patchSlide(slideNumber, { status: 'generating', error: undefined });

      try {
        // `generate-design-image` exige userRequest y brand al entrar, antes de
        // mirar el mode. En mode generate no se usan para construir la imagen
        // (esa sale del promptFinal verbatim), pero deben venir o responde 400.
        const planHeadline =
          slidePlanRef.current.find((p) => p.slide_number === slideNumber)?.headline ??
          slide.visual_subject ??
          'xending news';
        const { data, error: fnError } = await supabase.functions.invoke('generate-design-image', {
          body: {
            business_id: activeBusinessId,
            userRequest: planHeadline,
            brand: 'xending',
            mode: 'generate',
            // El prompt de News se pasa verbatim al modelo (mode generate no
            // inyecta estilo comercial).
            promptFinal: slide.image_prompt,
            imageType: 'fotografia',
            // Mismo ratio, tamaño y calidad que el carrusel: reusar sus
            // constantes evita que News vuelva a divergir. 'medium' porque
            // 'high' a 1024² no vuelve dentro del timeout del gateway.
            aspectRatio: CAROUSEL_ASPECT_RATIO,
            imageSize: NEWS_IMAGE_SIZE,
            imageQuality: 'medium',
          },
        });

        const sceneBase64: string | undefined = (data as { imageBase64?: string })?.imageBase64;
        if (fnError || !sceneBase64) {
          throw new Error((data as { message?: string })?.message ?? fnError?.message ?? 'No se generó la imagen');
        }

        // Guarda la escena en memoria (para re-hornear texto) y compone el texto.
        patchSlide(slideNumber, { sceneBase64 });
        const composed = await composeAndSave(slideNumber, sceneBase64);

        patchSlide(slideNumber, {
          status: 'done',
          imageBase64: composed.composedBase64,
          imageUrl: composed.imageUrl,
          mockupId: composed.mockupId,
          error: undefined,
        });
        return true;
      } catch (err) {
        patchSlide(slideNumber, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Error generando la imagen',
        });
        return false;
      }
    },
    [activeBusinessId, patchSlide, composeAndSave],
  );

  /** Edita el texto de un slide (headline/dato/subcopy/fuente) en el plan. */
  const updateSlideText = useCallback(
    (slideNumber: number, patch: NewsSlideTextPatch) => {
      applySlidePlan(
        slidePlanRef.current.map((p) =>
          p.slide_number === slideNumber ? { ...p, ...patch } : p,
        ),
      );
    },
    [applySlidePlan],
  );

  /**
   * Edita el prompt de imagen de un slide. La siguiente "Regenerar" lo usa
   * verbatim (generateSlide lee slide.image_prompt), así el usuario puede
   * cambiar el sujeto a mano —p. ej. pedir el edificio de la institución en vez
   * de una persona— sin volver a correr el resolver.
   */
  const updateSlidePrompt = useCallback(
    (slideNumber: number, imagePrompt: string) => {
      patchSlide(slideNumber, { image_prompt: imagePrompt });
    },
    [patchSlide],
  );

  /**
   * Re-hornea SOLO el texto sobre la escena ya generada (sin re-llamar a la IA
   * de imagen). Barato: para corregir una cifra o una palabra. Si la escena no
   * está en memoria (tras recargar), pide regenerar la imagen.
   */
  const recomposeSlide = useCallback(
    async (slideNumber: number): Promise<boolean> => {
      const slide = slidesRef.current.find((s) => s.slide_number === slideNumber);
      if (!slide) return false;
      if (!slide.sceneBase64) {
        patchSlide(slideNumber, {
          error: 'Para aplicar el texto sin regenerar, la escena debe estar en memoria. Regenera la imagen.',
        });
        return false;
      }

      patchSlide(slideNumber, { status: 'generating', error: undefined });
      try {
        const composed = await composeAndSave(slideNumber, slide.sceneBase64);
        patchSlide(slideNumber, {
          status: 'done',
          imageBase64: composed.composedBase64,
          imageUrl: composed.imageUrl,
          mockupId: composed.mockupId,
          error: undefined,
        });
        return true;
      } catch (err) {
        patchSlide(slideNumber, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Error actualizando el texto',
        });
        return false;
      }
    },
    [patchSlide, composeAndSave],
  );

  const generateAll = useCallback(async (): Promise<void> => {
    if (slidesRef.current.length === 0) return;
    setIsGeneratingAll(true);
    setError(null);
    try {
      for (const slide of slidesRef.current) {
        // Un slide ya generado no se regenera en el "generar todo".
        if (slide.status === 'done') continue;
        await generateSlide(slide.slide_number);
      }
    } finally {
      setIsGeneratingAll(false);
    }
  }, [generateSlide]);

  // --- Persistencia -------------------------------------------------------

  /**
   * Guarda (o actualiza) la edición en `news_editions`. No persiste el base64
   * de las imágenes, solo su URL de Storage; el resto (input, plan, visuales) sí,
   * que es lo que permite reabrirla.
   */
  const saveEdition = useCallback(async (): Promise<boolean> => {
    if (!rawInput.trim()) return false;
    try {
      // visual_plan: los NewsSlideVisual sin los campos de runtime.
      const visualPlan: NewsSlideVisual[] = slidesRef.current.map(
        ({ status: _s, imageBase64: _b, imageUrl: _u, mockupId: _m, error: _e, ...visual }) => visual,
      );
      const slidesState = slidesRef.current.map((s) => ({
        slide_number: s.slide_number,
        status: s.status,
        imageUrl: s.imageUrl,
        mockupId: s.mockupId,
      }));

      const title = `Xending News · ${new Date().toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`;

      const anyDone = slidesState.some((s) => s.status === 'done');
      const { id } = await saveEditionMutation.mutateAsync({
        id: editionId ?? undefined,
        title,
        editionType,
        rawInput,
        inputFormat: detectedFormat,
        normalized,
        slidePlan,
        visualPlan,
        slides: slidesState,
        status: anyDone && slidesState.every((s) => s.status === 'done') ? 'completed' : 'draft',
      });
      setEditionId(id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando la edición');
      return false;
    }
  }, [rawInput, editionType, detectedFormat, normalized, slidePlan, editionId, saveEditionMutation]);

  /** Reabre una edición guardada: repuebla el estado desde su fila. */
  const loadEdition = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const row: NewsEditionRow = await loadEditionMutation.mutateAsync(id);
        setEditionId(row.id);
        setRawInput(row.raw_input ?? '');
        setEditionType(row.edition_type);
        setDetectedFormat(row.input_format);
        applyNormalized(row.normalized);
        applySlidePlan(row.slide_plan ?? []);

        // Reconstruye el runtime: visual_plan + el estado (URL) por slide.
        const stateByNumber = new Map((row.slides ?? []).map((s) => [s.slide_number, s]));
        const runtime: NewsSlideRuntime[] = (row.visual_plan ?? []).map((v) => {
          const st = stateByNumber.get(v.slide_number);
          return {
            ...v,
            status: (st?.status as NewsSlideRuntime['status']) ?? (st?.imageUrl ? 'done' : 'idle'),
            imageUrl: st?.imageUrl,
            mockupId: st?.mockupId,
          };
        });
        applySlides(runtime);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error cargando la edición');
        return false;
      }
    },
    [loadEditionMutation, applySlides, applyNormalized, applySlidePlan],
  );

  const reset = useCallback(() => {
    setEditionId(null);
    setRawInput('');
    applySlidePlan([]);
    applySlides([]);
    applyNormalized(null);
    setDetectedFormat(null);
    setError(null);
  }, [applySlides, applySlidePlan, applyNormalized]);

  return {
    // input
    editionId,
    rawInput,
    setRawInput,
    editionType,
    setEditionType,
    targetSlides,
    setTargetSlides,
    // state
    detectedFormat,
    normalized,
    slidePlan,
    slides,
    isPlanning,
    isResolving,
    isGeneratingAll,
    isSaving: saveEditionMutation.isPending,
    isLoadingEdition: loadEditionMutation.isPending,
    error,
    // actions
    generatePlan,
    resolveVisuals,
    generateSlide,
    generateAll,
    updateSlideText,
    updateSlidePrompt,
    recomposeSlide,
    saveEdition,
    loadEdition,
    reset,
  };
}
