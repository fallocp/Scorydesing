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
   * volver a llamar a la IA de imagen.
   */
  sceneBase64?: string;
  /**
   * URL pública de la ESCENA sin texto en Storage (subida o montada). A
   * diferencia de sceneBase64, SÍ se persiste: con ella se re-hornea el texto
   * tras recargar y se reutiliza la misma escena en otra edición sin regenerar.
   */
  sceneUrl?: string;
  /** URL pública de la pieza COMPUESTA (con texto) tras guardar en Storage. */
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

/** Bucket y carpeta donde se guardan las escenas reusables (imágenes sin texto). */
const NEWS_IMAGE_BUCKET = 'design-images';
const NEWS_SCENE_FOLDER = 'news-scenes';

/** Convierte un data URL o base64 crudo a base64 sin el prefijo `data:`. */
function toRawBase64(input: string): string {
  return input.includes(',') ? input.split(',')[1] ?? '' : input;
}

/** Descarga una imagen pública y la devuelve como base64 (sin prefijo). */
async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo leer la escena (${res.status})`);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(blob);
  });
  return toRawBase64(dataUrl);
}

/**
 * Fecha del día de publicación, formateada "3 SEPT 2026".
 *
 * Siempre es HOY, no la fecha parseada del contenido: el Morning Brief trae la
 * fecha de la jornada que reporta (a veces de días atrás), y el sello de la
 * pieza debe reflejar cuándo se publica, no la data de la nota.
 */
function formatEditionDate(): string {
  return new Date()
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
        dateLabel: formatEditionDate(),
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

  /**
   * Sube una ESCENA sin texto al bucket (carpeta news-scenes) y devuelve su URL
   * pública. Persiste la imagen provista para poder re-hornear el texto tras
   * recargar y reusar la misma escena en el próximo release sin regenerarla.
   */
  const uploadScene = useCallback(
    async (base64: string): Promise<string> => {
      if (!activeBusinessId) throw new Error('No hay negocio activo');
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });

      const path = `${activeBusinessId}/${NEWS_SCENE_FOLDER}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.png`;
      const { error: uploadError } = await supabase.storage
        .from(NEWS_IMAGE_BUCKET)
        .upload(path, blob, { contentType: 'image/png', upsert: false });
      if (uploadError) throw new Error(`No se pudo subir la escena: ${uploadError.message}`);

      const { data } = supabase.storage.from(NEWS_IMAGE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    },
    [activeBusinessId],
  );

  /**
   * Monta una imagen provista como ESCENA de un slide y hornea el texto encima,
   * sin llamar a la IA. Dos orígenes:
   *  - `dataUrl`: imagen recién subida por el usuario (se persiste en Storage).
   *  - `url`: una escena guardada que se reutiliza (ya vive en Storage).
   *
   * Es el flujo "cambiar la imagen y solo montar texto": ideal para releases
   * recurrentes (Fed/Banxico) donde el visual es fijo y solo cambian las cifras.
   * El slide debe existir (resolver dirección visual primero), porque el texto se
   * compone según su text_safe_area y arquetipo.
   */
  const mountSceneImage = useCallback(
    async (slideNumber: number, source: { dataUrl?: string; url?: string }): Promise<boolean> => {
      const slide = slidesRef.current.find((s) => s.slide_number === slideNumber);
      if (!slide) return false;

      patchSlide(slideNumber, { status: 'generating', error: undefined });
      try {
        let sceneBase64: string;
        let sceneUrl: string;
        if (source.dataUrl) {
          sceneBase64 = toRawBase64(source.dataUrl);
          if (!sceneBase64) throw new Error('Imagen inválida');
          sceneUrl = await uploadScene(sceneBase64);
        } else if (source.url) {
          sceneBase64 = await fetchImageAsBase64(source.url);
          sceneUrl = source.url; // ya está persistida
        } else {
          throw new Error('No se proporcionó imagen');
        }

        patchSlide(slideNumber, { sceneBase64, sceneUrl });
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
          error: err instanceof Error ? err.message : 'Error montando la imagen',
        });
        return false;
      }
    },
    [uploadScene, composeAndSave, patchSlide],
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

      patchSlide(slideNumber, { status: 'generating', error: undefined });
      try {
        // Escena en memoria (recién generada/montada) o, si no, la escena
        // persistida en Storage (tras recargar o al reusar una imagen). Solo si
        // no hay ninguna se pide regenerar.
        let sceneBase64 = slide.sceneBase64;
        if (!sceneBase64 && slide.sceneUrl) {
          sceneBase64 = await fetchImageAsBase64(slide.sceneUrl);
          patchSlide(slideNumber, { sceneBase64 });
        }
        if (!sceneBase64) {
          patchSlide(slideNumber, {
            status: 'error',
            error:
              'No hay escena disponible para re-hornear el texto. Regenera la imagen o monta una.',
          });
          return false;
        }

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
        sceneUrl: s.sceneUrl,
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
            sceneUrl: st?.sceneUrl,
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
    mountSceneImage,
    saveEdition,
    loadEdition,
    reset,
  };
}
