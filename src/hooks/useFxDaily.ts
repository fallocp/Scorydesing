/**
 * useFxDaily — dueño del ciclo de vida de un Daily Report FX.
 *
 *   1. processMd     MD → report (campos editables) + image_prompt   (edge: generate-fx-daily)
 *   2. generateImage image_prompt → escena AI → compone HTML editorial → guarda PNG
 *   3. recompose     re-hornea solo el texto editable sobre la escena en memoria
 *
 * Reutiliza los mismos cables que News: generate-design-image (mode generate,
 * promptFinal verbatim), render server (renderHtmlToPng) y useSaveMockup. El texto
 * editorial va 100% en la capa HTML (buildFxDailyHtml).
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import { useSaveMockup } from './useDesignMockups';
import { buildFxDailyHtml, type FxKitUrls } from '@/utils/design-studio/buildFxDailyHtml';
import { renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer';
import type {
  FxDailyReport,
  GenerateFxDailyResponse,
} from '../../supabase/functions/_shared/fx-daily/fx-daily-types';

/** Lienzo vertical del póster FX compuesto (base carta 8.5×11 del diseño en Presentaciones). */
const FX_WIDTH = 1920;
const FX_HEIGHT = 2485;
const FX_PLATFORM = 'instagram-story';

type FxStatus = 'idle' | 'processing' | 'generating' | 'done' | 'error';

export function useFxDaily() {
  const { activeBusinessId } = useActiveBusiness();
  const saveMockup = useSaveMockup();

  const [rawInput, setRawInput] = useState('');
  const [report, setReport] = useState<FxDailyReport | null>(null);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [mockupId, setMockupId] = useState<string | undefined>();
  const [status, setStatus] = useState<FxStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // La escena sin texto, en memoria, para re-hornear el texto sin re-llamar la IA.
  const sceneRef = useRef<string | null>(null);
  // Espejo síncrono del report para recompose tras editar.
  const reportRef = useRef<FxDailyReport | null>(null);
  const applyReport = useCallback((next: FxDailyReport | null) => {
    reportRef.current = next;
    setReport(next);
  }, []);

  // --- Paso 1: procesar el MD con el agente -------------------------------
  const processMd = useCallback(async (): Promise<boolean> => {
    if (!activeBusinessId || !rawInput.trim()) return false;
    setStatus('processing');
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-fx-daily', {
        body: { business_id: activeBusinessId, raw_input: rawInput },
      });
      const res = data as GenerateFxDailyResponse | undefined;
      if (fnError || !res?.report) {
        throw new Error((data as { message?: string })?.message ?? fnError?.message ?? 'No se procesó el análisis');
      }
      applyReport(res.report);
      setImagePrompt(res.image_prompt);
      // Un report nuevo invalida la imagen previa.
      sceneRef.current = null;
      setImageBase64(undefined);
      setImageUrl(undefined);
      setMockupId(undefined);
      setStatus('idle');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error procesando el análisis');
      setStatus('error');
      return false;
    }
  }, [activeBusinessId, rawInput, applyReport]);

  // --- Composición: hero FIJO + kit de objetos + texto editable → PNG --------
  // El hero es un asset fijo del kit (se genera una vez); aquí NO se llama a la IA.
  // El diario es 100% HTML sobre imágenes fijas + los datos editables.
  const composeAndSave = useCallback(async (heroImageUrl: string, kit: FxKitUrls): Promise<void> => {
    const current = reportRef.current;
    if (!current) throw new Error('sin report');
    const html = buildFxDailyHtml({
      report: current,
      heroImageUrl,
      kit,
      width: FX_WIDTH,
      height: FX_HEIGHT,
    });
    const composedDataUrl = await renderHtmlToPng(html, 'xending-fx-daily', FX_WIDTH, FX_HEIGHT);
    const composedBase64 = composedDataUrl.split(',')[1] ?? '';
    const saved = await saveMockup.mutateAsync({
      imageBase64: composedBase64,
      platform: FX_PLATFORM,
      promptUsed: imagePrompt,
    });
    setImageBase64(composedBase64);
    setImageUrl(saved.imageUrl);
    setMockupId(saved.mockupId);
  }, [saveMockup, imagePrompt]);

  // --- Paso 2: componer con el hero FIJO del kit (sin IA) --------------------
  const generateImage = useCallback(async (kit: FxKitUrls): Promise<boolean> => {
    if (!activeBusinessId) return false;
    const heroUrl = kit.hero;
    if (!heroUrl) {
      setError('Genera el hero en el kit primero ("Generar faltantes").');
      return false;
    }
    setStatus('generating');
    setError(null);
    try {
      sceneRef.current = heroUrl;
      await composeAndSave(heroUrl, kit);
      setStatus('done');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error componiendo la pieza');
      setStatus('error');
      return false;
    }
  }, [activeBusinessId, composeAndSave]);

  // --- Paso 3: re-componer solo el texto/kit editado (mismo hero fijo) -------
  const recompose = useCallback(async (kit: FxKitUrls): Promise<boolean> => {
    const heroUrl = sceneRef.current ?? kit.hero ?? null;
    if (!heroUrl) {
      setError('Genera el hero en el kit primero.');
      return false;
    }
    setStatus('generating');
    setError(null);
    try {
      await composeAndSave(heroUrl, kit);
      setStatus('done');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error actualizando el texto');
      setStatus('error');
      return false;
    }
  }, [composeAndSave]);

  /** Edita campos del report (merge superficial). */
  const updateReport = useCallback((patch: Partial<FxDailyReport>) => {
    const next = { ...(reportRef.current as FxDailyReport), ...patch };
    applyReport(next);
  }, [applyReport]);

  const reset = useCallback(() => {
    setRawInput('');
    applyReport(null);
    setImagePrompt('');
    sceneRef.current = null;
    setImageBase64(undefined);
    setImageUrl(undefined);
    setMockupId(undefined);
    setStatus('idle');
    setError(null);
  }, [applyReport]);

  return {
    rawInput,
    setRawInput,
    report,
    imagePrompt,
    imageBase64,
    imageUrl,
    mockupId,
    status,
    error,
    isProcessing: status === 'processing',
    isGenerating: status === 'generating',
    processMd,
    generateImage,
    recompose,
    updateReport,
    reset,
  };
}
