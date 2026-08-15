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

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Sparkles, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

import { BrandPalettePreview } from '@/components/design-studio/BrandPalettePreview';
import { VisualSelector } from '@/components/design-studio/VisualSelector';
import { ContentModeSelector } from '@/components/design-studio/ContentModeSelector';
import { PieceCopyEditor } from '@/components/design-studio/PieceCopyEditor';
import { CopyBankPanel } from '@/components/design-studio/CopyBankPanel';
import { CarouselPanel } from '@/components/design-studio/CarouselPanel';
import { AngleSelector, type SelectedAngle } from '@/components/AngleSelector';
import { IndustrySelector } from '@/components/design-studio/IndustrySelector';
import { ReferenceImageUploader } from '@/components/design-studio/ReferenceImageUploader';
import { MockupGallery } from '@/components/design-studio/MockupGallery';
import { SavedMockupsGrid } from '@/components/design-studio/SavedMockupsGrid';
import { CarouselPdfComposer } from '@/components/design-studio/CarouselPdfComposer';
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
import { useAllIndustryVerticals } from '@/hooks/useIndustryVerticals';
import { useCopyBank, useSaveBankCopies, useUpdateBankMeta, useUpdateBankCopy, type CopyBankItem } from '@/hooks/useDesignCopyBank';
import { useDeleteGeneratedIdea } from '@/hooks/useGeneratedIdeas';
import {
  useCopyBankV2,
  useMarkCopyUsed,
  useReviewCopyBankItem,
  useUpdateCopyBankImageMeta,
  useUpdateCopyBankText,
} from '@/hooks/useCopyBankV2';
import { CopyBankV2Panel } from '@/components/design-studio/CopyBankV2Panel';
import { resolveBranchForKitSlug, type CopyBankRow } from '@/types/copy-bank';

import { validateBrandPalette } from '@/utils/design-studio/brandPaletteValidator';
import { convertToTemplate } from '@/utils/design-studio/templateConverter';
import { resolveMasterImagePromptSelection } from '@/utils/design-studio/masterImagePrompt';
import { supabase } from '@/integrations/supabase/client';

import {
  DESIGN_STUDIO_IMAGE_PROMPT_REVISION,
  DESIGN_STUDIO_SOURCE,
  type BrandPalette,
  type CarouselMeta,
  type PlatformFormat,
} from '@/types/design-studio';
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
  const {
    data: savedMockups = [],
    isLoading: isLoadingSaved,
    error: savedMockupsError,
  } = useSavedMockups();
  const { data: branches = [], isLoading: isLoadingBranches } = useDesignStudioBranches();
  const generateIdeas = useGenerateIdeas();
  // All industry verticals (for the "Auto (variar)" round-robin).
  const { data: allVerticals = [] } = useAllIndustryVerticals();
  // Cursor for cycling industries when industryAuto is on.
  const industryCycleRef = useRef(0);

  // --- Copy bank (Stage A persistence) ---
  const selectedBranch = branches.find(b => b.slug === store.selections.commercialBranchSlug) ?? null;
  const selectedBranchId = selectedBranch?.id ?? null;
  const copyBank = useCopyBank(selectedBranchId);
  const saveBankCopies = useSaveBankCopies();
  const updateBankMeta = useUpdateBankMeta();
  const updateBankCopy = useUpdateBankCopy();
  const deleteIdea = useDeleteGeneratedIdea();
  const [isGeneratingImagePrompt, setIsGeneratingImagePrompt] = useState(false);
  // Free-text guidance that steers the copy generation (Stage A feedback loop).
  const [copyGuidance, setCopyGuidance] = useState('');

  // --- Copy bank v2 (copy_bank_items) ---
  // The primary source: 180 pre-approved copies seeded at rollout, plus whatever
  // generate-copy-v2 proposes later. The v1 bank below stays for existing
  // sessions and for the 4-at-a-time generator.
  const bankV2 = useCopyBankV2();
  const markCopyUsed = useMarkCopyUsed();
  const reviewCopy = useReviewCopyBankItem();
  const updateBankV2Text = useUpdateCopyBankText();
  const updateBankV2ImageMeta = useUpdateCopyBankImageMeta();
  // Which bank the active candidate came from, so Stage B persists the image
  // prompt to the right table.
  const [activeSource, setActiveSource] = useState<'v1' | 'v2'>('v2');

  // --- Local UI state ---
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);

  // Accumulates headlines generated this session so they can be sent as
  // `previousIdeas` to generate-ideas — gives immediate variety even before
  // anything is persisted to content_library.
  const previousHeadlinesRef = useRef<string[]>([]);

  // --- Carousel subject -----------------------------------------------------
  // The carousel reads the v1 CopyBankItem shape. For a v2 row we adapt it, and
  // pass a writer that targets copy_bank_items.image_meta — the default writer
  // targets generated_ideas, where a v2 id does not exist, so the carousel would
  // be silently discarded.
  const activeV2Row = useMemo(
    () => bankV2.rows.find((r) => r.id === store.activeCandidateId) ?? null,
    [bankV2.rows, store.activeCandidateId],
  );

  /**
   * Commercial branch of the ACTIVE COPY, which is not necessarily the one in
   * the UI selector. Downstream agents keyed by branch_id — the carousel script
   * above all — must follow the copy, or a costos copy generates velocidad
   * narrative.
   */
  const carouselBranchId = useMemo(() => {
    if (activeSource !== 'v2' || !activeV2Row) return selectedBranch?.id ?? null;
    return (
      resolveBranchForKitSlug(branches, activeV2Row.branch_slug)?.id ??
      selectedBranch?.id ??
      null
    );
  }, [activeSource, activeV2Row, branches, selectedBranch?.id]);

  const activeCarouselItem = useMemo<CopyBankItem | null>(() => {
    if (activeSource === 'v1') {
      return copyBank.items.find((it) => it.row.id === store.activeCandidateId) ?? null;
    }
    if (!activeV2Row) return null;
    const meta = activeV2Row.image_meta ?? {};
    return {
      row: {
        id: activeV2Row.id,
        business_id: activeV2Row.business_id,
        branch_id: carouselBranchId,
        vertical_id: null,
        moment_id: null,
        channel: null,
        angle: activeV2Row.angle_tag,
        headline: activeV2Row.headline,
        subcopy: activeV2Row.subcopy,
        cta: activeV2Row.cta,
        image_suggestion: null,
        status: activeV2Row.status,
        created_at: activeV2Row.created_at,
      },
      meta: {
        source: DESIGN_STUDIO_SOURCE,
        angleName: activeV2Row.angle_label ?? activeV2Row.angle_tag,
        industryName: activeV2Row.industry,
        imageMode: meta.imageMode ?? 'single',
        imageType: meta.imageType,
        imagePrompt: meta.imagePrompt,
        imagePromptRevision: meta.imagePromptRevision,
        masterImagePromptVersion: meta.masterImagePromptVersion,
        imageBackgroundStyle: meta.imageBackgroundStyle,
        corridorOverride: meta.corridorOverride,
        corridorAnalysis: meta.corridorAnalysis,
        carousel: meta.carousel,
      },
    } as CopyBankItem;
  }, [activeSource, activeV2Row, copyBank.items, store.activeCandidateId, carouselBranchId]);

  const carouselPersistMeta = useMemo(() => {
    if (activeSource !== 'v2' || !activeV2Row) return undefined;
    return async (patch: { imageMode: 'carousel'; carousel: CarouselMeta }) => {
      await updateBankV2ImageMeta.mutateAsync({
        id: activeV2Row.id,
        current: activeV2Row.image_meta,
        patch,
      });
    };
  }, [activeSource, activeV2Row, updateBankV2ImageMeta]);

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

  // STAGE A — generate a batch of 4 copy candidates and save them ALL to the
  // bank. No image prompt / no visual choices here: those belong to Stage B,
  // applied per selected piece.
  const handleGenerateCopy = useCallback(async () => {
    if (!activeBusinessId || !selectedBranch) return;

    setIsGeneratingCopy(true);

    try {
      const { selections } = store;

      // Resolve the industry vertical: fixed selection, auto (round-robin across
      // all verticals for max variety), or none. With Auto, each batch of 4 uses
      // ONE industry; clicking "Generar 4 más" advances to the next → the bank
      // fills across industries (and the industry filter chips appear).
      let resolvedVerticalId: string | undefined = selections.industryVerticalId ?? undefined;
      let resolvedVerticalName: string | null = selections.industryVerticalName ?? null;
      if (selections.industryAuto && allVerticals.length > 0) {
        const v = allVerticals[industryCycleRef.current % allVerticals.length];
        industryCycleRef.current += 1;
        resolvedVerticalId = v.id;
        resolvedVerticalName = v.name;
      }

      // Feedback loop: build a combined instruction from the angle technique,
      // the user's free-text guidance, and the liked/disliked examples so each
      // new batch converges toward what the user likes.
      const likedItems = copyBank.items.filter((it) => it.meta.rating === 'liked');
      const dislikedItems = copyBank.items.filter((it) => it.meta.rating === 'disliked');

      const instructionParts: string[] = [];
      if (selections.narrativePromptInstruction) {
        instructionParts.push(selections.narrativePromptInstruction);
      }
      if (copyGuidance.trim()) {
        instructionParts.push(`INSTRUCCIÓN DEL USUARIO (prioritaria, respétala): ${copyGuidance.trim()}`);
      }
      if (likedItems.length > 0) {
        const examples = likedItems
          .slice(-5)
          .map((it) => `- "${it.row.headline}"${it.row.subcopy ? ` / ${it.row.subcopy}` : ''}`)
          .join('\n');
        instructionParts.push(
          `IMITA EL TONO, RITMO Y ESTILO DE ESTOS EJEMPLOS QUE SÍ FUNCIONAN (no los copies literal, escribe nuevos en su misma línea):\n${examples}`,
        );
      }
      if (dislikedItems.length > 0) {
        const bad = dislikedItems.slice(-5).map((it) => `- "${it.row.headline}"`).join('\n');
        instructionParts.push(
          `EVITA EL ESTILO DE ESTOS EJEMPLOS (no repitas su tono ni su enfoque):\n${bad}`,
        );
      }
      const combinedInstruction = instructionParts.length > 0
        ? instructionParts.join('\n\n')
        : undefined;

      // Avoid repeats: session headlines + disliked headlines.
      const avoidHeadlines = Array.from(new Set([
        ...previousHeadlinesRef.current,
        ...dislikedItems.map((it) => it.row.headline),
      ]));

      const copyResponse = await generateIdeas.mutateAsync({
        type: 'copy',
        brand: (activeBusiness?.slug === 'xending-capital' ? 'xending_capital' : 'xending') as any,
        business_id: activeBusinessId,
        branch_id: selectedBranch.id,
        vertical_id: resolvedVerticalId,
        angle: selections.narrativeAngleSlug ?? undefined,
        narrativeAngle: selections.narrativeAngleName ?? undefined,
        narrativeAngleId: selections.narrativeAngleId ?? undefined,
        funnelStage: selections.funnelStage ?? undefined,
        promptInstruction: combinedInstruction,
        previousIdeas: avoidHeadlines.length > 0 ? avoidHeadlines : undefined,
        quantity: 4,
      });

      // Use the 'square' overlay (social, punchy) as the bank copy. Platform is
      // chosen later in Stage B; the square variant reads well as a default.
      // deno-lint-ignore no-explicit-any
      const mappedIdeas = (copyResponse as any).mapped as any[] | undefined;
      const source: unknown[] = Array.isArray(mappedIdeas) && mappedIdeas.length > 0
        ? mappedIdeas
        : (copyResponse.ideas ?? []);

      const parsedIdeas = source.map((idea) => {
        // deno-lint-ignore no-explicit-any
        const o = idea as any;
        const ov = o?.overlays?.square;
        if (ov?.headline) {
          return { headline: ov.headline || '', body: ov.subcopy || '', cta: ov.cta || '' };
        }
        if (o && typeof o === 'object' && ('headline' in o)) {
          return { headline: o.headline || '', body: o.subcopy || o.body || '', cta: o.cta || '' };
        }
        return { headline: String(idea), body: '', cta: '' };
      }).filter((i) => i.headline.trim());

      if (parsedIdeas.length === 0) {
        toast({ title: 'No se generaron copys', description: 'Reintenta.', variant: 'destructive' });
        return;
      }

      // Persist the whole batch to the bank.
      await saveBankCopies.mutateAsync({
        branchId: selectedBranch.id,
        copies: parsedIdeas.map((i) => ({
          headline: i.headline,
          subcopy: i.body,
          cta: i.cta,
          angleName: selections.narrativeAngleName ?? null,
          industryName: resolvedVerticalName,
          verticalId: resolvedVerticalId ?? null,
        })),
      });

      // Anti-repetition: remember all headlines from this batch.
      const allHeadlines = parsedIdeas.map((i) => i.headline.trim()).filter(Boolean);
      if (allHeadlines.length > 0) {
        previousHeadlinesRef.current = [
          ...previousHeadlinesRef.current,
          ...allHeadlines,
        ].slice(-40);
      }

      toast({
        title: `${parsedIdeas.length} copys al banco`,
        description: 'Palomea uno abajo para elegir imagen y plataforma.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error generando copy';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsGeneratingCopy(false);
    }
  }, [activeBusinessId, selectedBranch, store.selections, allVerticals, generateIdeas, saveBankCopies, activeBusiness, toast, copyBank.items, copyGuidance]);

  // Select a bank candidate as the active piece. Prompts created before the
  // current runtime/style revision are intentionally not hydrated: the user
  // must rebuild them so stale photography/3D rules cannot leak forward.
  const handleSelectCandidate = useCallback((item: CopyBankItem) => {
    const promptIsCurrent = item.meta.imagePromptRevision === DESIGN_STUDIO_IMAGE_PROMPT_REVISION;

    setActiveSource('v1');
    store.invalidateGeneratedVisuals();
    delete (window as any).__designStudioImagePrompts;
    store.setActiveCandidate(item.row.id, {
      headline: item.row.headline,
      body: item.row.subcopy ?? '',
      cta: item.row.cta ?? '',
    });
    store.setPieceImageType(item.meta.imageType ?? 'foto');
    store.setPieceImagePromptText(promptIsCurrent ? (item.meta.imagePrompt ?? '') : '');
  }, [store]);

  // Same contract as handleSelectCandidate, for rows coming from copy_bank_items.
  // Stage B reads store.activeCandidateId and knows nothing about the source, so
  // the whole image/platform/carousel flow works unchanged.
  const handleSelectBankV2 = useCallback((row: CopyBankRow) => {
    const meta = row.image_meta ?? {};
    const promptIsCurrent = meta.imagePromptRevision === DESIGN_STUDIO_IMAGE_PROMPT_REVISION;

    setActiveSource('v2');
    store.invalidateGeneratedVisuals();
    delete (window as any).__designStudioImagePrompts;
    store.setActiveCandidate(row.id, {
      headline: row.headline,
      body: row.subcopy ?? '',
      cta: row.cta ?? '',
    });
    store.setPieceImageType(meta.imageType ?? 'foto');
    store.setPieceImagePromptText(promptIsCurrent ? (meta.imagePrompt ?? '') : '');
  }, [store]);

  const handleToggleBankV2Used = useCallback((row: CopyBankRow) => {
    const nextUsed = !row.used_at;
    markCopyUsed.mutate(
      { id: row.id, used: nextUsed },
      {
        onSuccess: () =>
          toast({
            title: nextUsed ? 'Marcado como usado' : 'Disponible otra vez',
            description: nextUsed ? row.headline : undefined,
          }),
        onError: () => toast({ title: 'No se pudo actualizar', variant: 'destructive' }),
      },
    );
  }, [markCopyUsed, toast]);

  /**
   * Approve or reject a copy the agent proposed. Approving is what moves it into
   * the library; the seeded copies never pass through here because they arrived
   * approved.
   */
  const handleReviewBankV2 = useCallback((row: CopyBankRow, status: 'approved' | 'rejected') => {
    reviewCopy.mutate(
      { id: row.id, status },
      {
        onSuccess: () =>
          toast({
            title: status === 'approved' ? 'Aprobado y agregado al banco' : 'Propuesta descartada',
            description: row.headline,
          }),
        onError: () => toast({ title: 'No se pudo actualizar', variant: 'destructive' }),
      },
    );
  }, [reviewCopy, toast]);

  // Rate a bank copy (toggle). 'liked' steers new batches to imitate it;
  // 'disliked' avoids it. Persisted in piece_v2 meta.
  const handleRateCandidate = useCallback((item: CopyBankItem, rating: 'liked' | 'disliked') => {
    const nextRating = item.meta.rating === rating ? undefined : rating;
    updateBankMeta.mutate({
      id: item.row.id,
      currentMeta: item.meta,
      meta: { rating: nextRating },
    });
  }, [updateBankMeta]);

  const handleDeleteCandidate = useCallback((id: string) => {
    deleteIdea.mutate(id, {
      onSuccess: () => {
        if (store.activeCandidateId === id) {
          store.setActiveCandidate(null, null);
        }
      },
      onError: () => {
        toast({ title: 'Error al eliminar', variant: 'destructive' });
      },
    });
  }, [deleteIdea, store, toast]);

  // Persist the edited copy of the ACTIVE candidate back to its bank row, so
  // the change sticks before generating the image.
  const handleSaveCopy = useCallback(() => {
    if (!store.activeCandidateId || !store.selections.pieceCopy?.headline?.trim()) return;
    const copy = store.selections.pieceCopy;
    const activeId = store.activeCandidateId;

    // v2 rows have no rating: an edit is just an edit. The v1 path below also
    // auto-likes the row so it steers the next generated batch.
    if (activeSource === 'v2') {
      updateBankV2Text.mutate(
        {
          id: activeId,
          headline: copy.headline.trim(),
          subcopy: copy.body ?? '',
          cta: copy.cta ?? '',
        },
        {
          onSuccess: () =>
            toast({ title: 'Copy guardado', description: 'Ya puedes generar la imagen.' }),
          onError: () => toast({ title: 'Error al guardar copy', variant: 'destructive' }),
        },
      );
      return;
    }

    const active = copyBank.items.find((it) => it.row.id === activeId);
    updateBankCopy.mutate(
      {
        id: activeId,
        headline: copy.headline.trim(),
        subcopy: copy.body ?? '',
        cta: copy.cta ?? '',
      },
      {
        onSuccess: () => {
          // A user-corrected copy is a preferred reference → auto-like it so it
          // steers future batches.
          if (active && active.meta.rating !== 'liked') {
            updateBankMeta.mutate({
              id: activeId,
              currentMeta: active.meta,
              meta: { rating: 'liked' },
            });
          }
          toast({ title: 'Copy guardado', description: 'Marcado como referencia 👍. Ya puedes generar la imagen.' });
        },
        onError: () => toast({ title: 'Error al guardar copy', variant: 'destructive' }),
      },
    );
  }, [store.activeCandidateId, store.selections.pieceCopy, copyBank.items, updateBankCopy, updateBankMeta, toast, activeSource, updateBankV2Text]);

  // STAGE B — generate the image prompt for the ACTIVE candidate, honoring the
  // visual selections chosen now (type, background/color, platform aspect).
  // Uses the CURRENT (possibly edited) copy so modifications are reflected.
  // The prompt is saved onto the candidate's bank row so it persists.
  const handleGenerateImagePrompt = useCallback(async () => {
    if (!activeBusinessId || !selectedBranch) return;

    // Normalize the active piece across both banks so only the persist step
    // below has to care where it came from.
    const activeV1 = copyBank.items.find((it) => it.row.id === store.activeCandidateId);
    const activeV2 = bankV2.rows.find((r) => r.id === store.activeCandidateId);
    const active = activeSource === 'v2'
      ? (activeV2 && {
          id: activeV2.id,
          headline: activeV2.headline,
          subcopy: activeV2.subcopy,
          verticalId: undefined as string | undefined,
        })
      : (activeV1 && {
          id: activeV1.row.id,
          headline: activeV1.row.headline,
          subcopy: activeV1.row.subcopy ?? '',
          verticalId: activeV1.row.vertical_id ?? undefined,
        });
    if (!active) return;

    store.invalidateGeneratedVisuals();
    delete (window as any).__designStudioImagePrompts;

    const { selections } = store;
    // Prefer the edited copy in the editor; fall back to the saved row.
    const headline = selections.pieceCopy?.headline?.trim() || active.headline;
    const body = selections.pieceCopy?.body ?? active.subcopy ?? '';
    const selectedType = selections.pieceImagePrompt?.type ?? 'foto';
    const promptSelection = resolveMasterImagePromptSelection(selections.background);

    setIsGeneratingImagePrompt(true);
    try {
      const { data: imageData, error: imageError } = await supabase.functions.invoke('generate-design-image', {
        body: {
          userRequest: headline,
          brand: activeBusiness?.slug === 'xending-capital' ? 'xending_capital' : 'xending',
          business_id: activeBusinessId,
          branch_id: selectedBranch.id,
          vertical_id: active.verticalId,
          mode: 'prompts',
          headline,
          body,
          cta: selections.pieceCopy?.cta,
          footer: businessConfig?.disclaimer,
          imageIntent: headline,
          angle: selections.narrativeAngleSlug ?? 'general',
          funnelStage: selections.funnelStage ?? undefined,
          backgroundStyle: promptSelection.backgroundStyle,
          masterPromptVersion: promptSelection.masterPromptVersion,
          corridorMode: selections.corridorOverride?.mode ?? 'auto',
          corridorFlowType: selections.corridorOverride?.flowType ?? 'auto',
          corridorOrigin: selections.corridorOverride?.originCountry.trim() || undefined,
          corridorDestination: selections.corridorOverride?.destinationCountry.trim() || undefined,
          textInImage: selections.textInImage,
          aspectRatio: selections.platform === 'instagram-story' ? '9:16' : '1:1',
        },
      });

      if (imageError || !imageData?.prompts) {
        toast({
          title: 'Prompt de imagen no generado',
          description: 'Puedes escribirlo manualmente o reintentar.',
          variant: 'destructive',
        });
        return;
      }

      const prompts = imageData.prompts;
      (window as any).__designStudioImagePrompts = prompts;

      const getPromptText = (p: unknown): string => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object') {
          const obj = p as any;
          if (obj.prompt_final) return obj.prompt_final;
          if (obj.prompt) return obj.prompt;
        }
        return '';
      };

      let promptText = '';
      if (selectedType === 'foto') promptText = getPromptText(prompts.fotografia);
      else if (selectedType === 'infografia') promptText = getPromptText(prompts.infografia);
      else if (selectedType === 'financiero') promptText = getPromptText(prompts.mapa_rutas);
      if (!promptText) {
        promptText = getPromptText(prompts.fotografia) || getPromptText(prompts.infografia) || getPromptText(prompts.mapa_rutas);
      }

      if (promptText) {
        const finalPrompt = appendNoLogoDirective(promptText);
        store.setPieceImagePromptText(finalPrompt);

        // Persist onto the candidate's row, in whichever bank it came from.
        const sharedMeta = {
          imageType: selectedType,
          imagePrompt: finalPrompt,
          imagePromptRevision: DESIGN_STUDIO_IMAGE_PROMPT_REVISION,
          masterImagePromptVersion: promptSelection.masterPromptVersion,
          imageBackgroundStyle: promptSelection.backgroundStyle,
          corridorOverride: selections.corridorOverride,
          corridorAnalysis: imageData.promptMeta?.corridor ?? undefined,
        };

        if (activeSource === 'v2' && activeV2) {
          await updateBankV2ImageMeta.mutateAsync({
            id: activeV2.id,
            current: activeV2.image_meta,
            patch: sharedMeta,
          });
        } else if (activeV1) {
          await updateBankMeta.mutateAsync({
            id: activeV1.row.id,
            currentMeta: activeV1.meta,
            meta: { ...sharedMeta, imageMode: 'single' },
          });
        }
      }

      toast({ title: 'Prompt de imagen listo', description: 'Revisa/edita y genera la imagen.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generando prompt de imagen';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsGeneratingImagePrompt(false);
    }
  }, [activeBusinessId, selectedBranch, copyBank.items, bankV2.rows, activeSource, store, activeBusiness, businessConfig, updateBankMeta, updateBankV2ImageMeta, toast]);

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
          // Pass the image type ALWAYS (even with empty prompt) so the mockup
          // knows the authoritative medium (foto vs 3D vs infografía).
          if (store.selections.pieceImagePrompt?.type) {
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

            {/* ============================================================ */}
            {/* Branch flow: 2 stages (Copy bank → Visual per piece)         */}
            {/* ============================================================ */}
            {store.selections.contentMode === 'branch' && store.selections.commercialBranchSlug && (
              <>
                {/* ---------- ETAPA A — COPY ---------- */}
                <section className="space-y-4">
                  <StageHeader
                    number={1}
                    title="Copy"
                    subtitle="Elige ángulo e industria, genera y palomea uno del banco"
                  />

                  <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                    <AngleSelector
                      value={store.selections.narrativeAngleSlug}
                      onChange={(angle: SelectedAngle | null) => store.setNarrativeAngle(angle)}
                    />
                  </div>

                  <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                    <IndustrySelector
                      value={store.selections.industryAuto ? 'auto' : store.selections.industryVerticalId}
                      onChange={(industry) => store.setIndustryVertical(industry)}
                    />
                  </div>

                  {/* Guidance box — steers the whole batch. Combined with the
                      👍/👎 ratings on the cards to converge the copy. */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Guía de copy (opcional)
                    </Label>
                    <Textarea
                      placeholder={'Dirige el tono/enfoque de las próximas. Ej: "Más profesional y sobrio, sin dramatizar." · "No uses \'reasigna la mercancía\'." · "Enfócate en el spread de tipo de cambio."'}
                      value={copyGuidance}
                      onChange={(e) => setCopyGuidance(e.target.value)}
                      disabled={isAnyLoading || isGeneratingCopy}
                      rows={2}
                      className="text-sm resize-none"
                    />
                    {(copyBank.items.some((i) => i.meta.rating === 'liked') ||
                      copyBank.items.some((i) => i.meta.rating === 'disliked')) && (
                      <p className="text-[11px] text-muted-foreground">
                        Usando {copyBank.items.filter((i) => i.meta.rating === 'liked').length} 👍 como referencia
                        y evitando {copyBank.items.filter((i) => i.meta.rating === 'disliked').length} 👎.
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    onClick={handleGenerateCopy}
                    disabled={isAnyLoading || isGeneratingCopy}
                    className="w-full"
                  >
                    {isGeneratingCopy ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generando 4 copys...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        {copyBank.items.length > 0 ? 'Generar 4 más' : 'Generar 4 copys'}
                      </>
                    )}
                  </Button>

                  {/* Banco v2: los 180 copys aprobados + lo que proponga el
                      agente. Es la fuente primaria — palomea uno y pasas a la
                      Etapa B sin llamar al modelo de copy. */}
                  <div className="border-t border-border pt-5">
                    <CopyBankV2Panel
                      rows={bankV2.rows}
                      isLoading={bankV2.isLoading}
                      activeId={activeSource === 'v2' ? store.activeCandidateId : null}
                      onSelect={handleSelectBankV2}
                      onToggleUsed={handleToggleBankV2Used}
                      isTogglingUsed={markCopyUsed.isPending}
                      onReview={handleReviewBankV2}
                      isReviewing={reviewCopy.isPending}
                      emptyHint="Corre las migraciones de copy_bank_v2 para cargar los 180 copys aprobados."
                    />
                  </div>

                  {/* Banco v1: las tandas de 4 del generador anterior. Se
                      mantiene para sesiones en curso. */}
                  {copyBank.items.length > 0 && (
                    <div className="border-t border-border pt-5">
                      <CopyBankPanel
                        items={copyBank.items}
                        activeId={activeSource === 'v1' ? store.activeCandidateId : null}
                        isLoading={copyBank.isLoading}
                        onSelectActive={handleSelectCandidate}
                        onDelete={handleDeleteCandidate}
                        onRate={handleRateCandidate}
                      />
                    </div>
                  )}
                </section>

                {/* ---------- ETAPA B — IMAGEN Y PLATAFORMA ---------- */}
                {store.activeCandidateId && (
                  <section className="space-y-6 border-t border-border pt-6">
                    <StageHeader
                      number={2}
                      title="Imagen y plataforma"
                      subtitle="Edita el copy si quieres, elige lo visual y genera la imagen"
                    />

                    {/* Edit the active copy — right at the top so you can tweak
                        what it says, save it, and then generate the image. */}
                    <div className="rounded-lg border border-[#FF7A4A]/40 bg-[#FF7A4A]/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                          Edita el copy activo
                        </Label>
                        <span className="text-[11px] text-muted-foreground">
                          Cambia el texto y guarda antes de generar la imagen
                        </span>
                      </div>
                      <Input
                        placeholder="Headline"
                        value={store.selections.pieceCopy?.headline ?? ''}
                        onChange={(e) => store.updatePieceCopyField('headline', e.target.value)}
                        disabled={isAnyLoading}
                        className="text-sm font-semibold"
                      />
                      <Textarea
                        placeholder="Body / subcopy"
                        value={store.selections.pieceCopy?.body ?? ''}
                        onChange={(e) => store.updatePieceCopyField('body', e.target.value)}
                        disabled={isAnyLoading}
                        rows={2}
                        className="text-sm resize-none"
                      />
                      <Input
                        placeholder="CTA"
                        value={store.selections.pieceCopy?.cta ?? ''}
                        onChange={(e) => store.updatePieceCopyField('cta', e.target.value)}
                        disabled={isAnyLoading}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleSaveCopy}
                        disabled={isAnyLoading || updateBankCopy.isPending || !store.selections.pieceCopy?.headline?.trim()}
                        className="w-full"
                      >
                        {updateBankCopy.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Guardando copy...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Guardar copy
                          </>
                        )}
                      </Button>
                    </div>

                    <VisualSelector
                      selections={store.selections}
                      onSelect={(category, value) => store.setSelection(category, value)}
                      onCustomValue={(category, value) => store.setCustomValue(category, value)}
                      disabled={isAnyLoading}
                    />

                    <PieceCopyEditor
                      pieceCopy={store.selections.pieceCopy}
                      pieceImagePrompt={store.selections.pieceImagePrompt}
                      hideCopyFields
                      onCopyFieldChange={(field, value) => store.updatePieceCopyField(field, value)}
                      onImageTypeChange={(type) => {
                        store.invalidateGeneratedVisuals();
                        store.setPieceImageType(type);
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
                            'financiero': getPromptText(cached.mapa_rutas),
                          };
                          if (promptMap[type]) {
                            store.setPieceImagePromptText(appendNoLogoDirective(promptMap[type]));
                          }
                        }
                      }}
                      onImagePromptChange={(text) => {
                        store.invalidateGeneratedVisuals();
                        store.setPieceImagePromptText(text);
                      }}
                      corridorOverride={store.selections.corridorOverride}
                      onCorridorOverrideChange={(corridor) => {
                        store.invalidateGeneratedVisuals();
                        store.setCorridorOverride(corridor);
                      }}
                      textInImage={store.selections.textInImage}
                      onTextInImageChange={(value) => {
                        store.invalidateGeneratedVisuals();
                        store.setTextInImage(value);
                      }}
                      onGenerateCopy={handleGenerateImagePrompt}
                      isGeneratingCopy={isGeneratingImagePrompt}
                      generateButtonLabel="Generar prompt de imagen"
                      generateButtonLoadingLabel="Generando prompt de imagen..."
                      disabled={isAnyLoading}
                    />
                  </section>
                )}

                {/* ---------- ETAPA C — CARRUSEL ---------- */}
                {/* Derives a chained slide set from the same active copy. Independent
                    of Stage B: the single image and the carousel are two
                    different outputs of one approved copy. */}
                {store.activeCandidateId && (
                  <section className="space-y-4 border-t border-border pt-6">
                    <StageHeader
                      number={3}
                      title="Carrusel (opcional)"
                      subtitle="Desglosa el copy activo en slides encadenados"
                    />
                    <CarouselPanel
                      bankItem={activeCarouselItem}
                      persistMeta={carouselPersistMeta}
                      branchId={carouselBranchId}
                      background={store.selections.background}
                      // Solo semilla: el panel del carrusel elige su propio medio.
                      imageType={store.selections.pieceImagePrompt?.type ?? null}
                      brandSlug={activeBusiness?.slug}
                      disabled={isAnyLoading}
                    />
                  </section>
                )}
              </>
            )}

            {/* Non-branch modes (libre / custom): keep the classic single-shot
                visual selector so those flows still work. */}
            {store.selections.contentMode !== 'branch' && (
              <VisualSelector
                selections={store.selections}
                onSelect={(category, value) => store.setSelection(category, value)}
                onCustomValue={(category, value) => store.setCustomValue(category, value)}
                disabled={isAnyLoading}
              />
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

        {/* The grid renders nothing when the list is empty, so a failed query
            used to look identical to "no mockups yet". Surface the reason. */}
        {savedMockupsError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">
              No se pudieron cargar los mockups guardados
            </p>
            <p className="mt-1 text-xs text-destructive/80">
              {savedMockupsError instanceof Error
                ? savedMockupsError.message
                : 'Error desconocido'}
            </p>
          </div>
        )}

        {/* Armado del PDF: va arriba de la galería porque su insumo son las piezas
            de abajo, en particular las variantes con marca montada, que la galería
            lista por fecha y no en orden de lectura. */}
        <CarouselPdfComposer mockups={savedMockups} />

        {/* Saved Mockups from DB — always visible */}
        <SavedMockupsGrid
          mockups={savedMockups}
          isLoading={isLoadingSaved}
          isGenerating={store.isGeneratingMockups}
          selectedId={selectedSavedId}
          // Al borrar el seleccionado, el store sigue con esa imagen cargada para
          // la conversión a HTML: hay que soltarla o el flujo apunta a algo que ya no existe.
          onClearSelection={() => {
            setSelectedSavedId(null);
            store.setMockups([]);
          }}
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

/** Small numbered stage header for the 2-stage branch flow. */
function StageHeader({
  number,
  title,
  subtitle,
}: {
  number: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
        {number}
      </span>
      <div>
        <h2 className="text-base font-semibold text-foreground leading-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

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
