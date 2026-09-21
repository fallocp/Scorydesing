/**
 * useNewsEdition — dueño del ciclo de vida de una edición de Xending News.
 *
 * Orquesta los cables PROPIOS de News y reutiliza los genéricos:
 *
 *   1. `generatePlan`     raw input → slide_plan   (edge: generate-news-plan)
 *   2. `resolveVisuals`   slide_plan → prompts      (edge: generate-news-visuals)
 *   3. `generateSlide`    prompt → imagen           (motor compartido DesAIng)
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

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useAuth } from './useAuth';
import { useImageGenerationSettings } from './useImageGenerationSettings';
import { imageGenerationRequestFields } from '@/lib/imageGenerationSettings';
import { acknowledgeSharedDesignImage, generateSharedDesignImage, recoverSharedDesignImage, type SharedDesignImageResult } from '@/lib/desaing/sharedImageGeneration';
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
  /** Stable through prompt edits and slide reordering; persisted with the visual. */
  generationSlotId?: string;
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
  const { user } = useAuth();
  const actorId = user?.id;
  const scopeKey = JSON.stringify([activeBusinessId, actorId]);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
  const [stateScope, setStateScope] = useState(scopeKey);
  const assertScope = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (!actorId || error || data.session?.user.id !== actorId || currentScope.current !== scopeKey) {
      throw new Error('La sesión o el negocio cambiaron. Abre la edición desde su contexto original.');
    }
  }, [actorId, scopeKey]);
  const { settings: imageSettings, setSettings: setImageSettings } = useImageGenerationSettings(activeBusinessId, 'news');
  const saveMockup = useSaveMockup();
  const saveEditionMutation = useSaveNewsEdition();
  const loadEditionMutation = useLoadNewsEdition();

  const [editionId, setEditionId] = useState<string | null>(null);
  const editionIdentity = useRef<{ id: string; isNew: boolean; businessId: string } | null>(null);
  const persistEdition = useRef<() => Promise<boolean>>(async () => false);
  const saving = useRef<Promise<boolean> | null>(null);
  const currentBusiness = useRef(activeBusinessId);
  currentBusiness.current = activeBusinessId;
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
    async (slideNumber: number, sceneBase64: string, generation?: SharedDesignImageResult) => {
      await assertScope();
      const currentSlide = slidesRef.current.find((s) => s.slide_number === slideNumber);
      if (!currentSlide) throw new Error('slide no encontrado');
      const frozen = generation?.scope.consumerContext;
      const slide = (frozen?.newsVisual as NewsSlideVisual | undefined) ?? currentSlide;
      const plan = (frozen?.newsPlan as NewsSlidePlan | undefined) ?? slidePlanRef.current.find((p) => p.slide_number === slideNumber);

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
        dateLabel: typeof frozen?.dateLabel === 'string' ? frozen.dateLabel : formatEditionDate(),
        slideNumber: typeof frozen?.slideNumber === 'number' ? frozen.slideNumber : slideNumber,
        totalSlides: typeof frozen?.totalSlides === 'number' ? frozen.totalSlides : slidesRef.current.length,
        textSafeArea: slide.text_safe_area,
        // El tratamiento Executive View (texto a la izquierda, L4) se dispara por
        // el ARQUETIPO resuelto, no solo por la bandera del plan: el resolver
        // puede marcar archetype 'executive_wrap' en el último slide aunque no
        // sea el comentario de cierre "Xending View". Sin esto, esa pieza queda
        // con el texto a la derecha sobre la foto.
        isExecutiveWrap: plan?.is_executive_wrap || slide.archetype === 'executive_wrap',
      });

      // If saving lost its acknowledgement, reuse the already composed bytes.
      // Rebuilding with an edited headline/date would conflict with this job's immutable file.
      const previous = generation ? await supabase.storage.from(NEWS_IMAGE_BUCKET)
        .download(`${generation.business_id}/mockups/${generation.operation_key}.png`) : null;
      let composedBase64: string;
      if (previous?.data) {
        const bytes = new Uint8Array(await previous.data.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        composedBase64 = btoa(binary);
      } else {
        if (previous?.error) {
          const status = String((previous.error as { statusCode?: string | number }).statusCode ?? '');
          if (!['400', '404'].includes(status) && !/not found|does not exist/i.test(previous.error.message)) throw new Error('No se pudo comprobar si la pieza ya estaba guardada. Recupera el resultado para continuar.');
        }
        const composedDataUrl = await renderHtmlToPng(
        html,
        'xending-news',
        CAROUSEL_DIMENSIONS.width,
        CAROUSEL_DIMENSIONS.height,
      );
        composedBase64 = composedDataUrl.split(',')[1] ?? sceneBase64;
      }

      await assertScope();
      const saved = await saveMockup.mutateAsync({
        businessId: activeBusinessId!, actorId,
        imageBase64: composedBase64,
        platform: NEWS_PLATFORM,
        promptUsed: slide.image_prompt,
        ...(generation ? {
          mockupId: generation.operation_key, businessId: generation.business_id, actorId: generation.actor_id,
          promptUsed: generation.promptUsed.promptFinal,
          selections: { image_generation: { model: generation.image_model, quality: generation.image_quality,
            operation_key: generation.operation_key, asset_identity: generation.asset_identity }, scene_url: currentSlide.sceneUrl },
        } : {}),
      });

      return { composedBase64, imageUrl: saved.imageUrl, mockupId: saved.mockupId };
    },
    [saveMockup, assertScope, activeBusinessId, actorId],
  );

  /**
   * Sube una ESCENA sin texto al bucket (carpeta news-scenes) y devuelve su URL
   * pública. Persiste la imagen provista para poder re-hornear el texto tras
   * recargar y reusar la misma escena en el próximo release sin regenerarla.
   */
  const uploadScene = useCallback(
    async (base64: string, generation?: SharedDesignImageResult): Promise<string> => {
      await assertScope();
      const businessId = generation?.business_id ?? activeBusinessId;
      if (!businessId) throw new Error('No hay negocio activo');
      const byteChars = atob(base64);
      const bytes = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });

      const path = generation ? `${businessId}/${NEWS_SCENE_FOLDER}/${generation.operation_key}.png` : `${businessId}/${NEWS_SCENE_FOLDER}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.png`;
      const { error: uploadError } = await supabase.storage
        .from(NEWS_IMAGE_BUCKET)
        .upload(path, blob, { contentType: 'image/png', upsert: false });
      if (uploadError) {
        const duplicate = String((uploadError as { statusCode?: string | number }).statusCode) === '409' || /already exists|duplicate/i.test(uploadError.message);
        if (!generation || !duplicate) throw new Error(`No se pudo subir la escena: ${uploadError.message}`);
        const { data: existing, error } = await supabase.storage.from(NEWS_IMAGE_BUCKET).download(path);
        const stored = existing && new Uint8Array(await existing.arrayBuffer());
        if (error || !stored || stored.length !== bytes.length || stored.some((byte, i) => byte !== bytes[i])) throw new Error('La escena guardada no coincide con esta generación.');
      }

      const { data } = supabase.storage.from(NEWS_IMAGE_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    },
    [activeBusinessId, assertScope],
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
      const identity = editionIdentity.current;

      patchSlide(slideNumber, { status: 'generating', error: undefined });
      try {
        await assertScope();
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

        await assertScope();
        if (editionIdentity.current !== identity) return false;
        patchSlide(slideNumber, { sceneBase64, sceneUrl });
        const composed = await composeAndSave(slideNumber, sceneBase64);
        await assertScope();
        if (editionIdentity.current !== identity) return false;
        patchSlide(slideNumber, {
          status: 'done',
          imageBase64: composed.composedBase64,
          imageUrl: composed.imageUrl,
          mockupId: composed.mockupId,
          error: undefined,
        });
        return true;
      } catch (err) {
        if (currentScope.current === scopeKey && editionIdentity.current === identity) patchSlide(slideNumber, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Error montando la imagen',
        });
        return false;
      }
    },
    [uploadScene, composeAndSave, patchSlide, assertScope, scopeKey],
  );

  // --- Paso 1: plan -------------------------------------------------------
  const generatePlan = useCallback(async (): Promise<boolean> => {
    if (!activeBusinessId || !rawInput.trim() || slidesRef.current.some(s => s.status === 'generating')) return false;
    setIsPlanning(true);
    setError(null);
    const identity = editionIdentity.current;
    try {
      await assertScope();
      const { data, error: fnError } = await supabase.functions.invoke('generate-news-plan', {
        body: {
          business_id: activeBusinessId,
          raw_input: rawInput,
          target_slides: targetSlides,
          edition_type: editionType,
        },
      });
      const res = data as GenerateNewsPlanResponse | undefined;
      await assertScope();
      if (editionIdentity.current !== identity) return false;
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
      if (currentScope.current === scopeKey && editionIdentity.current === identity) setError(err instanceof Error ? err.message : 'Error generando el plan de News');
      return false;
    } finally {
      if (currentScope.current === scopeKey) setIsPlanning(false);
    }
  }, [activeBusinessId, rawInput, targetSlides, editionType, applySlides, applyNormalized, applySlidePlan, assertScope, scopeKey]);

  // --- Paso 2: visuales ---------------------------------------------------
  const resolveVisuals = useCallback(async (): Promise<boolean> => {
    if (!activeBusinessId || slidePlan.length === 0 || slidesRef.current.some(s => s.status === 'generating')) return false;
    setIsResolving(true);
    setError(null);
    const identity = editionIdentity.current;
    try {
      await assertScope();
      const { data, error: fnError } = await supabase.functions.invoke('generate-news-visuals', {
        body: {
          business_id: activeBusinessId,
          slide_plan: slidePlan,
          edition_type: editionType,
        },
      });
      const res = data as GenerateNewsVisualsResponse | undefined;
      await assertScope();
      if (editionIdentity.current !== identity) return false;
      if (fnError || !res?.slides?.length) {
        throw new Error((data as { message?: string })?.message ?? fnError?.message ?? 'No se resolvieron los visuales');
      }
      applySlides(res.slides.map((s) => ({ ...s, generationSlotId: crypto.randomUUID(), status: 'idle' as const })));
      return true;
    } catch (err) {
      if (currentScope.current === scopeKey && editionIdentity.current === identity) setError(err instanceof Error ? err.message : 'Error resolviendo la dirección visual');
      return false;
    } finally {
      if (currentScope.current === scopeKey) setIsResolving(false);
    }
  }, [activeBusinessId, slidePlan, editionType, applySlides, assertScope, scopeKey]);

  // --- Paso 3: imagen por slide (Vía A) -----------------------------------
  // Genera la ESCENA (IA), la guarda en memoria, hornea el texto encima y guarda
  // el PNG compuesto. La escena queda disponible para re-hornear texto sin
  // volver a llamar a la IA (ver recomposeSlide).
  const generateSlide = useCallback(
    async (slideNumber: number): Promise<boolean> => {
      if (!activeBusinessId || !actorId || currentScope.current !== scopeKey) return false;
      const slide = slidesRef.current.find((s) => s.slide_number === slideNumber);
      if (!slide || slide.status === 'generating') return false;
      const businessId = activeBusinessId;
      if (editionIdentity.current && editionIdentity.current.businessId !== businessId) return false;
      const generationSlotId = slide.generationSlotId ?? crypto.randomUUID();
      let identity = editionIdentity.current;

      patchSlide(slideNumber, { status: 'generating', generationSlotId, error: undefined });

      try {
        await assertScope();
        // Save the draft and stable article id BEFORE starting a paid job, so a
        // browser restart can reopen this exact destination and recover it.
        const persisted = await persistEdition.current();
        identity = editionIdentity.current;
        if (!persisted) throw new Error('Guarda la edición antes de generar para poder recuperar el resultado.');
        await assertScope();
        if (!identity || !slidesRef.current.some(s => s.generationSlotId === generationSlotId)) throw new Error('Cambió la edición. Vuelve a la original para continuar.');
        const planHeadline =
          slidePlanRef.current.find((p) => p.slide_number === slideNumber)?.headline ??
          slide.visual_subject ??
          'xending news';
        const scope = { businessId, actorId, process: 'news' as const, slotKey: `${identity.id}:${generationSlotId}`,
          consumerContext: {
            newsPlan: slidePlanRef.current.find(p => p.slide_number === slideNumber) ?? null,
            newsVisual: { domain: slide.domain, visual_subject: slide.visual_subject, text_safe_area: slide.text_safe_area,
              archetype: slide.archetype, image_prompt: slide.image_prompt },
            dateLabel: formatEditionDate(), slideNumber, totalSlides: slidesRef.current.length,
          },
        };
        const recovered = await recoverSharedDesignImage(scope);
        await assertScope();
        const generation = recovered ?? await generateSharedDesignImage({
            business_id: activeBusinessId,
            userRequest: planHeadline,
            brand: 'xending',
            mode: 'generate',
            // El prompt de News se pasa verbatim al modelo (mode generate no
            // inyecta estilo comercial).
            promptFinal: slide.image_prompt,
            imageType: 'fotografia',
            // Preserve this request's explicit model and quality for the whole render.
            aspectRatio: CAROUSEL_ASPECT_RATIO,
            imageSize: NEWS_IMAGE_SIZE,
            ...imageGenerationRequestFields(imageSettings),
        }, scope);
        await assertScope();
        if (generation.actor_id !== actorId || generation.business_id !== businessId) throw new Error('La imagen pertenece a otra sesión.');
        if (editionIdentity.current !== identity) throw new Error('Cambió la edición. Abre la edición original para recuperar el resultado.');
        const sceneBase64 = generation.imageBase64;
        const sceneUrl = await uploadScene(sceneBase64, generation);
        await assertScope();
        if (editionIdentity.current !== identity) throw new Error('Abre la edición original para recuperar el resultado.');

        // Guarda la escena en memoria (para re-hornear texto) y compone el texto.
        patchSlide(slideNumber, { sceneBase64, sceneUrl });
        const composed = await composeAndSave(slideNumber, sceneBase64, generation);
        await assertScope();
        if (editionIdentity.current !== identity) throw new Error('Abre la edición original para recuperar el resultado.');

        patchSlide(slideNumber, {
          status: 'done',
          imageBase64: composed.composedBase64,
          imageUrl: composed.imageUrl,
          mockupId: composed.mockupId,
          error: undefined,
        });
        if (!(await persistEdition.current())) throw new Error('La imagen ya está guardada. Recupera el resultado para terminar de guardar la edición.');
        await acknowledgeSharedDesignImage(generation);
        return true;
      } catch (err) {
        if (currentScope.current === scopeKey && editionIdentity.current === identity && slidesRef.current.some(s => s.generationSlotId === generationSlotId)) patchSlide(slideNumber, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Error generando la imagen',
        });
        return false;
      }
    },
    [activeBusinessId, actorId, scopeKey, assertScope, patchSlide, composeAndSave, imageSettings, uploadScene],
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
   * Reescribe el plan y los visuales con la secuencia de slide_number dada, y
   * los renumera 1..n. Base común de mover y eliminar: `slide_number` es la
   * identidad que cruza plan ↔ visual ↔ imagen, así que ambos arrays se
   * reordenan juntos (si solo se moviera uno, el headline quedaría emparejado
   * con la dirección visual equivocada).
   *
   * Devuelve el mapa número viejo → número nuevo.
   */
  const resequence = useCallback(
    (order: number[]): Map<number, number> => {
      const newNumberOf = new Map(order.map((n, i) => [n, i + 1]));

      const planByNumber = new Map(slidePlanRef.current.map((p) => [p.slide_number, p]));
      applySlidePlan(
        order.flatMap((n) => {
          const p = planByNumber.get(n);
          return p ? [{ ...p, slide_number: newNumberOf.get(n)! }] : [];
        }),
      );

      if (slidesRef.current.length > 0) {
        const runtimeByNumber = new Map(slidesRef.current.map((s) => [s.slide_number, s]));
        applySlides(
          order.flatMap((n) => {
            const s = runtimeByNumber.get(n);
            return s ? [{ ...s, slide_number: newNumberOf.get(n)! }] : [];
          }),
        );
      }

      return newNumberOf;
    },
    [applySlidePlan, applySlides],
  );

  /** true si esa pieza ya tiene imagen compuesta (y por tanto contador impreso). */
  const hasImage = useCallback((slides: NewsSlideRuntime[], slideNumber: number): boolean => {
    const rt = slides.find((s) => s.slide_number === slideNumber);
    return Boolean(rt && (rt.imageUrl || rt.imageBase64));
  }, []);

  /**
   * Mueve un slide una posición arriba (-1) o abajo (+1) dentro del plan.
   *
   * Devuelve los slide_number (ya renumerados) de las piezas que cambiaron de
   * posición y tienen imagen: su contador "03 / 07" está horneado en el PNG, así
   * que hay que re-hornear el texto (recomposeSlide) para que coincida.
   */
  const moveSlide = useCallback(
    (slideNumber: number, direction: -1 | 1): number[] => {
      if (slidesRef.current.some(s => s.status === 'generating')) return [];
      const plan = slidePlanRef.current;
      const from = plan.findIndex((p) => p.slide_number === slideNumber);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= plan.length) return [];

      // Secuencia objetivo de slide_number, con las dos posiciones cambiadas.
      const order = plan.map((p) => p.slide_number);
      [order[from], order[to]] = [order[to], order[from]];

      const before = slidesRef.current;
      const newNumberOf = resequence(order);

      // Solo los dos que se movieron, y solo si ya tienen pieza generada.
      return [order[from], order[to]]
        .filter((n) => hasImage(before, n))
        .map((n) => newNumberOf.get(n)!);
    },
    [resequence, hasImage],
  );

  /**
   * Elimina un slide de la edición: lo saca del plan, de los visuales y renumera
   * lo que queda. No borra el PNG ya guardado en la galería (design_mockups),
   * solo deja de formar parte de esta edición.
   *
   * Devuelve los slide_number (ya renumerados) de TODAS las piezas con imagen:
   * al quitar una, el total impreso cambia ("/ 07" → "/ 06") y el contador de
   * cada pieza queda desfasado, así que todas necesitan re-hornear el texto.
   */
  const removeSlide = useCallback(
    (slideNumber: number): number[] => {
      if (slidesRef.current.some(s => s.status === 'generating')) return [];
      const plan = slidePlanRef.current;
      if (!plan.some((p) => p.slide_number === slideNumber)) return [];

      const order = plan.map((p) => p.slide_number).filter((n) => n !== slideNumber);
      const before = slidesRef.current;
      const newNumberOf = resequence(order);

      return order.filter((n) => hasImage(before, n)).map((n) => newNumberOf.get(n)!);
    },
    [resequence, hasImage],
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
      const identity = editionIdentity.current;

      patchSlide(slideNumber, { status: 'generating', error: undefined });
      try {
        await assertScope();
        // Escena en memoria (recién generada/montada) o, si no, la escena
        // persistida en Storage (tras recargar o al reusar una imagen). Solo si
        // no hay ninguna se pide regenerar.
        let sceneBase64 = slide.sceneBase64;
        if (!sceneBase64 && slide.sceneUrl) {
          sceneBase64 = await fetchImageAsBase64(slide.sceneUrl);
          await assertScope();
          if (editionIdentity.current !== identity) return false;
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
        await assertScope();
        if (editionIdentity.current !== identity) return false;
        patchSlide(slideNumber, {
          status: 'done',
          imageBase64: composed.composedBase64,
          imageUrl: composed.imageUrl,
          mockupId: composed.mockupId,
          error: undefined,
        });
        return true;
      } catch (err) {
        if (currentScope.current === scopeKey && editionIdentity.current === identity) patchSlide(slideNumber, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Error actualizando el texto',
        });
        return false;
      }
    },
    [patchSlide, composeAndSave, assertScope, scopeKey],
  );

  const generateAll = useCallback(async (): Promise<void> => {
    if (slidesRef.current.length === 0 || currentScope.current !== scopeKey) return;
    const identity = editionIdentity.current;
    setIsGeneratingAll(true);
    setError(null);
    try {
      for (const slide of slidesRef.current) {
        await assertScope();
        if (identity && editionIdentity.current !== identity) return;
        // Un slide ya generado no se regenera en el "generar todo".
        if (slide.status === 'done') continue;
        await generateSlide(slide.slide_number);
      }
    } catch (error) {
      if (currentScope.current === scopeKey) setError(error instanceof Error ? error.message : 'La sesión cambió.');
    } finally {
      if (currentScope.current === scopeKey) setIsGeneratingAll(false);
    }
  }, [generateSlide, assertScope, scopeKey]);

  // --- Persistencia -------------------------------------------------------

  /**
   * Guarda (o actualiza) la edición en `news_editions`. No persiste el base64
   * de las imágenes, solo su URL de Storage; el resto (input, plan, visuales) sí,
   * que es lo que permite reabrirla.
   */
  const saveEdition = useCallback(async (): Promise<boolean> => {
    const targetEdition = editionIdentity.current;
    // Serialize draft saves: generation of another article may finish while
    // this write is pending. The next writer reads the latest synchronous refs.
    while (saving.current) await saving.current;
    const write = async (): Promise<boolean> => {
    if (!rawInput.trim()) return false;
    try {
      await assertScope();
      const businessId = activeBusinessId;
      if (!businessId || !actorId) throw new Error('No hay una sesión activa para guardar la edición.');
      if (targetEdition && editionIdentity.current !== targetEdition) throw new Error('La edición cambió antes de guardar.');
      if (!editionIdentity.current) editionIdentity.current = { id: crypto.randomUUID(), isNew: true, businessId };
      const identity = editionIdentity.current;
      if (identity.businessId !== businessId) throw new Error('Esta edición pertenece a otro negocio.');
      // visual_plan: los NewsSlideVisual sin los campos de runtime.
      const visualPlan: NewsSlideVisual[] = slidesRef.current.map(
        ({ status: _s, imageBase64: _b, sceneBase64: _scene, sceneUrl: _sceneUrl, imageUrl: _u, mockupId: _m, error: _e, ...visual }) => visual,
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
        id: identity.id, createIfMissing: identity.isNew, businessId, actorId,
        title,
        editionType,
        rawInput,
        inputFormat: detectedFormat,
        normalized: normalizedRef.current,
        slidePlan: slidePlanRef.current,
        visualPlan,
        slides: slidesState,
        status: anyDone && slidesState.every((s) => s.status === 'done') ? 'completed' : 'draft',
      });
      if (currentScope.current === scopeKey && editionIdentity.current === identity) {
        identity.isNew = false;
        setEditionId(id);
      }
      return true;
    } catch (err) {
      if (currentScope.current === scopeKey && (!targetEdition || editionIdentity.current === targetEdition)) setError(err instanceof Error ? err.message : 'Error guardando la edición');
      return false;
    }
    };
    const task = write(); saving.current = task;
    try { return await task; } finally { if (saving.current === task) saving.current = null; }
  }, [rawInput, editionType, detectedFormat, activeBusinessId, actorId, scopeKey, assertScope, saveEditionMutation]);
  persistEdition.current = saveEdition;

  /** Reabre una edición guardada: repuebla el estado desde su fila. */
  const loadEdition = useCallback(
    async (id: string): Promise<boolean> => {
      if (slidesRef.current.some(s => s.status === 'generating')) return false;
      try {
        await assertScope();
        const row: NewsEditionRow = await loadEditionMutation.mutateAsync(id);
        await assertScope();
        if (row.business_id !== currentBusiness.current) throw new Error('Esta edición pertenece a otro negocio.');
        editionIdentity.current = { id: row.id, isNew: false, businessId: row.business_id };
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
            status: st?.status === 'generating' ? 'error' : (st?.status as NewsSlideRuntime['status']) ?? (st?.imageUrl ? 'done' : 'idle'),
            error: st?.status === 'generating' ? 'Hay una generación pendiente. Recupera su resultado para continuar.' : undefined,
            imageUrl: st?.imageUrl,
            mockupId: st?.mockupId,
            sceneUrl: st?.sceneUrl,
          };
        });
        applySlides(runtime);
        return true;
      } catch (err) {
        if (currentScope.current === scopeKey) setError(err instanceof Error ? err.message : 'Error cargando la edición');
        return false;
      }
    },
    [loadEditionMutation, applySlides, applyNormalized, applySlidePlan, assertScope, scopeKey],
  );

  const reset = useCallback(() => {
    if (slidesRef.current.some(s => s.status === 'generating')) return;
    editionIdentity.current = null;
    setEditionId(null);
    setRawInput('');
    applySlidePlan([]);
    applySlides([]);
    applyNormalized(null);
    setDetectedFormat(null);
    setError(null);
  }, [applySlides, applySlidePlan, applyNormalized]);

  useEffect(() => {
    // A generation belongs to its original edition/business. A late result is
    // recovered there; never mix its draft with the newly selected business.
    editionIdentity.current = null;
    setEditionId(null); setRawInput(''); applySlidePlan([]); applySlides([]);
    applyNormalized(null); setDetectedFormat(null); setError(null);
    setIsGeneratingAll(false); setIsPlanning(false); setIsResolving(false); setStateScope(scopeKey);
  }, [scopeKey, applySlidePlan, applySlides, applyNormalized]);

  const visible = stateScope === scopeKey;
  return {
    imageSettings, setImageSettings,
    // input
    editionId: visible ? editionId : null,
    rawInput: visible ? rawInput : '',
    setRawInput,
    editionType,
    setEditionType,
    targetSlides,
    setTargetSlides,
    // state
    detectedFormat: visible ? detectedFormat : null,
    normalized: visible ? normalized : null,
    slidePlan: visible ? slidePlan : [],
    slides: visible ? slides : [],
    isPlanning: visible && isPlanning,
    isResolving: visible && isResolving,
    isGeneratingAll: visible && isGeneratingAll,
    isSaving: saveEditionMutation.isPending,
    isLoadingEdition: loadEditionMutation.isPending,
    error: visible ? error : null,
    // actions
    generatePlan,
    resolveVisuals,
    generateSlide,
    generateAll,
    updateSlideText,
    moveSlide,
    removeSlide,
    updateSlidePrompt,
    recomposeSlide,
    mountSceneImage,
    saveEdition,
    loadEdition,
    reset,
  };
}
