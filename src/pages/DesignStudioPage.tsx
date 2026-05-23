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

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';

import { BrandPalettePreview } from '@/components/design-studio/BrandPalettePreview';
import { VisualSelector } from '@/components/design-studio/VisualSelector';
import { ReferenceImageUploader } from '@/components/design-studio/ReferenceImageUploader';
import { MockupGallery } from '@/components/design-studio/MockupGallery';
import { HtmlPreviewPanel } from '@/components/design-studio/HtmlPreviewPanel';
import { TemplateSaveDialog } from '@/components/design-studio/TemplateSaveDialog';

import { useDesignStudioStore } from '@/store/designStudioStore';
import { useDesignSession } from '@/hooks/useDesignStudioSession';
import { useGenerateMockups } from '@/hooks/useGenerateMockups';
import { useGenerateDesignHtmlFromMockup } from '@/hooks/useGenerateDesignHtmlFromMockup';
import { useSaveCustomTemplate } from '@/hooks/useSaveCustomTemplate';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessConfig } from '@/hooks/useBusinessConfig';
import { useAuth } from '@/hooks/useAuth';

import { validateBrandPalette } from '@/utils/design-studio/brandPaletteValidator';
import { convertToTemplate } from '@/utils/design-studio/templateConverter';

import type { BrandPalette, PlatformFormat } from '@/types/design-studio';

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

  // --- Local UI state ---
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // --- Derived state ---
  const isAnyLoading = store.isGeneratingMockups || store.isGeneratingHtml || store.isSaving;
  const canGenerate =
    store.inputMode === 'visual'
      ? store.selections.platform !== null
      : store.referenceImagePreview !== null;

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
        count: 3,
      };

      if (store.inputMode === 'visual') {
        request.selections = store.selections;
      } else {
        // For reference mode, convert preview to base64
        if (store.referenceImage) {
          const base64 = await fileToBase64(store.referenceImage);
          request.reference_image_base64 = base64;
        }
        request.reference_description = store.referenceDescription || undefined;
      }

      const response = await generateMockups.mutateAsync(request);
      store.setMockups(response.mockups);
      store.setPlatform(platform);

      toast({
        title: 'Mockups generados',
        description: '3 opciones listas para revisar.',
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
          <Button onClick={() => navigate('/brand-palette')}>
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

          <TabsContent value="visual" className="mt-6">
            <VisualSelector
              selections={store.selections}
              onSelect={(category, value) => store.setSelection(category, value)}
              onCustomValue={(category, value) => store.setCustomValue(category, value)}
              disabled={isAnyLoading}
            />
          </TabsContent>

          <TabsContent value="reference" className="mt-6">
            <ReferenceImageUploader
              onFileSelect={(file) => store.setReferenceImage(file)}
              onDescriptionChange={(desc) => store.setReferenceDescription(desc)}
              preview={store.referenceImagePreview}
              description={store.referenceDescription}
              disabled={isAnyLoading}
            />
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
                Generar 3 opciones
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
