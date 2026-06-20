/**
 * useConversationalOnboarding — Hook that drives the conversational onboarding flow.
 *
 * Manages phases, messages, AI calls (analyze-brand-assets, scrape-brand-presence),
 * and user interactions (confirm/correct).
 *
 * Requirements: Property 1 (Tenant isolation)
 */

import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreateInitialProfile } from '@/hooks/useCreateInitialProfile';

import type {
  OnboardingPhase,
  ChatMessage,
  OnboardingCollectedData,
  InterpretationData,
  UseConversationalOnboardingReturn,
} from './types';

// ─── Phase Questions ─────────────────────────────────────────────────────────

const PHASE_QUESTIONS: Record<OnboardingPhase, string[]> = {
  identity: [
    '¡Hola! Vamos a conocer tu marca. ¿Cuál es el nombre de tu marca?',
    '¿Tienes un sitio web? Comparte la URL para analizar tu presencia digital.',
    '¿Tienes redes sociales? Comparte los links de tus perfiles (LinkedIn, Instagram, etc.)',
  ],
  visual_analysis: [
    'Ahora analicemos tu identidad visual. Sube tu logo y cualquier material visual que tengas (screenshots, PDFs, referencias de diseño).',
  ],
  communication_analysis: [
    '¿Cómo describirías el tono de comunicación de tu marca? (ej: profesional, cercano, técnico, divertido)',
  ],
  preferences: [
    '¿Qué te gusta en diseño? Describe estilos, colores, o referencias que te atraigan.',
    '¿Qué NO te gusta o quieres evitar en tus diseños?',
  ],
  complete: [],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAssistantMessage(content: string, extras?: Partial<ChatMessage>): ChatMessage {
  return {
    id: createId(),
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    ...extras,
  };
}

function createUserMessage(content: string, extras?: Partial<ChatMessage>): ChatMessage {
  return {
    id: createId(),
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
    ...extras,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseConversationalOnboardingOptions {
  businessId: string | null;
  onComplete?: (data: Record<string, unknown>) => void;
}

export function useConversationalOnboarding({
  businessId,
  onComplete,
}: UseConversationalOnboardingOptions): UseConversationalOnboardingReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    createAssistantMessage(PHASE_QUESTIONS.identity[0]),
  ]);
  const [currentPhase, setCurrentPhase] = useState<OnboardingPhase>('identity');
  const [pendingInterpretation, setPendingInterpretation] = useState(false);
  const [collectedData, setCollectedData] = useState<OnboardingCollectedData>({});

  // Hook to create initial creative_profile v1 on completion
  const createInitialProfile = useCreateInitialProfile({ businessId });

  // Ref to avoid stale closures in callbacks
  const collectedDataRef = useRef(collectedData);
  collectedDataRef.current = collectedData;

  const currentPhaseRef = useRef(currentPhase);
  currentPhaseRef.current = currentPhase;

  // Track identity sub-step: 0=name, 1=website, 2=social
  const identityStepRef = useRef(0);
  // Track preferences sub-step: 0=likes, 1=dislikes
  const preferencesStepRef = useRef(0);
  // Track which question within the current phase we're on
  const questionIndexRef = useRef(0);

  // ─── Mutations ───────────────────────────────────────────────────────────

  const analyzeBrandAssets = useMutation({
    mutationFn: async (fileUrls: string[]) => {
      if (!businessId) throw new Error('No business_id');

      const { data, error } = await supabase.functions.invoke('analyze-brand-assets', {
        body: {
          business_id: businessId,
          assets: fileUrls.map((url) => ({ url, type: 'image' })),
        },
      });

      if (error) throw new Error(`Análisis de assets falló: ${error.message}`);
      if (!data?.success) throw new Error(data?.message || 'Error en análisis');
      return data;
    },
  });

  const scrapeBrandPresence = useMutation({
    mutationFn: async (params: { website_url?: string; social_profiles?: string[] }) => {
      if (!businessId) throw new Error('No business_id');

      const { data, error } = await supabase.functions.invoke('scrape-brand-presence', {
        body: {
          business_id: businessId,
          website_url: params.website_url,
          social_profiles: params.social_profiles || [],
        },
      });

      if (error) throw new Error(`Scraping falló: ${error.message}`);
      if (!data?.success) throw new Error(data?.message || 'Error en scraping');
      return data;
    },
  });

  const isProcessing = analyzeBrandAssets.isPending || scrapeBrandPresence.isPending;

  // ─── Phase Advancement ───────────────────────────────────────────────────

  const advanceToPhase = useCallback((nextPhase: OnboardingPhase) => {
    setCurrentPhase(nextPhase);
    questionIndexRef.current = 0;

    if (nextPhase === 'complete') {
      const data = collectedDataRef.current;
      const summaryMsg = createAssistantMessage(
        '¡Listo! He recopilado toda la información de tu marca. Aquí está el resumen:\n\n' +
        `• Marca: ${data.brand_name || 'No especificado'}\n` +
        `• Web: ${data.website_url || 'No proporcionado'}\n` +
        `• Redes: ${data.social_profiles?.join(', ') || 'No proporcionadas'}\n` +
        `• Estilo visual: ${data.visual_analysis?.aesthetic || 'Pendiente de análisis'}\n` +
        `• Tono: ${data.tone_description || data.communication_analysis?.tone || 'No especificado'}\n` +
        `• Le gusta: ${data.design_likes?.join(', ') || 'No especificado'}\n` +
        `• Evitar: ${data.design_dislikes?.join(', ') || 'No especificado'}\n\n` +
        'Tu perfil creativo está listo. ¡Ahora podemos generar contenido personalizado para tu marca!',
      );
      setMessages((prev) => [...prev, summaryMsg]);

      // Create initial creative_profile v1 from collected data
      createInitialProfile.mutate(data, {
        onSuccess: (result) => {
          console.log(
            `Creative profile v${result.version} created (${result.profile_id}), ` +
            `${result.deltas_created} learning deltas saved.`,
          );
        },
        onError: (error) => {
          console.error('Failed to create initial creative profile:', error);
        },
      });

      onComplete?.(data as unknown as Record<string, unknown>);
    } else {
      const firstQuestion = PHASE_QUESTIONS[nextPhase][0];
      if (firstQuestion) {
        setMessages((prev) => [...prev, createAssistantMessage(firstQuestion)]);
      }
    }
  }, [onComplete, createInitialProfile]);

  const askNextQuestionOrAdvance = useCallback((phase: OnboardingPhase, stepIdx: number) => {
    const questions = PHASE_QUESTIONS[phase];
    const nextIdx = stepIdx + 1;

    if (nextIdx < questions.length) {
      setMessages((prev) => [...prev, createAssistantMessage(questions[nextIdx])]);
      return false; // Did not advance phase
    }

    // Determine next phase
    const phaseOrder: OnboardingPhase[] = [
      'identity',
      'visual_analysis',
      'communication_analysis',
      'preferences',
      'complete',
    ];
    const currentIdx = phaseOrder.indexOf(phase);
    const nextPhase = phaseOrder[currentIdx + 1] || 'complete';
    advanceToPhase(nextPhase);
    return true; // Advanced phase
  }, [advanceToPhase]);

  // ─── Message Handlers ────────────────────────────────────────────────────

  const sendMessage = useCallback((text: string) => {
    const userMsg = createUserMessage(text);
    setMessages((prev) => [...prev, userMsg]);

    const phase = currentPhaseRef.current;
    switch (phase) {
      case 'identity':
        handleIdentityMessage(text);
        break;
      case 'visual_analysis':
        // Text in visual phase is treated as description
        handleVisualTextMessage(text);
        break;
      case 'communication_analysis':
        handleCommunicationMessage(text);
        break;
      case 'preferences':
        handlePreferencesMessage(text);
        break;
      default:
        break;
    }
  }, []);

  const handleIdentityMessage = useCallback((text: string) => {
    const step = identityStepRef.current;

    if (step === 0) {
      // Brand name
      setCollectedData((prev) => ({ ...prev, brand_name: text }));
      identityStepRef.current = 1;
      setMessages((prev) => [...prev, createAssistantMessage(PHASE_QUESTIONS.identity[1])]);
    } else if (step === 1) {
      // Website URL (or "no")
      const isUrl = text.match(/^https?:\/\//) || text.includes('.');
      if (isUrl && text.toLowerCase() !== 'no') {
        const url = text.startsWith('http') ? text : `https://${text}`;
        setCollectedData((prev) => ({ ...prev, website_url: url }));
      }
      identityStepRef.current = 2;
      setMessages((prev) => [...prev, createAssistantMessage(PHASE_QUESTIONS.identity[2])]);
    } else if (step === 2) {
      // Social profiles
      const hasProfiles = text.toLowerCase() !== 'no' && text.trim().length > 0;
      if (hasProfiles) {
        const profiles = text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
        setCollectedData((prev) => ({ ...prev, social_profiles: profiles }));
      }
      identityStepRef.current = 0;
      advanceToPhase('visual_analysis');
    }
  }, [advanceToPhase]);

  const handleVisualTextMessage = useCallback((text: string) => {
    // If user types text in visual phase, treat as "skip" or description
    setMessages((prev) => [
      ...prev,
      createAssistantMessage(
        'Entendido. Si tienes archivos para subir, usa el botón de imagen. Si no, avanzamos al siguiente paso.',
      ),
    ]);
    // Advance after a brief moment
    setTimeout(() => advanceToPhase('communication_analysis'), 500);
  }, [advanceToPhase]);

  const handleCommunicationMessage = useCallback((text: string) => {
    setCollectedData((prev) => ({ ...prev, tone_description: text }));

    // If we have a website URL, trigger scrape
    const data = collectedDataRef.current;
    if (data.website_url) {
      setMessages((prev) => [
        ...prev,
        createAssistantMessage('Analizando tu presencia web para complementar...'),
      ]);

      scrapeBrandPresence.mutate(
        {
          website_url: data.website_url,
          social_profiles: data.social_profiles,
        },
        {
          onSuccess: (data) => {
            const webAnalysis = data.web_analysis;
            const interpretation: InterpretationData = {
              summary: `Detecté un tono ${webAnalysis?.tone?.join(', ') || 'profesional'} con enfoque en ${webAnalysis?.topics?.slice(0, 3).join(', ') || 'tu industria'}.`,
              confidence: 0.75,
              key_attributes: [
                ...(webAnalysis?.tone || []),
                ...(webAnalysis?.visual_style?.slice(0, 2) || []),
              ],
              tone: webAnalysis?.tone?.join(', '),
              topics: webAnalysis?.topics,
              positioning: webAnalysis?.value_proposition,
            };

            setCollectedData((prev) => ({
              ...prev,
              web_analysis: webAnalysis,
              communication_analysis: {
                tone: webAnalysis?.tone?.join(', ') || text,
                topics: webAnalysis?.topics || [],
                audience_signals: webAnalysis?.audience_signals || [],
                positioning: webAnalysis?.value_proposition || '',
              },
            }));

            const interpretMsg = createAssistantMessage(
              `Basándome en tu sitio web, interpreto lo siguiente:\n\n` +
              `• Tono: ${webAnalysis?.tone?.join(', ') || 'profesional'}\n` +
              `• Temas principales: ${webAnalysis?.topics?.slice(0, 4).join(', ') || 'N/A'}\n` +
              `• Propuesta de valor: ${webAnalysis?.value_proposition || 'N/A'}\n` +
              `• Industria: ${webAnalysis?.industry || 'N/A'}\n\n` +
              '¿Es correcto o quieres corregir algo?',
              { interpretation, showActions: true },
            );

            setMessages((prev) => [...prev, interpretMsg]);
            setPendingInterpretation(true);
          },
          onError: (error) => {
            setMessages((prev) => [
              ...prev,
              createAssistantMessage(
                `No pude analizar el sitio web (${error.message}). Continuamos con lo que me dijiste.`,
              ),
            ]);
            advanceToPhase('preferences');
          },
        },
      );
    } else {
      // No URL, just save tone and advance
      setCollectedData((prev) => ({
        ...prev,
        communication_analysis: {
          tone: text,
          topics: [],
          audience_signals: [],
          positioning: '',
        },
      }));
      advanceToPhase('preferences');
    }
  }, [advanceToPhase, scrapeBrandPresence]);

  const handlePreferencesMessage = useCallback((text: string) => {
    const step = preferencesStepRef.current;

    if (step === 0) {
      // Likes
      const likes = text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      setCollectedData((prev) => ({ ...prev, design_likes: likes }));
      preferencesStepRef.current = 1;
      setMessages((prev) => [...prev, createAssistantMessage(PHASE_QUESTIONS.preferences[1])]);
    } else {
      // Dislikes
      const dislikes = text.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
      setCollectedData((prev) => ({ ...prev, design_dislikes: dislikes }));
      preferencesStepRef.current = 0;
      advanceToPhase('complete');
    }
  }, [advanceToPhase]);

  // ─── File Upload Handler ─────────────────────────────────────────────────

  const sendFiles = useCallback((files: File[]) => {
    const attachments = files.map((f) => ({ name: f.name, type: f.type, file: f }));
    const userMsg = createUserMessage(
      `Subí ${files.length} archivo${files.length > 1 ? 's' : ''}: ${files.map((f) => f.name).join(', ')}`,
      { attachments },
    );
    setMessages((prev) => [...prev, userMsg]);

    // Upload files to Supabase Storage, then call analyze-brand-assets
    uploadAndAnalyze(files);
  }, [businessId]);

  const uploadAndAnalyze = useCallback(async (files: File[]) => {
    if (!businessId) return;

    try {
      // Upload files to storage
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const filePath = `onboarding/${businessId}/${Date.now()}-${file.name}`;
        const { data, error } = await supabase.storage
          .from('brand-assets')
          .upload(filePath, file);

        if (error) {
          console.error('Upload error:', error.message);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('brand-assets')
          .getPublicUrl(data.path);

        uploadedUrls.push(urlData.publicUrl);
      }

      if (uploadedUrls.length === 0) {
        setMessages((prev) => [
          ...prev,
          createAssistantMessage('No pude subir los archivos. ¿Puedes intentar de nuevo?'),
        ]);
        return;
      }

      setCollectedData((prev) => ({
        ...prev,
        uploaded_assets: [...(prev.uploaded_assets || []), ...uploadedUrls],
      }));

      // Call analyze-brand-assets
      analyzeBrandAssets.mutate(uploadedUrls, {
        onSuccess: (data) => {
          const visual = data.visual_analysis;
          const comm = data.communication_analysis;
          const brand = data.brand_interpretation;

          const interpretation: InterpretationData = {
            summary: brand?.summary,
            confidence: brand?.confidence,
            key_attributes: brand?.key_attributes,
            dominant_colors: visual?.dominant_colors,
            aesthetic: visual?.aesthetic,
            typography_style: visual?.typography_style,
            tone: comm?.tone,
            topics: comm?.topics,
            positioning: comm?.positioning,
          };

          setCollectedData((prev) => ({
            ...prev,
            visual_analysis: visual,
            communication_analysis: comm,
          }));

          const interpretMsg = createAssistantMessage(
            `Analicé tus materiales. Esto es lo que interpreto:\n\n` +
            `• Estética: ${visual?.aesthetic || 'N/A'}\n` +
            `• Colores dominantes: ${visual?.dominant_colors?.join(', ') || 'N/A'}\n` +
            `• Tipografía: ${visual?.typography_style || 'N/A'}\n` +
            `• Tono: ${comm?.tone || 'N/A'}\n` +
            `• Confianza: ${brand?.confidence ? Math.round(brand.confidence * 100) + '%' : 'N/A'}\n\n` +
            '¿Es correcto o quieres corregir algo?',
            { interpretation, showActions: true },
          );

          setMessages((prev) => [...prev, interpretMsg]);
          setPendingInterpretation(true);
        },
        onError: (error) => {
          setMessages((prev) => [
            ...prev,
            createAssistantMessage(
              `Error al analizar los assets: ${error.message}. Puedes intentar de nuevo o avanzar.`,
            ),
          ]);
          advanceToPhase('communication_analysis');
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setMessages((prev) => [
        ...prev,
        createAssistantMessage(`Error subiendo archivos: ${msg}`),
      ]);
    }
  }, [businessId, analyzeBrandAssets, advanceToPhase]);

  // ─── URL Handler ─────────────────────────────────────────────────────────

  const sendUrl = useCallback((url: string) => {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const userMsg = createUserMessage(normalizedUrl);
    setMessages((prev) => [...prev, userMsg]);

    // Store URL based on current phase
    if (currentPhaseRef.current === 'identity') {
      setCollectedData((prev) => ({ ...prev, website_url: normalizedUrl }));
      // Continue identity flow
      identityStepRef.current = 2;
      setMessages((prev) => [...prev, createAssistantMessage(PHASE_QUESTIONS.identity[2])]);
    } else {
      // Generic URL — store as website
      setCollectedData((prev) => ({ ...prev, website_url: normalizedUrl }));
      setMessages((prev) => [
        ...prev,
        createAssistantMessage('URL guardada. La analizaré cuando lleguemos al análisis de comunicación.'),
      ]);
    }
  }, []);

  // ─── Confirm/Correct Handlers ────────────────────────────────────────────

  const confirmInterpretation = useCallback(() => {
    setPendingInterpretation(false);
    setMessages((prev) => [
      ...prev,
      createUserMessage('✓ Confirmado'),
      createAssistantMessage('¡Perfecto! Avanzamos al siguiente paso.'),
    ]);

    // Advance to next phase
    const phase = currentPhaseRef.current;
    if (phase === 'visual_analysis') {
      advanceToPhase('communication_analysis');
    } else if (phase === 'communication_analysis') {
      advanceToPhase('preferences');
    }
  }, [advanceToPhase]);

  const correctInterpretation = useCallback(() => {
    setPendingInterpretation(false);
    setMessages((prev) => [
      ...prev,
      createUserMessage('Quiero corregir'),
      createAssistantMessage('Entendido. ¿Qué quieres corregir? Describe los cambios y los registraré.'),
    ]);

    // The next message from the user will be treated as a correction
    const phase = currentPhaseRef.current;
    setCollectedData((prev) => ({
      ...prev,
      corrections: [
        ...(prev.corrections || []),
        {
          field: phase,
          original_value: null,
          corrected_value: null,
          phase,
        },
      ],
    }));
  }, []);

  return {
    messages,
    currentPhase,
    isProcessing,
    pendingInterpretation,
    collectedData,
    sendMessage,
    sendFiles,
    sendUrl,
    confirmInterpretation,
    correctInterpretation,
  };
}
