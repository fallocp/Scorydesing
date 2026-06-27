/**
 * Design Studio Page
 *
 * Orchestrates the full template creation flow:
 * 1. Load brand palette from active business tenant
 * 2. Mode selection (Visual / Reference) via tabs
 * 3. Visual selector or reference image uploader
 * 4. Generate 3 mockup options
 * 5. Select mockup → convert to HTML
 * 6. Iterate on HTML with natural language feedback
 * 7. Save as reusable template
 *
 * Requirements: 1.1, 1.2, 2.1, 13.1, 13.2, 13.3, 13.4, 13.5
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

import { BrandPalettePreview } from '@/components/design-studio/BrandPalettePreview';
import { VisualSelector } from '@/components/design-studio/VisualSelector';
import { ContentModeSelector } from '@/components/design-studio/ContentModeSelector';
import { PieceCopyEditor } from '@/components/design-studio/PieceCopyEditor';
import { AngleSelector, type SelectedAngle } from '@/components/AngleSelector';
import { ReferenceImageUploader } from '@/components/design-studio/ReferenceImageUploader';
import { MockupGallery } from '@/components/design-studio/MockupGallery';
import { SavedMockupsGrid } from '@/components/design-studio/SavedMockupsGrid';
import { DesignFeedbackChat } from '@/components/design-studio/DesignFeedbackChat';
import { HtmlPreviewPanel } from '@/components/design-studio/HtmlPreviewPanel';
import { TemplateSaveDialog } from '@/components/design-studio/TemplateSaveDialog';

import { useDesignStudioStore } from '@/store/designStudioStore';
import { useDesignSession } from '@/hooks/useDesignStudioSession';
import { useGenerateMockups } from '@/hooks/useGenerateMockups';
import { useGenerateDesignHtmlFromMockup } from '@/hooks/useGenerateDesignHtmlFromMockup';
import { useSaveCustomTemplate } from '@/hooks/useSaveCustomTemplate';
import { useSaveMockup, useSavedMockups } from '@/hooks/useDesignMockups';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessConfig } from '@/hooks/useBusinessConfig';
import { useAuth } from '@/hooks/useAuth';
import { useDesignStudioBranches, extractIngredients } from '@/hooks/useDesignStudioBranches';
import { useGenerateIdeas } from '@/hooks/useGenerateIdeas';

import { validateBrandPalette } from '@/utils/design-studio/brandPaletteValidator';
import { convertToTemplate } from '@/utils/design-studio/templateConverter';
import { supabase } from '@/integrations/supabase/client';

import type { BrandPalette, PlatformFormat } from '@/types/design-studio';
import type { SavedMockup } from '@/hooks/useDesignMockups';

// Platform options for Mode B (reference image). Mirrors the "Plataforma base"
// options from VisualSelector so reference mode can set store.selectedPlatform.
const REFERENCE_PLATFORM_OPTIONS: { value: PlatformFormat; label: string }[] = [
  { value: 'instagram-story', label: 'IG Story' },
  { value: 'instagram-post', label: 'IG Post' },
  { value: 'facebook-post', label: 'Facebook' },
  { value: 'linkedin-post', label: 'LinkedIn' },
  { value: 'banner', label: 'Banner' },
];

/**
 * Explicit no-branding directive appended to every image prompt generated in
 * the Design Studio. The generated `prompt_final` is meant to be pasted into
 * ChatGPT/GPT-Image by the user, where the `negative_instructions` field is
 * lost — so the model would otherwise invent an inaccurate Xending logo.
 * The user composites the real logo externally, so the AI image must contain
 * no logo, wordmark or brand name at all.
 */
const NO_LOGO_DIRECTIVE =
  'IMPORTANT — NO BRANDING: Do not render any logo, wordmark, brand name or company name (including "Xending") anywhere in the image. No text, no logos, no watermarks, no signage with readable text. Leave clean negative space so the logo can be composited externally afterwards.';

function appendNoLogoDirective(promptText: string): string {
  if (!promptText) return promptText;
  // Avoid duplicating the directive if already present.
  if (promptText.includes('NO BRANDING')) return promptText;
  return `${promptText.trim()}\n\n${NO_LOGO_DIRECTIVE}`;
}

export default function DesignStudioPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const { data: businessConfig, isLoading: isLoadingConfig } = useBusinessConfig();

  // --- Zustand store ---
  const store = useDesignStudioStore();

  // --- Session persistence ---
  const { activeSession, persistSession, completeSession } = useDesignSession(
    activeBusinessId ?? '',
    user?.id ?? '',
  );

  // --- API hooks ---
  const generateMockups = useGenerateMockups();
  const generateHtml = useGenerateDesignHtmlFromMockup();
  const saveTemplate = useSaveCustomTemplate();
  const saveMockup = useSaveMockup();
  const { data: savedMockups = [], isLoading: isLoadingSaved } = useSavedMockups();
  const { data: branches = [], isLoading: isLoadingBranches } = useDesignStudioBranches();
  const generateIdeas = useGenerateIdeas();

  // --- Local UI state ---
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);

  // Accumulates headlines generated this session so they can be sent as
  // `previousIdeas` to generate-ideas — gives immediate variety even before
  // anything is persisted to content_library.
  const previousHeadlinesRef = useRef<string[]>([]);

  // --- Derived state ---
  const isAnyLoading = store.isGeneratingMockups || store.isGeneratingHtml || store.isSaving;
  const canGenerate =
    store.inputMode === 'visual'
      ? store.selections.platform !== null
      : store.referenceImagePreview !== null && store.selectedPlatform !== null;

  // ---------------------------------------------------------------------------
  // Load brand palette from business config
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!businessConfig) return;

    const paletteData: Record<string, unknown> = {
      primary_color: businessConfig.primary_color,
      secondary_color: businessConfig.secondary_color,
      accent_color: businessConfig.accent_color,
      fonts: businessConfig.fonts,
      logo_url: businessConfig.logo_url,
      disclaimer: businessConfig.disclaimer,
    };

    const validation = validateBrandPalette(paletteData);

    if (!validation.isValid) {
      setValidationErrors(validation.missingFields);
      return;
    }

    setValidationErrors([]);

    const palette: BrandPalette = {
      primary_color: businessConfig.primary_color!,
      secondary_color: businessConfig.secondary_color ?? '#333333',
      accent_color: businessConfig.accent_color ?? '#2ED4C7',
      fonts: businessConfig.fonts ?? { display: 'Inter', body: 'Inter' },
      logo_url: businessConfig.logo_url!,
      disclaimer: businessConfig.disclaimer ?? undefined,
    };

    useDesignStudioStore.setState({ brandPalette: palette });
  }, [businessConfig]);

  // ---------------------------------------------------------------------------
  // Restore session on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (activeSession.data && !store.sessionId) {
      store.restoreSession(activeSession.data);
    } else if (!activeSession.data && !store.sessionId && !activeSession.isLoading) {
      store.initSession();
    }
  }, [activeSession.data, activeSession.isLoading, store.sessionId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleGenerateCopy = useCallback(async () => {
    if (!activeBusinessId || !store.selections.commercialBranchSlug) return;

    const selectedBranch = branches.find(b => b.slug === store.selections.commercialBranchSlug);
    if (!selectedBranch) return;

    setIsGeneratingCopy(true);

    try {
      // 1. Generate copy (headline + subcopy + CTA)
      //    Pass narrative angle + funnel stage + previousIdeas so the
      //    generate-ideas anti-repetition cascade works and the result is
      //    persisted to content_library (same contract as Generador Combinable).
      const { selections } = store;
      const copyResponse = await generateIdeas.mutateAsync({
        type: 'copy',
        brand: (activeBusiness?.slug === 'xending-capital' ? 'xending_capital' : 'xending') as any,
        business_id: activeBusinessId,
        branch_id: selectedBranch.id,
        // Narrative angle dimension — drives variety and enables persistence.
        angle: selections.narrativeAngleSlug ?? undefined,
        narrativeAngle: selections.narrativeAngleName ?? undefined,
        narrativeAngleId: selections.narrativeAngleId ?? undefined,
        funnelStage: selections.funnelStage ?? undefined,
        promptInstruction: selections.narrativePromptInstruction ?? undefined,
        // Session-level headlines already produced, to avoid immediate repeats.
        previousIdeas: previousHeadlinesRef.current.length > 0
          ? previousHeadlinesRef.current
          : undefined,
        // Design Studio only uses the first piece (ideas[0]); request a single
        // piece to avoid generating unused pieces and truncating the JSON.
        quantity: 1,
      });

      // Parse the first idea
      const firstIdea = copyResponse.ideas?.[0];
      let headline = '';
      let body = '';
      let cta = '';

      if (firstIdea && typeof firstIdea === 'object') {
        headline = firstIdea.headline || '';
        body = firstIdea.subcopy || '';
        cta = firstIdea.cta || '';
        store.updatePieceCopyField('headline', headline);
        store.updatePieceCopyField('body', body);
        store.updatePieceCopyField('cta', cta);
      } else if (typeof firstIdea === 'string') {
        headline = firstIdea;
        store.updatePieceCopyField('headline', headline);
      }

      // Remember this headline for the rest of the session.
      if (headline.trim()) {
        previousHeadlinesRef.current = [
          ...previousHeadlinesRef.current,
          headline.trim(),
        ].slice(-30); // keep the prompt bounded
      }

      // 2. Generate image prompts using generate-design-image (mode: prompts)
      //    Same endpoint used in Crear Piezas — generates foto/infografia/mapa_rutas
      try {
        const { data: imageData, error: imageError } = await supabase.functions.invoke('generate-design-image', {
          body: {
            userRequest: headline,
            brand: activeBusiness?.slug === 'xending-capital' ? 'xending_capital' : 'xending',
            business_id: activeBusinessId,
            branch_id: selectedBranch.id,
            mode: 'prompts',
            headline,
            body,
            imageIntent: headline,
            angle: selections.narrativeAngleSlug ?? 'general',
            funnelStage: selections.funnelStage ?? undefined,
            backgroundStyle: selections.background === 'light-cream' ? 'light_cream' : 'navy',
            textInImage: selections.textInImage,
            aspectRatio: store.selections.platform === 'instagram-story' ? '9:16' : '1:1',
          },
        });

        console.log('generate-design-image response:', { imageError, imageData });

        if (imageData?.prompts) {
          const prompts = imageData.prompts;
          // Cache for type switching
          (window as any).__designStudioImagePrompts = prompts;

          // Pick prompt based on selected type
          // prompts can be { fotografia: string } or { fotografia: { prompt_final: string } } or { fotografia: { prompt: string } }
          const getPromptText = (p: unknown): string => {
            if (typeof p === 'string') return p;
            if (p && typeof p === 'object') {
              const obj = p as any;
              if (obj.prompt_final) return obj.prompt_final;
              if (obj.prompt) return obj.prompt;
            }
            return '';
          };

          const selectedType = store.selections.pieceImagePrompt?.type ?? 'foto';
          let promptText = '';

          if (selectedType === 'foto') {
            promptText = getPromptText(prompts.fotografia);
          } else if (selectedType === 'infografia' || selectedType === '3d_clay') {
            promptText = getPromptText(prompts.infografia);
          } else if (selectedType === 'financiero') {
            promptText = getPromptText(prompts.mapa_rutas);
          }

          if (!promptText) {
            // Fallback to first available
            promptText = getPromptText(prompts.fotografia) || getPromptText(prompts.infografia) || getPromptText(prompts.mapa_rutas);
          }

          if (promptText) {
            store.setPieceImagePromptText(appendNoLogoDirective(promptText));
          }

          if (!store.selections.pieceImagePrompt?.type) {
            store.setPieceImageType('foto');
          }
        } else if (imageError) {
          console.warn('generate-design-image error:', imageError);
          toast({
            title: 'Prompt de imagen no generado',
            description: 'Puedes escribirlo manualmente o reintentar.',
            variant: 'destructive',
          });
        }
      } catch (imageErr) {
        console.warn('Image prompt generation failed:', imageErr);
        toast({
          title: 'Prompt de imagen no generado',
          description: 'Timeout o error en la función. Puedes escribirlo manualmente.',
          variant: 'destructive',
        });
      }

      toast({
        title: 'Copy generado',
        description: 'Headline, body, CTA y prompt de imagen listos. Edita si quieres.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error generando copy';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsGeneratingCopy(false);
    }
  }, [activeBusinessId, store.selections.commercialBranchSlug, store.selections.narrativeAngleId, store.selections.narrativeAngleSlug, store.selections.narrativeAngleName, store.selections.funnelStage, store.selections.narrativePromptInstruction, store.selections.pieceImagePrompt?.type, store.selections.platform, branches, activeBusiness]);

  const handleGenerateMockups = useCallback(async () => {
    if (!store.brandPalette || !activeBusinessId) return;

    const platform =
      store.inputMode === 'visual'
        ? (store.selections.platform as PlatformFormat)
        : (store.selectedPlatform as PlatformFormat);

    if (!platform) return;

    store.setGeneratingMockups(true);
    store.setError(null);

    try {
      const request: Parameters<typeof generateMockups.mutateAsync>[0] = {
        business_id: activeBusinessId,
        brand_palette: store.brandPalette,
        mode: store.inputMode,
        platform,
        count: 1,
        business_name: activeBusiness?.name || 'Xending',
        business_context: businessConfig?.industry
          ? `Industry: ${businessConfig.industry}. ${businessConfig.disclaimer ? `Disclaimer: ${businessConfig.disclaimer}` : ''}`
          : undefined,
      } as any;

      if (store.inputMode === 'visual') {
        request.selections = store.selections;

        // Inject content context based on mode
        if (store.selections.contentMode === 'branch' && store.selections.commercialBranchSlug) {
          const selectedBranch = branches.find(b => b.slug === store.selections.commercialBranchSlug);
          if (selectedBranch) {
            const ingredients = extractIngredients(selectedBranch, store.selections.contentType);
            if (ingredients) {
              request.branch_ingredients = ingredients;
            }
          }
          request.content_mode = 'branch';

          // Pass piece-level copy and image prompt if provided
          if (store.selections.pieceCopy?.headline) {
            request.piece_copy = store.selections.pieceCopy;
          }
          if (store.selections.pieceImagePrompt?.prompt) {
            request.piece_image_prompt = store.selections.pieceImagePrompt;
          }
        } else if (store.selections.contentMode === 'custom' && store.selections.customIdea) {
          request.custom_idea = store.selections.customIdea;
          request.content_mode = 'custom';
        }
      } else {
        // For reference mode, convert preview to base64
        if (store.referenceImage) {
          const base64 = await fileToBase64(store.referenceImage);
          request.reference_image_base64 = base64;
        }
        request.reference_description = store.referenceDescription || undefined;
      }

      const response = await generateMockups.mutateAsync(request);
      // Accumulate mockups — append new ones to existing
      const existingMockups = store.mockups;
      const newMockups = response.mockups.map((m, i) => ({
        ...m,
        index: existingMockups.length + i,
      }));
      store.setMockups([...existingMockups, ...newMockups]);
      store.setPlatform(platform);

      // Auto-save to Storage (fire and forget)
      for (const mockup of response.mockups) {
        saveMockup.mutate({
          imageBase64: mockup.image_base64,
          platform,
          selections: store.inputMode === 'visual' ? (store.selections as any) : undefined,
          promptUsed: mockup.prompt_used,
        });
      }

      toast({
        title: 'Mockup generado',
        description: `${existingMockups.length + newMockups.length} opción(es). Guardado automáticamente.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error generando mockups';
      store.setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      store.setGeneratingMockups(false);
    }
  }, [store.brandPalette, activeBusinessId, store.inputMode, store.selections, store.referenceImage, store.referenceDescription, store.selectedPlatform]);

  const handleRegenerateWithFeedback = useCallback(async (feedback: string) => {
    if (!store.brandPalette || !activeBusinessId) return;

    const platform =
      store.inputMode === 'visual'
        ? (store.selections.platform as PlatformFormat)
        : (store.selectedPlatform as PlatformFormat);

    if (!platform) return;

    // Get the prompt from the last generated mockup (or selected one)
    const lastMockup = store.selectedMockupIndex !== null
      ? store.mockups[store.selectedMockupIndex]
      : store.mockups[store.mockups.length - 1];

    const previousPrompt = lastMockup?.prompt_used || '';

    store.setGeneratingMockups(true);
    store.setError(null);

    try {
      const request: Parameters<typeof generateMockups.mutateAsync>[0] = {
        business_id: activeBusinessId,
        brand_palette: store.brandPalette,
        mode: store.inputMode,
        platform,
        count: 1,
        business_name: activeBusiness?.name || 'Xending',
        iteration_feedback: feedback,
        previous_prompt: previousPrompt,
      } as any;

      // Keep selections for context
      if (store.inputMode === 'visual') {
        request.selections = store.selections;
      }

      const response = await generateMockups.mutateAsync(request);

      // Append new mockup to gallery
      const existingMockups = store.mockups;
      const newMockups = response.mockups.map((m, i) => ({
        ...m,
        index: existingMockups.length + i,
      }));
      store.setMockups([...existingMockups, ...newMockups]);
      // Auto-select the new one
      store.selectMockup(existingMockups.length);

      // Save feedback to design_feedback
      if (user?.id) {
        supabase
          .from('design_feedback' as any)
          .insert({
            business_id: activeBusinessId,
            mockup_id: null,
            feedback_type: 'chat',
            message: feedback,
            interpreted_changes: { increase: [], decrease: [] },
            prompt_used: previousPrompt,
            created_by: user.id,
          })
          .then(() => {});
      }

      // Auto-save new mockup
      for (const mockup of response.mockups) {
        saveMockup.mutate({
          imageBase64: mockup.image_base64,
          platform,
          selections: store.inputMode === 'visual' ? (store.selections as any) : undefined,
          promptUsed: mockup.prompt_used,
          iterationFeedback: feedback,
        });
      }

      toast({
        title: 'Mockup regenerado',
        description: 'Nueva versión con tu feedback aplicado.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error regenerando mockup';
      store.setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      store.setGeneratingMockups(false);
    }
  }, [store.brandPalette, activeBusinessId, store.inputMode, store.selections, store.selectedPlatform, store.mockups, store.selectedMockupIndex, user?.id, activeBusiness]);

  const handleConvertToHtml = useCallback(async () => {
    if (!store.brandPalette || !activeBusinessId || store.selectedMockupIndex === null) return;

    const mockup = store.mockups[store.selectedMockupIndex];
    if (!mockup) return;

    const platform = store.selectedPlatform ?? (store.selections.platform as PlatformFormat);
    if (!platform) return;

    store.setGeneratingHtml(true);
    store.setError(null);

    try {
      const response = await generateHtml.mutateAsync({
        business_id: activeBusinessId,
        brand_palette: store.brandPalette,
        mockup_image_base64: mockup.image_base64,
        platform,
      });

      store.setCurrentHtml(response.html);
      // Add initial version to history
      store.addIteration(response.html, '');

      toast({
        title: 'HTML generado',
        description: 'Vista previa lista. Puedes iterar con feedback.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error generando HTML';
      store.setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      store.setGeneratingHtml(false);
    }
  }, [store.brandPalette, activeBusinessId, store.selectedMockupIndex, store.mockups, store.selectedPlatform, store.selections.platform]);

  const handleIterate = useCallback(async (feedback: string) => {
    if (!store.brandPalette || !activeBusinessId || !store.currentHtml) return;

    const mockup = store.selectedMockupIndex !== null ? store.mockups[store.selectedMockupIndex] : null;
    if (!mockup) return;

    const platform = store.selectedPlatform ?? (store.selections.platform as PlatformFormat);
    if (!platform) return;

    store.setGeneratingHtml(true);
    store.setError(null);

    try {
      const response = await generateHtml.mutateAsync({
        business_id: activeBusinessId,
        brand_palette: store.brandPalette,
        mockup_image_base64: mockup.image_base64,
        platform,
        current_html: store.currentHtml,
        iteration_feedback: feedback,
      });

      store.addIteration(response.html, feedback);

      toast({
        title: 'Diseño refinado',
        description: `Iteración ${store.iterationCount + 1} aplicada.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error refinando HTML';
      store.setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      store.setGeneratingHtml(false);
    }
  }, [store.brandPalette, activeBusinessId, store.currentHtml, store.selectedMockupIndex, store.mockups, store.selectedPlatform, store.selections.platform, store.iterationCount]);

  const handleSaveTemplate = useCallback(async (name: string) => {
    if (!store.currentHtml || !store.brandPalette || !activeBusinessId) return;

    const platform = store.selectedPlatform ?? (store.selections.platform as PlatformFormat);
    if (!platform) return;

    store.setSaving(true);

    try {
      const converted = convertToTemplate({
        html: store.currentHtml,
        brand_palette: store.brandPalette,
      });

      await saveTemplate.mutateAsync({
        name,
        business_id: activeBusinessId,
        template_html: converted.template_html,
        platform,
        slots: converted.detected_slots,
      });

      store.markSessionCompleted();

      if (store.sessionId) {
        completeSession.mutate(store.sessionId);
      }

      setSaveDialogOpen(false);

      toast({
        title: 'Template guardado',
        description: `"${name}" está disponible en tu selector de templates.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error guardando template';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      store.setSaving(false);
    }
  }, [store.currentHtml, store.brandPalette, activeBusinessId, store.selectedPlatform, store.selections.platform, store.sessionId]);

  // ---------------------------------------------------------------------------
  // Guard: no business tenant configured
  // ---------------------------------------------------------------------------
  if (!activeBusiness && !isLoadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold text-foreground">Design Studio</h1>
          <p className="text-muted-foreground">
            Se requiere un negocio configurado para usar el Design Studio.
            Configura tu marca primero.
          </p>
          <Button onClick={() => navigate('/admin/business')}>
            Configurar marca
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Design Studio</h1>
            <p className="text-sm text-muted-foreground">
              Crea nuevos templates de diseño con IA generativa
            </p>
          </div>
        </div>

        {/* Brand Palette Preview */}
        <BrandPalettePreview
          brandPalette={store.brandPalette}
          validationErrors={validationErrors}
        />

        {/* Mode Selection Tabs */}
        <Tabs
          value={store.inputMode}
          onValueChange={(value) => store.setInputMode(value as 'visual' | 'reference')}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="visual" disabled={isAnyLoading}>
              Modo A: Selección Visual
            </TabsTrigger>
            <TabsTrigger value="reference" disabled={isAnyLoading}>
              Modo B: Imagen de Referencia
            </TabsTrigger>
          </TabsList>

          <TabsContent value="visual" className="mt-6 space-y-6">
            <VisualSelector
              selections={store.selections}
              onSelect={(category, value) => store.setSelection(category, value)}
              onCustomValue={(category, value) => store.setCustomValue(category, value)}
              disabled={isAnyLoading}
            />

            {/* Content Mode: Libre / Rama / Idea */}
            <ContentModeSelector
              contentMode={store.selections.contentMode}
              selectedBranchSlug={store.selections.commercialBranchSlug}
              customIdea={store.selections.customIdea}
              branches={branches}
              isLoadingBranches={isLoadingBranches}
              onModeChange={(mode) => store.setContentMode(mode)}
              onBranchSelect={(slug) => store.setCommercialBranch(slug)}
              onCustomIdeaChange={(idea) => store.setCustomIdea(idea)}
              disabled={isAnyLoading}
            />

            {/* Piece Copy & Image Prompt (visible when branch is selected) */}
            {store.selections.contentMode === 'branch' && store.selections.commercialBranchSlug && (
              <>
                {/* Narrative angle — drives copy variety + content_library persistence */}
                <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                  <AngleSelector
                    value={store.selections.narrativeAngleSlug}
                    onChange={(angle: SelectedAngle | null) => store.setNarrativeAngle(angle)}
                  />
                </div>

                <PieceCopyEditor
                  pieceCopy={store.selections.pieceCopy}
                  pieceImagePrompt={store.selections.pieceImagePrompt}
                  onCopyFieldChange={(field, value) => store.updatePieceCopyField(field, value)}
                  onImageTypeChange={(type) => {
                    store.setPieceImageType(type);
                    // Update prompt from cached prompts if available
                    const cached = (window as any).__designStudioImagePrompts;
                    if (cached) {
                      const getPromptText = (p: unknown): string => {
                        if (typeof p === 'string') return p;
                        if (p && typeof p === 'object') {
                          const obj = p as any;
                          if (obj.prompt_final) return obj.prompt_final;
                          if (obj.prompt) return obj.prompt;
                        }
                        return '';
                      };
                      const promptMap: Record<string, string> = {
                        'foto': getPromptText(cached.fotografia),
                        'infografia': getPromptText(cached.infografia),
                        '3d_clay': getPromptText(cached.infografia),
                        'financiero': getPromptText(cached.mapa_rutas),
                      };
                      if (promptMap[type]) {
                        store.setPieceImagePromptText(appendNoLogoDirective(promptMap[type]));
                      }
                    }
                  }}
                  onImagePromptChange={(text) => store.setPieceImagePromptText(text)}
                  textInImage={store.selections.textInImage}
                  onTextInImageChange={(value) => store.setTextInImage(value)}
                  onGenerateCopy={handleGenerateCopy}
                  isGeneratingCopy={isGeneratingCopy}
                  disabled={isAnyLoading}
                />
              </>
            )}
          </TabsContent>

          <TabsContent value="reference" className="mt-6 space-y-6">
            <ReferenceImageUploader
              onFileSelect={(file) => store.setReferenceImage(file)}
              onDescriptionChange={(desc) => store.setReferenceDescription(desc)}
              preview={store.referenceImagePreview}
              description={store.referenceDescription}
              disabled={isAnyLoading}
            />

            {/* Platform selector (required to generate) */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground">
                Plataforma base
              </Label>
              <div className="flex flex-wrap gap-2">
                {REFERENCE_PLATFORM_OPTIONS.map((option) => {
                  const isSelected = store.selectedPlatform === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={isAnyLoading}
                      onClick={() => store.setPlatform(option.value)}
                      className={cn(
                        'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                        'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Generate Mockups Button */}
        {store.mockups.length === 0 && !store.currentHtml && (
          <Button
            onClick={handleGenerateMockups}
            disabled={!canGenerate || isAnyLoading || validationErrors.length > 0}
            className="w-full"
            size="lg"
          >
            {store.isGeneratingMockups ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Generando mockups...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Generar mockup
              </>
            )}
          </Button>
        )}

        {/* Mockup Gallery */}
        {(store.mockups.length > 0 || store.isGeneratingMockups) && !store.currentHtml && (
          <MockupGallery
            mockups={store.mockups}
            selectedIndex={store.selectedMockupIndex}
            onSelect={(index) => store.selectMockup(index)}
            onConvert={handleConvertToHtml}
            onRegenerate={handleGenerateMockups}
            onRegenerateWithFeedback={handleRegenerateWithFeedback}
            onDiscard={() => { useDesignStudioStore.setState({ mockups: [], selectedMockupIndex: null, error: null }); }}
            isLoading={store.isGeneratingMockups}
            disabled={store.isGeneratingHtml}
          />
        )}

        {/* HTML Preview Panel */}
        {store.currentHtml && store.selectedPlatform && (
          <HtmlPreviewPanel
            html={store.currentHtml}
            platform={store.selectedPlatform}
            iterationCount={store.iterationCount}
            maxIterations={10}
            htmlHistory={store.htmlHistory}
            onIterate={handleIterate}
            isLoading={store.isGeneratingHtml}
            disabled={isAnyLoading}
          />
        )}

        {/* Save as Template Button */}
        {store.currentHtml && (
          <Button
            onClick={() => setSaveDialogOpen(true)}
            disabled={isAnyLoading}
            className="w-full"
            size="lg"
          >
            <Save className="h-5 w-5 mr-2" />
            Guardar como template
          </Button>
        )}

        {/* Template Save Dialog */}
        <TemplateSaveDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          onSave={handleSaveTemplate}
          isSaving={store.isSaving}
          error={store.error}
        />

        {/* Design Feedback Chat */}
        <DesignFeedbackChat />

        {/* Saved Mockups from DB — always visible */}
        <SavedMockupsGrid
          mockups={savedMockups}
          isLoading={isLoadingSaved}
          isGenerating={store.isGeneratingMockups}
          selectedId={selectedSavedId}
          onSelect={(mockup: SavedMockup) => {
            setSelectedSavedId(mockup.id);
            // Load into store for HTML conversion
            fetch(mockup.image_url)
              .then(r => r.blob())
              .then(blob => {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64 = (reader.result as string).split(',')[1];
                  store.setMockups([{ index: 0, image_base64: base64, prompt_used: mockup.prompt_used || '' }]);
                  store.selectMockup(0);
                  store.setPlatform(mockup.platform as PlatformFormat);
                  // Clear HTML state so mockup gallery shows
                  useDesignStudioStore.setState({ currentHtml: null, htmlHistory: [], iterationCount: 0 });
                };
                reader.readAsDataURL(blob);
              })
              .catch(() => {
                toast({ title: 'Error cargando mockup', variant: 'destructive' });
              });
          }}
          onIterateFrom={(mockup: SavedMockup, feedback: string) => {
            // Use the saved mockup's prompt as the base for iteration
            if (!store.brandPalette || !activeBusinessId) return;

            const platform = (mockup.platform || store.selections.platform || 'instagram-post') as PlatformFormat;

            store.setGeneratingMockups(true);
            store.setError(null);

            generateMockups.mutateAsync({
              business_id: activeBusinessId,
              brand_palette: store.brandPalette,
              mode: 'visual',
              platform,
              count: 1,
              business_name: activeBusiness?.name || 'Xending',
              iteration_feedback: feedback,
              previous_prompt: mockup.prompt_used || '',
              selections: store.selections,
            } as any).then((response) => {
              const existingMockups = store.mockups;
              const newMockups = response.mockups.map((m, i) => ({
                ...m,
                index: existingMockups.length + i,
              }));
              store.setMockups([...existingMockups, ...newMockups]);
              store.selectMockup(existingMockups.length);
              store.setPlatform(platform);
              // Clear HTML so mockup gallery shows
              useDesignStudioStore.setState({ currentHtml: null, htmlHistory: [], iterationCount: 0 });

              // Save feedback
              if (user?.id) {
                supabase
                  .from('design_feedback' as any)
                  .insert({
                    business_id: activeBusinessId,
                    mockup_id: mockup.id,
                    feedback_type: 'chat',
                    message: feedback,
                    interpreted_changes: { increase: [], decrease: [] },
                    prompt_used: mockup.prompt_used || '',
                    created_by: user.id,
                  })
                  .then(() => {});
              }

              // Auto-save new mockup
              for (const m of response.mockups) {
                saveMockup.mutate({
                  imageBase64: m.image_base64,
                  platform,
                  selections: store.selections as any,
                  promptUsed: m.prompt_used,
                  parentMockupId: mockup.id,
                  iterationFeedback: feedback,
                });
              }

              toast({
                title: 'Mockup regenerado',
                description: 'Nueva versión basada en tu feedback.',
              });
            }).catch((error) => {
              const message = error instanceof Error ? error.message : 'Error regenerando';
              store.setError(message);
              toast({ title: 'Error', description: message, variant: 'destructive' });
            }).finally(() => {
              store.setGeneratingMockups(false);
            });
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(',')[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
