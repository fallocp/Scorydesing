import { useState, useRef, useEffect } from 'react';
import {
  Sparkles, Download, Loader2, Eye, Code, X, RotateCcw,
  ImagePlus, Upload, Check, Pencil, ChevronDown, ChevronUp, ImageIcon, Move,
  Trash2, Maximize2, MessageSquare, Send, Zap, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDesignStore } from '@/store/designStore';
import { useGenerateImage } from '@/hooks/useGenerateImage';
import { useImageLibrary } from '@/hooks/useImageLibrary';
import { generatePieceHtml, renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer';
import { useSaveDesignPiece, useDesignPieces, useDeleteDesignPiece } from '@/hooks/useDesignPieces';
import { useSaveBranchState } from '@/hooks/useSaveBranchState';
import { useSaveToDesignLibrary } from '@/hooks/useDesignLibrary';
import { useBranchChat, type ChatMessage as BranchChatMessage, type BranchChatCopy } from '@/hooks/useBranchChat';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithRetry } from '@/lib/supabase-retry';
import { getCtasForBrand, getPunchlinesForBrand } from '@/constants/brandCtas';
import { DESIGN_TEMPLATES, getTemplateById, fillTemplate } from '@/constants/designTemplates';
import { BULLETIN_TEMPLATES, getBulletinTemplateById } from '@/constants/bulletinTemplates';
import type { StrategyBranch, CopyIdea, PlatformFormat } from '@/types/xendingDesign';
import { PLATFORM_DIMENSIONS } from '@/types/xendingDesign';
import { useCustomTemplates } from '@/hooks/useCustomTemplates';

import { HtmlSectionEditor } from './HtmlSectionEditor';
import { VisualDesignEditor } from './VisualDesignEditor';
import { ImageLightbox } from './ImageLightbox';
import { MultichannelRenderer } from './multichannel/MultichannelRenderer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

interface GeneratedVariant {
  id: string;
  imageUrl: string;
  prompt: string;
  base64?: string;
}

interface CopyState {
  variants: GeneratedVariant[];
  selectedVariantId: string | null;
  prompt: string;
  isGenerating: boolean;
  html: string | null;
  renderedPng: string | null;
  savedPieceId: string | null;
  isRendering: boolean;
}

/**
 * Composed context from the new campaign architecture.
 * When provided, enriches the branchPrompt with vertical/moment context.
 */
interface ComposedContext {
  /** Commercial branch strategic config objetivo */
  objetivo?: string;
  /** Vertical keywords for prompt enrichment */
  verticalKeywords?: string[];
  /** Vertical visual context */
  verticalVisualContext?: string;
  /** Market moment trigger type */
  momentTriggerType?: string;
  /** Market moment description */
  momentDescription?: string;
  /** Selected channel */
  channel?: string;
  /** Selected angle */
  angle?: string;
}

interface CopyWorkstationProps {
  branch: StrategyBranch;
  branchName: string;
  initialBrainstormOpen?: boolean;
  /** Optional composed context from the new campaign architecture (branch + vertical + moment) */
  composedContext?: ComposedContext;
}

export function CopyWorkstation({ branch, branchName, initialBrainstormOpen = false, composedContext }: CopyWorkstationProps) {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const activeBusiness = useDesignStore((s) => s.activeBusiness);

  // Detect if this branch is a bulletin (created from Boletín Express)
  const isBulletin = branch.name.startsWith('Boletín:');

  // Parse bulletin metadata from imageDescriptions[0] if present
  const bulletinMeta = (() => {
    if (!isBulletin || !branch.imageDescriptions?.[0]) return null;
    try {
      const parsed = JSON.parse(branch.imageDescriptions[0]);
      if (parsed.bulletinData) return parsed as {
        dataValue: string; dataLabel: string; source: string;
        category: string; templateId: string;
      };
    } catch { /* not JSON, ignore */ }
    return null;
  })();

  // Resolve template from either campaign, bulletin, or custom templates
  const resolveTemplate = (id: string) => {
    // Check if it's a custom template (prefixed with "custom:")
    if (id.startsWith('custom:')) {
      const customId = id.replace('custom:', '');
      const ct = customTemplates.find((t) => t.id === customId);
      if (ct) {
        return {
          id: `custom:${ct.id}`,
          name: ct.name,
          emoji: '⭐',
          description: 'Template personalizado',
          needsImage: false,
          html: ct.html_template,
        };
      }
    }
    return getTemplateById(id) || getBulletinTemplateById(id);
  };

  // Available templates depend on whether this is a bulletin or campaign
  const availableTemplates = isBulletin ? BULLETIN_TEMPLATES : DESIGN_TEMPLATES;

  // Fetch custom templates for the active business (Design Studio templates)
  const { data: customTemplates = [] } = useCustomTemplates();

  // Default template for bulletins comes from metadata
  const defaultTemplateId = bulletinMeta?.templateId || (isBulletin ? 'bulletin-dark' : 'card-light');
  const currentCampaign = useDesignStore((s) => s.currentCampaign);
  const setCampaign = useDesignStore((s) => s.setCampaign);
  const generateImage = useGenerateImage();
  const savePieceMutation = useSaveDesignPiece();
  const saveToLibraryMutation = useSaveToDesignLibrary();
  const deletePieceMutation = useDeleteDesignPiece();
  // Get CTAs from strategic config (new architecture) or fallback to hardcoded
  const strategicConfig = (branch as any)?.strategic_config ?? (branch as any)?.strategicConfig;
  const branchCtas: string[] = strategicConfig?.ctas ?? [];
  const brandCtas = branchCtas.length > 0 ? branchCtas : getCtasForBrand(selectedBrand);

  // Get footers/punchlines from strategic config or fallback to hardcoded
  const branchFooters: string[] = strategicConfig?.footers ?? [];
  const brandPunchlines = branchFooters.length > 0 ? branchFooters : getPunchlinesForBrand(selectedBrand);

  // --- Format/platform selector ---
  const channelToFormat: Record<string, PlatformFormat> = {
    'instagram-story': 'instagram-story',
    'instagram-post': 'instagram-post',
    'instagram-ads': 'instagram-story',
    'facebook': 'linkedin-post',
    'linkedin': 'linkedin-post',
    'whatsapp': 'instagram-story',
    'email': 'banner',
  };
  const defaultChannel = useDesignStore((s) => s.selectedDimensions.channel);
  const [selectedFormat, setSelectedFormat] = useState<PlatformFormat>(
    channelToFormat[defaultChannel ?? ''] ?? 'instagram-story'
  );

  // Try to get campaignId from store or URL
  const urlParams = new URLSearchParams(window.location.search);
  const branchIdFromUrl = urlParams.get('branchId');
  const campaignId = currentCampaign?.id || branchIdFromUrl || undefined;

  // If we have branchId from URL but no campaign in store, set it
  useEffect(() => {
    if (!currentCampaign && branchIdFromUrl && selectedBrand) {
      setCampaign({
        id: branchIdFromUrl,
        userId: '',
        brand: selectedBrand,
        name: branchName,
        brief: '',
        contentType: 'corporate' as any,
        status: 'in_progress',
        partner: 'none',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }, [branchIdFromUrl, currentCampaign, selectedBrand]);

  // Auto-create campaign in DB when none exists (e.g. navigating from wizard without branchId)
  const [autoCreating, setAutoCreating] = useState(false);
  useEffect(() => {
    if (currentCampaign || branchIdFromUrl || !selectedBrand || autoCreating) return;

    const createCampaign = async () => {
      setAutoCreating(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('design_campaigns')
          .insert({
            user_id: user.id,
            brand: selectedBrand,
            name: branchName || branch.name,
            brief: branch.description || '',
            content_type: (branch.category || 'corporate').toLowerCase().replace(/\s+/g, '-'),
            status: 'in_progress',
            partner: 'none',
            commercial_branch_id: (branch as any).commercial_branch_id || null,
            branch_data: branch as unknown as Record<string, unknown>,
          })
          .select()
          .single();

        if (error) {
          console.error('Error auto-creating campaign:', error);
          return;
        }

        setCampaign({
          id: data.id,
          userId: user.id,
          brand: selectedBrand,
          name: branchName || branch.name,
          brief: branch.description || '',
          contentType: (branch.category || 'corporate') as any,
          status: 'in_progress',
          partner: 'none',
          createdAt: data.created_at,
          updatedAt: data.created_at,
        });

        // Persist campaignId in URL so it survives page refresh
        const url = new URL(window.location.href);
        url.searchParams.set('branchId', data.id);
        window.history.replaceState({}, '', url.toString());
      } catch (err) {
        console.error('Error auto-creating campaign:', err);
      } finally {
        setAutoCreating(false);
      }
    };

    createCampaign();
  }, [currentCampaign, branchIdFromUrl, selectedBrand, autoCreating]);

  const { debouncedSave, immediateSave, maxCopyCountRef } = useSaveBranchState(campaignId);

  // Helper: collect current work state for saving
  const getWorkState = () => ({
    copyIdeas: branch.copyIdeas.map((idea) => ({
      headline: idea.headline,
      subcopy: idea.subcopy,
      cta: idea.cta,
    })),
    imageDescriptions: branch.imageDescriptions || [],
    copyPrompts: Object.fromEntries(
      Object.entries(copyStates).map(([k, v]) => [k, v.prompt])
    ),
    copySuggestions: Object.fromEntries(
      Object.entries(suggestions).filter(([_, v]) => v && v.length > 0).map(([k, v]) => [k, v])
    ),
    punchlines: { ...punchlines },
    punchlineSuggestions: Object.fromEntries(
      Object.entries(punchlineSuggestions).filter(([_, v]) => v && v.length > 0).map(([k, v]) => [k, v])
    ),
    promoterPhotos: { ...promoterPhotos },
    promoterEnabled: { ...promoterEnabled },
    copyImageUrls: Object.fromEntries(
      Object.entries(copyStates).map(([k, v]) => [k, v.variants.map((va) => va.imageUrl)])
    ),
    selectedImagePerCopy: Object.fromEntries(
      Object.entries(copyStates).map(([k, v]) => {
        const selected = v.variants.find((va) => va.id === v.selectedVariantId);
        return [k, selected?.imageUrl || ''];
      })
    ),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const swapFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);
  const [swapTargetIndex, setSwapTargetIndex] = useState<number | null>(null);
  const [stockPickerIndex, setStockPickerIndex] = useState<number | null>(null);
  const [swapPickerIndex, setSwapPickerIndex] = useState<number | null>(null);

  // Fetch stock images — filtered by current branch for relevance
  const { data: stockImages } = useImageLibrary(
    activeBusiness?.id ? {
      businessId: activeBusiness.id,
      commercialBranchId: (branch as any).commercial_branch_id || undefined,
    } : undefined
  );

  // Fetch existing saved designs from DB
  const { data: existingPieces } = useDesignPieces(campaignId);

  // Load existing designs on mount
  useEffect(() => {
    if (!existingPieces || existingPieces.length === 0) return;

    setCopyStates((prev) => {
      const updated = { ...prev };
      branch.copyIdeas.forEach((idea, i) => {
        if (!updated[i]) return; // Skip if copy state not yet initialized
        const matching = existingPieces.filter((p) => p.headline === idea.headline && p.html_content);
        if (matching.length > 0 && updated[i].savedDesigns.length === 0) {
          const designs: SavedDesign[] = matching.map((p) => ({
            id: p.id,
            html: p.html_content!,
            pngUrl: p.png_url,
            createdAt: p.created_at,
          }));
          const latest = designs[designs.length - 1];
          updated[i] = {
            ...updated[i],
            savedDesigns: designs,
            activeDesignId: latest.id,
            html: latest.html,
            renderedPng: latest.pngUrl,
          };
        }
      });
      return updated;
    });
  }, [existingPieces, branch.copyIdeas.length]);

  // Load saved work state directly from DB using campaignId
  const [workStateLoaded, setWorkStateLoaded] = useState(false);
  // Resolved branch name (loaded from DB when prop is placeholder)
  const [resolvedBranchName, setResolvedBranchName] = useState(branchName);

  // Sync with prop if parent updates it
  useEffect(() => {
    if (branchName !== 'Cargando...') {
      setResolvedBranchName(branchName);
    }
  }, [branchName]);
  
  useEffect(() => {
    if (!campaignId || workStateLoaded) return;
    
    const loadWorkState = async () => {
      try {
        const { data, error } = await supabase
          .from('design_campaigns')
          .select('name, branch_data')
          .eq('id', campaignId)
          .single();
        
        if (error || !data) {
          setWorkStateLoaded(true);
          return;
        }

        // Resolve branch name from DB data
        const branchData = data.branch_data as any;
        if (branchName === 'Cargando...') {
          const resolvedName = branchData?.name || data.name || branchName;
          setResolvedBranchName(resolvedName);
        }

        if (!branchData) {
          maxCopyCountRef.current = branch.copyIdeas.length;
          setWorkStateLoaded(true);
          return;
        }

        const workState = branchData?._workState;
        
        if (!workState) {
          maxCopyCountRef.current = branch.copyIdeas.length;
          setWorkStateLoaded(true);
          return;
        }

        // Restore additional copyIdeas from workState (source of truth for added copys)
        if (workState.copyIdeas && workState.copyIdeas.length > branch.copyIdeas.length) {
          // Replace branch.copyIdeas entirely with workState version (it's always >= branch)
          branch.copyIdeas.splice(0, branch.copyIdeas.length, ...workState.copyIdeas);
        }

        // Initialize high-water mark with the loaded copy count
        maxCopyCountRef.current = branch.copyIdeas.length;

        // Restore suggestions
        if (workState.copySuggestions) setSuggestions(workState.copySuggestions);
        if (workState.punchlines) setPunchlines(workState.punchlines);
        if (workState.punchlineSuggestions) setPunchlineSuggestions(workState.punchlineSuggestions);
        if (workState.promoterPhotos) setPromoterPhotos(workState.promoterPhotos);
        if (workState.promoterEnabled) setPromoterEnabled(workState.promoterEnabled);

        // Restore copy states
        setCopyStates((prev) => {
          const updated = { ...prev };
          branch.copyIdeas.forEach((idea, i) => {
            // Determine best prompt: imageSuggestion from idea takes priority over
            // generic saved prompts (guia_visual-based). Explicit user edits are preserved.
            const savedPrompt = workState.copyPrompts?.[i] || '';
            const isGenericSavedPrompt = !savedPrompt
              || savedPrompt.includes('diagrama de flujo de pago')
              || savedPrompt.includes('relojes de zonas horarias')
              || savedPrompt.includes('mapa con ruta de transferencia')
              || savedPrompt.startsWith('Empresario profesional en oficina');
            
            const bestPrompt = (idea.imageSuggestion && isGenericSavedPrompt)
              ? idea.imageSuggestion
              : (savedPrompt || idea.imageSuggestion || branch.imageDescriptions?.[i] || '');

            if (!updated[i]) {
              updated[i] = {
                variants: [], selectedVariantId: null,
                prompt: bestPrompt,
                isGenerating: false, html: null, renderedPng: null,
                savedDesigns: [], activeDesignId: null, isRendering: false,
              };
            } else {
              updated[i] = { ...updated[i], prompt: bestPrompt };
            }
            if (workState.copyImageUrls?.[i]?.length > 0) {
              const variants: GeneratedVariant[] = workState.copyImageUrls[i].map((url: string, vIdx: number) => ({
                id: `restored-${i}-${vIdx}`, imageUrl: url, prompt: workState.copyPrompts?.[i] || 'Restaurada',
              }));
              const selectedUrl = workState.selectedImagePerCopy?.[i];
              const selectedVariant = variants.find((v) => v.imageUrl === selectedUrl);
              updated[i] = {
                ...updated[i],
                variants: variants.length > updated[i].variants.length ? variants : updated[i].variants,
                selectedVariantId: selectedVariant?.id || updated[i].selectedVariantId,
              };
            }
          });
          return updated;
        });

        setWorkStateLoaded(true);
      } catch (err) {
        console.error('Error loading workState:', err);
        setWorkStateLoaded(true);
      }
    };

    loadWorkState();
  }, [campaignId]);

  // State per copy
  const [copyStates, setCopyStates] = useState<Record<number, CopyState>>(() => {
    const initial: Record<number, CopyState> = {};
    const guiaVisual = strategicConfig?.guia_visual ?? '';

    branch.copyIdeas.forEach((idea, i) => {
      // Build image prompt priority:
      // 1. Saved imageDescriptions (from DB/previous session)
      // 2. imageSuggestion from the generated idea (model-specific visual direction)
      // 3. Fallback: guia_visual + headline
      let imagePrompt = branch.imageDescriptions?.[i] || '';
      if (!imagePrompt && idea.imageSuggestion) {
        imagePrompt = idea.imageSuggestion;
      }
      if (!imagePrompt && guiaVisual && idea.headline) {
        imagePrompt = `${guiaVisual}\n\nPara el copy: "${idea.headline}" — ${idea.subcopy?.slice(0, 100) ?? ''}`;
      }

      initial[i] = {
        variants: [],
        selectedVariantId: null,
        prompt: imagePrompt,
        isGenerating: false,
        html: null,
        renderedPng: null,
        savedDesigns: [],
        activeDesignId: null,
        isRendering: false,
      };
    });
    return initial;
  });

  // Sync copyStates when branch.copyIdeas grows (e.g. loaded from DB after initial render)
  useEffect(() => {
    const guiaVisual = strategicConfig?.guia_visual ?? '';
    setCopyStates((prev) => {
      const missing = branch.copyIdeas.reduce((acc, idea, i) => {
        if (prev[i]) return acc;
        let imagePrompt = branch.imageDescriptions?.[i] || '';
        if (!imagePrompt && idea.imageSuggestion) imagePrompt = idea.imageSuggestion;
        if (!imagePrompt && guiaVisual && idea.headline) {
          imagePrompt = `${guiaVisual}\n\nPara el copy: "${idea.headline}" — ${idea.subcopy?.slice(0, 100) ?? ''}`;
        }
        acc[i] = {
          variants: [],
          selectedVariantId: null,
          prompt: imagePrompt,
          isGenerating: false,
          html: null,
          renderedPng: null,
          savedDesigns: [],
          activeDesignId: null,
          isRendering: false,
        };
        return acc;
      }, {} as Record<number, typeof prev[number]>);

      if (Object.keys(missing).length === 0) return prev;
      return { ...prev, ...missing };
    });
  }, [branch.copyIdeas.length]);

  // Expanded/collapsed state per copy
  const [expandedCopy, setExpandedCopy] = useState<number | null>(0);
  const [suggestingIndex, setSuggestingIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Record<number, string[]>>({});

  // HTML editor state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editHtml, setEditHtml] = useState('');
  // Visual editor state
  const [visualEditingIndex, setVisualEditingIndex] = useState<number | null>(null);

  // --- Brainstorm panel state ---
  const [brainstormOpen, setBrainstormOpen] = useState(initialBrainstormOpen);
  const [brainstormMessages, setBrainstormMessages] = useState<Array<{
    role: 'user' | 'assistant';
    text: string;
    copys?: BranchChatCopy[];
    addedIndexes?: Set<number>;
  }>>([]);
  const [brainstormInput, setBrainstormInput] = useState('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editPromptValue, setEditPromptValue] = useState('');
  const brainstormChatEndRef = useRef<HTMLDivElement>(null);
  const brainstormInputRef = useRef<HTMLInputElement>(null);
  const chatMutation = useBranchChat();

  // Build enriched branchPrompt incorporating composed context when available
  const branchPrompt = (() => {
    const base = branch.branchPrompt || `Objetivo: ${branch.keyMessage}. Rama "${branch.name}" (${branch.category}). Audiencia: ${branch.targetAudience}. ${branch.description}`;
    if (!composedContext) return base;

    const parts = [base];
    if (composedContext.verticalKeywords && composedContext.verticalKeywords.length > 0) {
      parts.push(`Vertical: ${composedContext.verticalKeywords.join(', ')}`);
    }
    if (composedContext.verticalVisualContext) {
      parts.push(`Contexto visual: ${composedContext.verticalVisualContext}`);
    }
    if (composedContext.momentTriggerType) {
      parts.push(`Momento de mercado: ${composedContext.momentTriggerType}`);
    }
    if (composedContext.momentDescription) {
      parts.push(`Descripción momento: ${composedContext.momentDescription}`);
    }
    if (composedContext.channel) {
      parts.push(`Canal: ${composedContext.channel}`);
    }
    if (composedContext.angle) {
      parts.push(`Ángulo: ${composedContext.angle}`);
    }
    return parts.join('. ');
  })();

  const updateCopyState = (index: number, updates: Partial<CopyState>) => {
    setCopyStates((prev) => {
      const updated = {
        ...prev,
        [index]: { ...prev[index], ...updates },
      };
      return updated;
    });
    // Auto-save on state changes (debounced)
    setTimeout(() => debouncedSave(branch, getWorkState()), 100);
  };

  const getSelectedImageUrl = (index: number): string | null => {
    const state = copyStates[index];
    if (!state?.selectedVariantId) return null;
    const variant = state.variants.find((v) => v.id === state.selectedVariantId);
    return variant?.imageUrl || null;
  };

  // --- Helper to call generate-ideas edge function ---
  const callGenerateIdeas = async (body: Record<string, unknown>) => {
    return invokeWithRetry('generate-ideas', { body });
  };

  // --- Suggest image prompt ideas (via Claude) ---
  const handleSuggestIdeas = async (index: number) => {
    if (!selectedBrand) return;
    const idea = branch.copyIdeas[index];
    const state = copyStates[index];
    setSuggestingIndex(index);

    // Collect previously generated ideas to avoid repetition
    const previousIdeas = suggestions[index] || [];

    try {
      const data = await callGenerateIdeas({
        type: 'image',
        brand: selectedBrand,
        business_id: activeBusiness?.id || undefined,
        branch_id: (branch as any).commercial_branch_id || undefined,
        angle: branch.category || 'general',
        headline: idea.headline,
        subcopy: idea.subcopy,
        cta: idea.cta,
        currentPrompt: state.prompt || undefined,
        previousIdeas: previousIdeas.length > 0 ? previousIdeas : undefined,
        branchPrompt: branch.branchPrompt || undefined,
      });

      if (data?.ideas && Array.isArray(data.ideas)) {
        // Append new ideas to existing ones (don't replace)
        setSuggestions((prev) => ({
          ...prev,
          [index]: [...(prev[index] || []), ...data.ideas],
        }));
        // Save ideas to DB
        setTimeout(() => immediateSave(branch, getWorkState()), 200);
      }
    } catch (err) {
      console.error('Error sugiriendo ideas:', err);
      toast({ title: 'Error al generar ideas', variant: 'destructive' });
    } finally {
      setSuggestingIndex(null);
    }
  };

  // --- Suggest copy variations (via Claude) ---
  const [suggestingCopyIndex, setSuggestingCopyIndex] = useState<number | null>(null);
  const [copySuggestions, setCopySuggestions] = useState<Record<number, Array<{ headline: string; subcopy: string; cta: string }>>>({});
  const [punchlines, setPunchlines] = useState<Record<number, string>>({});
  const [punchlineSuggestions, setPunchlineSuggestions] = useState<Record<number, string[]>>({});
  const [suggestingPunchlineIndex, setSuggestingPunchlineIndex] = useState<number | null>(null);

  // Bulletin-specific editable fields per copy index
  const [bulletinFields, setBulletinFields] = useState<Record<number, {
    dataValue: string; dataLabel: string; source: string; category: string;
  }>>(() => {
    if (!isBulletin || !bulletinMeta) return {};
    // Initialize from metadata for the first copy
    return { 0: {
      dataValue: bulletinMeta.dataValue || '',
      dataLabel: bulletinMeta.dataLabel || '',
      source: bulletinMeta.source || '',
      category: bulletinMeta.category || '',
    }};
  });

  const updateBulletinField = (index: number, field: string, value: string) => {
    setBulletinFields((prev) => ({
      ...prev,
      [index]: { ...(prev[index] || { dataValue: '', dataLabel: '', source: '', category: '' }), [field]: value },
    }));
  };

  // Template selection per copy
  const [templates, setTemplates] = useState<Record<number, string>>({});

  // Multi-select: templates and platforms for batch generation
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Record<number, string[]>>({});
  const [selectedFormats, setSelectedFormats] = useState<Record<number, PlatformFormat[]>>({});

  // Promoter photo per copy (for the promoter template badge)
  const [promoterPhotos, setPromoterPhotos] = useState<Record<number, string>>({});
  const [promoterEnabled, setPromoterEnabled] = useState<Record<number, boolean>>({});
  const promoterPhotoInputRef = useRef<HTMLInputElement>(null);
  const [promoterPhotoTargetIndex, setPromoterPhotoTargetIndex] = useState<number | null>(null);

  // Floating badge per copy
  const [floatingEnabled, setFloatingEnabled] = useState<Record<number, boolean>>({});
  const [floatingFields, setFloatingFields] = useState<Record<number, { label: string; value: string }>>({});
  const updateFloatingField = (index: number, field: 'label' | 'value', val: string) => {
    setFloatingFields((prev) => ({
      ...prev,
      [index]: { ...(prev[index] || { label: '', value: '' }), [field]: val },
    }));
  };

  // Lightbox for viewing designs full-size
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Multi-channel renderer modal — index of copy whose pieceV2 is being applied
  const [multichannelIndex, setMultichannelIndex] = useState<number | null>(null);

  // Active business for multi-channel renderer
  const { activeBusinessId } = useActiveBusiness();

  // Image generation style per copy
  const [imageStyles, setImageStyles] = useState<Record<number, string>>({});

  const handleSuggestCopy = async (index: number) => {
    if (!selectedBrand) return;
    const idea = branch.copyIdeas[index];
    setSuggestingCopyIndex(index);

    try {
      const data = await callGenerateIdeas({
        type: 'copy',
        brand: selectedBrand,
        business_id: activeBusiness?.id || undefined,
        branch_id: (branch as any).commercial_branch_id || undefined,
        angle: branch.category || 'general',
        headline: idea.headline,
        subcopy: idea.subcopy,
        cta: idea.cta,
        branchPrompt: branch.branchPrompt || undefined,
      });

      if (data?.ideas && Array.isArray(data.ideas)) {
        setCopySuggestions((prev) => ({ ...prev, [index]: data.ideas }));
      }
    } catch (err) {
      console.error('Error sugiriendo copy:', err);
      toast({ title: 'Error al generar ideas de copy', variant: 'destructive' });
    } finally {
      setSuggestingCopyIndex(null);
    }
  };

  // --- Suggest punchlines (via Claude) ---
  const handleSuggestPunchlines = async (index: number) => {
    if (!selectedBrand) return;
    const idea = branch.copyIdeas[index];
    setSuggestingPunchlineIndex(index);

    try {
      const data = await callGenerateIdeas({
        type: 'punchline',
        brand: selectedBrand,
        business_id: activeBusiness?.id || undefined,
        branch_id: (branch as any).commercial_branch_id || undefined,
        angle: branch.category || 'general',
        headline: idea.headline,
        subcopy: idea.subcopy,
        cta: idea.cta,
        branchPrompt: branch.branchPrompt || undefined,
      });

      if (data?.ideas && Array.isArray(data.ideas)) {
        setPunchlineSuggestions((prev) => ({
          ...prev,
          [index]: [...(prev[index] || []), ...data.ideas],
        }));
      }
    } catch (err) {
      console.error('Error sugiriendo punchlines:', err);
      toast({ title: 'Error al generar punchlines', variant: 'destructive' });
    } finally {
      setSuggestingPunchlineIndex(null);
    }
  };

  // --- Apply a copy suggestion ---
  const handleApplyCopy = (index: number, suggestion: { headline: string; subcopy: string; cta: string }) => {
    // Update the branch copy idea in place
    branch.copyIdeas[index] = { ...branch.copyIdeas[index], ...suggestion };
    setCopySuggestions((prev) => ({ ...prev, [index]: [] }));
    // Force re-render
    setCopyStates((prev) => ({ ...prev }));
    toast({ title: 'Copy actualizado' });
    // Immediate save after applying copy
    immediateSave(branch, getWorkState());
  };

  // --- Generate image for a copy ---
  const handleGenerateImage = async (index: number) => {
    if (!selectedBrand) return;
    const state = copyStates[index];
    if (!state.prompt.trim()) {
      toast({ title: 'Escribe un prompt para la imagen', variant: 'destructive' });
      return;
    }

    const imageStyle = imageStyles[index] || 'photo';
    const idea = branch.copyIdeas[index];
    let finalPrompt = state.prompt.trim();

    if (imageStyle === 'infographic') {
      finalPrompt = `STYLE: Infographic / diagram design for social media advertising. Use brand colors: turquoise #2ED4C7, coral #FF7A4A, navy #0F1419, cream #F5F3F0 background. The design should visually explain the concept using relevant visual elements (diagrams, icons, charts, flows, comparisons) based on the user prompt below. Make it look like a professional marketing infographic, clean and modern. Concept: "${idea.headline}" — ${idea.subcopy}. Visual direction: ${finalPrompt}`;
    } else if (imageStyle === 'clay3d') {
      finalPrompt = `Create a premium 3D fintech illustration in a clean, modern advertising style. Square format 1:1. The overall visual impression must be bright, soft, elegant, and brand-colored, with coral orange and turquoise teal clearly dominating the image. Use a soft warm cream / light beige background as a neutral support only. The image should feel airy, minimal, polished, and premium — never dark, heavy, or industrial-dominant. The design should visually communicate the concept described below. Main scene: Create stylized 3D raised elements that represent the specific concept from the user prompt. Do NOT default to a map — only include geographic elements if the concept explicitly involves routes or destinations. Visual palette hierarchy: turquoise teal #2ED4C7 = major dominant color, coral orange #FF7A4A = major dominant color, cream / off-white / warm beige = supporting neutral, dark navy #0F1419 = minor accent only. Color distribution rule: turquoise approx. 38%, coral approx. 33%, cream/beige approx. 22%, dark navy approx. 7%. Dark navy is used only for small interior details and accents — never as the main color of large objects. Objects and materials: coins must be coral and turquoise, matte or semi-matte, never metallic. Interface tiles and app icon blocks should be mostly cream or off-white with coral and turquoise icons. All materials should feel smooth, soft-touch, premium, clean, and modern. Style requirements: bright overall image, coral and turquoise visually dominate, clean premium fintech aesthetic, soft studio lighting, subtle shadows, no clutter, elegant modern composition, high-end advertising render, hyper-clean 3D style, friendly trustworthy brand-driven visual language, simplified shapes with premium detail. Strict exclusions: No black dominant objects. No gray dominant palette. No metallic gold silver or bronze coins. No realistic money textures. No dull colors. No heavy shadows. No vintage style. No text, no people, no watermark, no logo. The final image must feel like a premium fintech ad illustration with a bright cream background, clean raised shapes, brand-colored elements, and a minimal elegant composition. Concept: "${idea.headline}" — ${idea.subcopy}. Visual direction: ${finalPrompt}`;
    } else if (imageStyle === 'financial') {
      finalPrompt = `STYLE: Financial / business visual with realistic elements relevant to the concept. Use neutral professional colors (NO specific brand colors). The image should visually represent: "${idea.headline}". Include financial elements that match the concept (dashboards, currency symbols, charts, screens, documents — choose what fits). Professional advertising quality, clean composition. Visual direction: ${finalPrompt}`;
    }

    updateCopyState(index, { isGenerating: true });

    try {
      const data = await generateImage.mutateAsync({
        userRequest: finalPrompt,
        brand: selectedBrand,
        headline: idea?.headline,
        body: idea?.subcopy,
      });

      // Upload to storage
      const byteString = atob(data.imageBase64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: 'image/png' });

      const slug = state.prompt
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 40);
      const filename = `${selectedBrand}/generated/${slug}-${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('design-images')
        .upload(filename, blob, { contentType: 'image/png' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('design-images')
        .getPublicUrl(filename);

      // Save to design_images table
      await supabase.from('design_images').insert({
        brand: selectedBrand,
        source: 'generated',
        storage_path: urlData.publicUrl,
        description: state.prompt,
        tags: state.prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 8),
        theme: 'generated',
        prompt_used: state.prompt,
        campaign_id: currentCampaign?.id || null,
        usage_count: 0,
      });

      // Also save to image_library with branch + angle taxonomy (non-blocking)
      if (activeBusiness?.id) {
        supabase.from('image_library' as any).insert({
          business_id: activeBusiness.id,
          image_url: urlData.publicUrl,
          commercial_branch_id: (branch as any).commercial_branch_id || null,
          image_type: imageStyle === 'infographic' ? 'infografia' : imageStyle === 'clay3d' ? 'infografia' : 'fotografia',
          image_intent: state.prompt,
          angle_tag: branch.category || composedContext?.angle || 'general',
          pipeline_run_id: null,
        }).then(({ error }) => {
          if (error) console.error('Error saving to image_library (non-blocking):', error);
        });
      }

      const variantId = `gen-${Date.now()}`;
      const newVariant: GeneratedVariant = {
        id: variantId,
        imageUrl: urlData.publicUrl,
        prompt: state.prompt,
      };

      updateCopyState(index, {
        variants: [...state.variants, newVariant],
        selectedVariantId: variantId,
        isGenerating: false,
      });

      toast({ title: `Imagen generada para Copy ${index + 1}` });
      // Immediate save after generating image
      immediateSave(branch, getWorkState());
    } catch (err) {
      console.error('Error generando imagen:', err);
      updateCopyState(index, { isGenerating: false });
      toast({
        title: 'Error al generar imagen',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  // --- Upload manual image ---
  const handleUploadClick = (index: number) => {
    setUploadTargetIndex(index);
    fileInputRef.current?.click();
  };

  // --- Swap photo in existing design (no Claude call) ---
  const handleSwapPhotoClick = (index: number) => {
    setSwapTargetIndex(index);
    swapFileInputRef.current?.click();
  };

  const handleSwapFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || swapTargetIndex === null || !selectedBrand) return;

    const index = swapTargetIndex;
    setSwapTargetIndex(null);
    if (swapFileInputRef.current) swapFileInputRef.current.value = '';

    const state = copyStates[index];
    if (!state.html) return;

    updateCopyState(index, { isRendering: true });

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${selectedBrand}/swap/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('design-images')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('design-images')
        .getPublicUrl(path);

      const newImageUrl = urlData.publicUrl;

      // Replace image URL in existing HTML
      const updatedHtml = replacePhotoInHtml(state.html, newImageUrl);

      // Add as variant
      const variantId = `swap-${Date.now()}`;
      const newVariant: GeneratedVariant = {
        id: variantId,
        imageUrl: newImageUrl,
        prompt: 'Foto cambiada',
      };

      const dataUrl = await renderHtmlToPng(updatedHtml, selectedBrand, PLATFORM_DIMENSIONS[selectedFormat].width, PLATFORM_DIMENSIONS[selectedFormat].height);

      updateCopyState(index, {
        variants: [...state.variants, newVariant],
        selectedVariantId: variantId,
        html: updatedHtml,
        renderedPng: dataUrl,
        isRendering: false,
      });

      await savePieceToDb(index, updatedHtml, dataUrl);
      toast({ title: `Foto cambiada en pieza ${index + 1} — sin costo IA` });
    } catch (err) {
      console.error('Error swapping photo:', err);
      updateCopyState(index, { isRendering: false });
      toast({ title: 'Error al cambiar foto', variant: 'destructive' });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadTargetIndex === null || !selectedBrand) return;

    const index = uploadTargetIndex;
    setUploadTargetIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = '';

    updateCopyState(index, { isGenerating: true });

    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${selectedBrand}/uploaded/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('design-images')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('design-images')
        .getPublicUrl(path);

      const variantId = `upload-${Date.now()}`;
      const state = copyStates[index];
      const newVariant: GeneratedVariant = {
        id: variantId,
        imageUrl: urlData.publicUrl,
        prompt: 'Subida manual',
      };

      updateCopyState(index, {
        variants: [...state.variants, newVariant],
        selectedVariantId: variantId,
        isGenerating: false,
      });

      toast({ title: `Imagen subida para Copy ${index + 1}` });
    } catch (err) {
      console.error('Error subiendo imagen:', err);
      updateCopyState(index, { isGenerating: false });
      toast({ title: 'Error al subir imagen', variant: 'destructive' });
    }
  };

  // --- Select a variant ---
  const handleSelectVariant = (copyIndex: number, variantId: string) => {
    updateCopyState(copyIndex, {
      selectedVariantId: variantId,
      // Reset HTML/render when changing photo
      html: null,
      renderedPng: null,
    });
  };

  // --- Select stock image ---
  const handleSelectStock = (copyIndex: number, imageUrl: string, description: string) => {
    const state = copyStates[copyIndex];
    const variantId = `stock-${Date.now()}`;
    const newVariant: GeneratedVariant = {
      id: variantId,
      imageUrl,
      prompt: description,
    };

    updateCopyState(copyIndex, {
      variants: [...state.variants, newVariant],
      selectedVariantId: variantId,
      html: null,
      renderedPng: null,
    });
    setStockPickerIndex(null);
    toast({ title: `Imagen de stock seleccionada para Copy ${copyIndex + 1}` });
  };

  // --- Save piece to DB (always creates a new version) ---
  const savePieceToDb = async (index: number, html: string, pngDataUrl?: string) => {
    if (!currentCampaign) {
      return;
    }
    const idea = branch.copyIdeas[index];

    try {
      const saved = await savePieceMutation.mutateAsync({
        campaignId: currentCampaign.id,
        headline: idea.headline,
        subcopy: idea.subcopy,
        cta: idea.cta,
        htmlContent: html,
        pngUrl: pngDataUrl,
        status: pngDataUrl ? 'rendered' : 'html_ready',
      });

      const newDesign: SavedDesign = {
        id: saved.id,
        html,
        pngUrl: pngDataUrl || null,
        createdAt: saved.created_at,
      };

      // Use functional update to avoid stale closure — always read latest savedDesigns
      setCopyStates((prev) => {
        const currentState = prev[index];
        if (!currentState) return prev;
        return {
          ...prev,
          [index]: {
            ...currentState,
            savedDesigns: [...currentState.savedDesigns, newDesign],
            activeDesignId: saved.id,
          },
        };
      });

      // Also persist to design_library for the organized catalog (non-blocking)
      if (activeBusiness?.id) {
        saveToLibraryMutation.mutate({
          businessId: activeBusiness.id,
          commercialBranchId: (branch as any).commercial_branch_id || null,
          narrativeAngleId: (branch as any).narrative_angle_id || null,
          funnelStage: (branch as any).funnel_stage || null,
          headline: idea.headline,
          subcopy: idea.subcopy,
          cta: idea.cta,
          platformFormat: selectedFormat,
          templateId: templates[index] || defaultTemplateId,
          htmlContent: html,
          renderedUrl: pngDataUrl || null,
          campaignId: currentCampaign.id,
          pieceId: saved.id,
          status: pngDataUrl ? 'ready' : 'draft',
        });
      }
    } catch (err) {
      console.error('Error guardando pieza:', err);
    }
  };

  // --- Load a saved design version ---
  const handleLoadDesign = (copyIndex: number, design: SavedDesign) => {
    updateCopyState(copyIndex, {
      html: design.html,
      renderedPng: design.pngUrl,
      activeDesignId: design.id,
    });
    toast({ title: `Diseño cargado` });
  };

  // --- Delete a saved design version ---
  const handleDeleteDesign = async (copyIndex: number, designId: string) => {
    try {
      await deletePieceMutation.mutateAsync(designId);
      // Use functional update to avoid stale closure
      setCopyStates((prev) => {
        const currentState = prev[copyIndex];
        if (!currentState) return prev;
        const remaining = currentState.savedDesigns.filter((d: SavedDesign) => d.id !== designId);
        const wasActive = currentState.activeDesignId === designId;
        return {
          ...prev,
          [copyIndex]: {
            ...currentState,
            savedDesigns: remaining,
            ...(wasActive && remaining.length > 0
              ? { activeDesignId: remaining[remaining.length - 1].id, html: remaining[remaining.length - 1].html, renderedPng: remaining[remaining.length - 1].pngUrl }
              : wasActive ? { activeDesignId: null, html: null, renderedPng: null } : {}),
          },
        };
      });
      toast({ title: 'Versión eliminada' });
    } catch (err) {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };

  // --- Helper: replace the main photo URL in HTML (not the logo) ---
  const replacePhotoInHtml = (html: string, newImageUrl: string): string => {
    // Find all img tags with src
    const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/gi;
    let match;
    let mainImgSrc: string | null = null;
    
    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1];
      // Skip the logo (base64 or contains 'logo' or 'bola' in URL)
      if (src.startsWith('data:image') || src.includes('logo') || src.includes('bola') || src.includes('Logo') || src.includes('Bola')) {
        continue;
      }
      // This is the main photo
      mainImgSrc = src;
      break;
    }

    if (!mainImgSrc) return html;

    // Escape special regex chars in the URL
    const escaped = mainImgSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return html.replace(new RegExp(escaped, 'g'), newImageUrl);
  };

  // --- Swap photo from URL in existing HTML (stock or variant) ---
  const handleSwapPhotoFromUrl = async (copyIndex: number, newImageUrl: string) => {
    const state = copyStates[copyIndex];
    if (!state.html || !selectedBrand) return;

    updateCopyState(copyIndex, { isRendering: true });
    setSwapPickerIndex(null);

    try {
      const updatedHtml = replacePhotoInHtml(state.html, newImageUrl);

      const dataUrl = await renderHtmlToPng(updatedHtml, selectedBrand, PLATFORM_DIMENSIONS[selectedFormat].width, PLATFORM_DIMENSIONS[selectedFormat].height);

      updateCopyState(copyIndex, {
        html: updatedHtml,
        renderedPng: dataUrl,
        isRendering: false,
      });

      await savePieceToDb(copyIndex, updatedHtml, dataUrl);
      toast({ title: `Foto cambiada en pieza ${copyIndex + 1} — sin costo IA` });
    } catch (err) {
      console.error('Error swapping photo:', err);
      updateCopyState(copyIndex, { isRendering: false });
      toast({ title: 'Error al cambiar foto', variant: 'destructive' });
    }
  };

  // --- Batch Generate (hydrate multiple templates × platforms) ---
  const handleBatchGenerate = async (index: number) => {
    if (!selectedBrand) return;

    const idea = branch.copyIdeas[index];
    const imageUrl = getSelectedImageUrl(index);
    const batchTemplates = selectedTemplateIds[index] ?? [templates[index] || defaultTemplateId];
    // Use selectedFormats if explicitly set, otherwise fall back to just the current selectedFormat
    const batchPlatforms: PlatformFormat[] = selectedFormats[index] && selectedFormats[index].length > 0
      ? selectedFormats[index]
      : [selectedFormat];

    if (!imageUrl) {
      toast({ title: 'Selecciona o genera una imagen primero', variant: 'destructive' });
      return;
    }

    const dbDisclaimer = (activeBusiness as any)?.disclaimer ?? strategicConfig?.disclaimer;
    const disclaimer = dbDisclaimer
      || (selectedBrand === 'xending_capital'
        ? 'Xending Capital es marca comercial de Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación crediticia. Líneas hasta $500,000 USD. Plazos hasta 45 días. Disponible solo en México.'
        : 'Disponible solo para clientes en Estados Unidos. No válido en México.');

    updateCopyState(index, { isRendering: true });
    toast({ title: `Generando ${batchTemplates.length * batchPlatforms.length} piezas...` });

    const results: { template: string; platform: string; png: string }[] = [];
    let errorCount = 0;

    for (const tplId of batchTemplates) {
      const templateDef = resolveTemplate(tplId);

      for (const platform of batchPlatforms) {
        try {
          const dims = PLATFORM_DIMENSIONS[platform];
          let html: string;

          if (templateDef?.html) {
            // Static template — use fillTemplate with format overrides
            html = fillTemplate(templateDef.html, {
              headline: idea.headline,
              subcopy: idea.subcopy,
              cta: idea.cta,
              imageUrl: imageUrl || '',
              punchline: punchlines[index] || `Velocidad y confianza en tus pagos`,
              disclaimer,
              floating: floatingEnabled[index] && floatingFields[index]?.label
                ? `<div class="label">${floatingFields[index].label}</div><div class="value">${floatingFields[index].value || ''}</div><span class="trend"></span>`
                : undefined,
              promoterPhoto: promoterEnabled[index] ? (promoterPhotos[index] || undefined) : undefined,
            }, platform); // <-- pass platform for FORMAT_OVERRIDES
          } else {
            // AI Creativo — reuse existing HTML if available, apply format overrides
            const existingHtml = copyStates[index]?.html;
            if (existingHtml) {
              // Already have HTML from a previous IA Creativo generation
              // Apply FORMAT_OVERRIDES for the target platform
              if (platform !== 'instagram-story') {
                html = fillTemplate(existingHtml, {
                  headline: idea.headline,
                  subcopy: idea.subcopy,
                  cta: idea.cta,
                  imageUrl: imageUrl || '',
                  punchline: punchlines[index] || `Velocidad y confianza en tus pagos`,
                  disclaimer,
                }, platform);
              } else {
                html = existingHtml;
              }
            } else {
              // No existing HTML — generate with LLM once, then reuse
              html = await generatePieceHtml({
                imageUrl: imageUrl || '',
                headline: idea.headline,
                subcopy: idea.subcopy,
                cta: idea.cta,
                brand: selectedBrand,
                punchline: punchlines[index] || undefined,
                pieceNumber: index + 1,
                totalPieces: branch.copyIdeas.length,
              });
              // Store so next platforms reuse it
              updateCopyState(index, { html });
              // Apply format overrides for non-story
              if (platform !== 'instagram-story') {
                html = fillTemplate(html, {
                  headline: idea.headline,
                  subcopy: idea.subcopy,
                  cta: idea.cta,
                  imageUrl: imageUrl || '',
                  punchline: punchlines[index] || `Velocidad y confianza en tus pagos`,
                  disclaimer,
                }, platform);
              }
            }
          }

          const dataUrl = await renderHtmlToPng(html, selectedBrand, dims.width, dims.height);
          results.push({ template: tplId, platform, png: dataUrl });
        } catch (err) {
          console.error(`Error batch ${tplId}/${platform}:`, err);
          errorCount++;
        }
      }
    }

    // Update state with the first result as the main preview
    if (results.length > 0) {
      updateCopyState(index, {
        html: results[0].template === (templates[index] || defaultTemplateId) ? '' : '',
        renderedPng: results[0].png,
        isRendering: false,
      });

      // Save each piece to DB as a version (shows in "Versiones guardadas")
      for (const r of results) {
        // Build a minimal HTML for the saved piece (for re-editing later)
        const templateDef = resolveTemplate(r.template);
        if (templateDef?.html) {
          const html = fillTemplate(templateDef.html, {
            headline: idea.headline,
            subcopy: idea.subcopy,
            cta: idea.cta,
            imageUrl: imageUrl || '',
            punchline: punchlines[index] || `Velocidad y confianza en tus pagos`,
            disclaimer,
            floating: floatingEnabled[index] && floatingFields[index]?.label
              ? `<div class="label">${floatingFields[index].label}</div><div class="value">${floatingFields[index].value || ''}</div><span class="trend"></span>`
              : undefined,
            promoterPhoto: promoterEnabled[index] ? (promoterPhotos[index] || undefined) : undefined,
          }, r.platform as PlatformFormat);
          await savePieceToDb(index, html, r.png);
        }
      }

      toast({
        title: `✅ ${results.length} piezas generadas`,
        description: 'Guardadas abajo en versiones',
      });
    } else {
      updateCopyState(index, { isRendering: false });
      toast({ title: 'No se pudo generar ninguna pieza', variant: 'destructive' });
    }
  };

  // --- Preview (generate HTML + render) ---
  const handlePreview = async (index: number) => {
    if (!selectedBrand) return;
    const selectedTemplateId = templates[index] || defaultTemplateId;
    const templateDef = resolveTemplate(selectedTemplateId);
    const imageUrl = getSelectedImageUrl(index);

    // Check if image is needed
    if (!imageUrl && templateDef?.needsImage) {
      toast({ title: 'Selecciona o genera una imagen primero', variant: 'destructive' });
      return;
    }

    // Check if promoter photo is needed — warn but don't block
    if (promoterEnabled[index] && !promoterPhotos[index]) {
      toast({ title: '⚠️ No hay foto de promotor — se generará sin ella', description: 'Sube la foto del promotor para que aparezca en el diseño' });
    }

    const idea = branch.copyIdeas[index];
    // Use DB-driven disclaimer from business tenant or strategic config, fallback to hardcoded
    const dbDisclaimer = (activeBusiness as any)?.disclaimer ?? strategicConfig?.disclaimer;
    const disclaimer = dbDisclaimer
      || (selectedBrand === 'xending_capital'
        ? 'Xending Capital es marca comercial de Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación crediticia. Líneas hasta $500,000 USD. Plazos hasta 45 días. Disponible solo en México.'
        : 'Disponible solo para clientes en Estados Unidos. No válido en México.');

    // Get dimensions from selected format
    const dims = PLATFORM_DIMENSIONS[selectedFormat];

    updateCopyState(index, { isRendering: true });

    try {
      let html: string;

      if (templateDef?.html) {
        // Static template — instant, no API call
        html = fillTemplate(templateDef.html, {
          headline: idea.headline,
          subcopy: idea.subcopy,
          cta: idea.cta,
          imageUrl: imageUrl || '',
          punchline: punchlines[index] || (isBulletin ? '' : `Asesórate con <span class="accent-coral">Xending</span>`),
          disclaimer,
          floating: floatingEnabled[index] && floatingFields[index]?.label
            ? `<div class="label">${floatingFields[index].label}</div><div class="value">${floatingFields[index].value || ''}</div><span class="trend"></span>`
            : undefined,
          promoterPhoto: promoterEnabled[index] ? (promoterPhotos[index] || undefined) : undefined,
          // Bulletin-specific fields from editable state
          category: isBulletin ? (bulletinFields[index]?.category || bulletinMeta?.category || idea.cta).toUpperCase() : undefined,
          dataLabel: isBulletin ? (bulletinFields[index]?.dataLabel || bulletinMeta?.dataLabel || '') : undefined,
          dataValue: isBulletin ? (bulletinFields[index]?.dataValue || bulletinMeta?.dataValue || '') : undefined,
          source: isBulletin ? (bulletinFields[index]?.source || punchlines[index] || bulletinMeta?.source || '') : undefined,
          bgImageUrl: isBulletin ? (imageUrl || undefined) : undefined,
        }, selectedFormat);
      } else {
        // AI Creativo — Claude generates everything
        html = await generatePieceHtml({
          imageUrl: imageUrl || '',
          headline: idea.headline,
          subcopy: idea.subcopy,
          cta: idea.cta,
          brand: selectedBrand,
          punchline: punchlines[index] || undefined,
          pieceNumber: index + 1,
          totalPieces: branch.copyIdeas.length,
        });
      }

      const dataUrl = await renderHtmlToPng(html, selectedBrand, dims.width, dims.height);

      updateCopyState(index, {
        html,
        renderedPng: dataUrl,
        isRendering: false,
      });

      await savePieceToDb(index, html, dataUrl);
      toast({ title: `Pieza ${index + 1} generada y guardada` });
    } catch (err) {
      console.error('Error generando preview:', err);
      updateCopyState(index, { isRendering: false });
      toast({
        title: 'Error al generar preview',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  // --- Swap photo in existing HTML ---
  const handleSwapPhotoInHtml = async (copyIndex: number, variantId: string) => {
    const state = copyStates[copyIndex];
    if (!state.html || !selectedBrand) return;

    const variant = state.variants.find((v) => v.id === variantId);
    if (!variant) return;

    updateCopyState(copyIndex, { isRendering: true, selectedVariantId: variantId });

    try {
      // Replace the main photo src, but skip the logo (class="logo" or URL contains 'logo'/'bola')
      const updatedHtml = state.html.replace(
        /(<img[^>]*src=")(?!data:image)(https?:\/\/[^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)(")/gi,
        (match, prefix, url, suffix) => {
          // Skip logo images
          if (match.includes('class="logo"') || url.includes('logo') || url.includes('bola') || url.includes('Logo')) {
            return match;
          }
          return `${prefix}${variant.imageUrl}${suffix}`;
        }
      );

      const dataUrl = await renderHtmlToPng(updatedHtml, selectedBrand, PLATFORM_DIMENSIONS[selectedFormat].width, PLATFORM_DIMENSIONS[selectedFormat].height);

      updateCopyState(copyIndex, {
        html: updatedHtml,
        renderedPng: dataUrl,
        isRendering: false,
      });

      await savePieceToDb(copyIndex, updatedHtml, dataUrl);
      toast({ title: `Foto cambiada en pieza ${copyIndex + 1} — sin costo IA` });
    } catch (err) {
      console.error('Error swapping photo:', err);
      updateCopyState(copyIndex, { isRendering: false });
    }
  };

  // --- Download ---
  const handleDownload = (index: number) => {
    const state = copyStates[index];
    if (!state.renderedPng) return;

    const link = document.createElement('a');
    link.href = state.renderedPng;
    link.download = `${branchName.toLowerCase().replace(/\s+/g, '-')}-pieza-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: `Pieza ${index + 1} descargada` });
  };

  // --- Edit HTML ---
  const handleEditHtml = (index: number) => {
    const state = copyStates[index];
    if (!state.html) return;
    setEditHtml(state.html);
    setEditingIndex(index);
  };

  const handleSaveHtml = async () => {
    if (editingIndex === null || !selectedBrand) return;

    updateCopyState(editingIndex, { isRendering: true });

    try {
      const dataUrl = await renderHtmlToPng(editHtml, selectedBrand, PLATFORM_DIMENSIONS[selectedFormat].width, PLATFORM_DIMENSIONS[selectedFormat].height);
      updateCopyState(editingIndex, {
        html: editHtml,
        renderedPng: dataUrl,
        isRendering: false,
      });
      await savePieceToDb(editingIndex, editHtml, dataUrl);
      toast({ title: `Pieza ${editingIndex + 1} actualizada` });
    } catch (err) {
      console.error('Error re-renderizando:', err);
      updateCopyState(editingIndex, { isRendering: false });
    } finally {
      setEditingIndex(null);
    }
  };

  // Save HTML from the section editor or visual editor (receives HTML directly)
  const handleSaveHtmlFromEditor = async (newHtml: string, overrideIndex?: number) => {
    const targetIndex = overrideIndex ?? editingIndex;
    if (targetIndex === null || !selectedBrand) return;

    updateCopyState(targetIndex, { isRendering: true });

    try {
      const dataUrl = await renderHtmlToPng(newHtml, selectedBrand, PLATFORM_DIMENSIONS[selectedFormat].width, PLATFORM_DIMENSIONS[selectedFormat].height);
      updateCopyState(targetIndex, {
        html: newHtml,
        renderedPng: dataUrl,
        isRendering: false,
      });
      await savePieceToDb(targetIndex, newHtml, dataUrl);
      toast({ title: `Pieza ${targetIndex + 1} actualizada` });
    } catch (err) {
      console.error('Error re-renderizando:', err);
      updateCopyState(targetIndex, { isRendering: false });
    } finally {
      if (!overrideIndex) setEditingIndex(null);
    }
  };

  // --- Download All ---
  const handleDownloadAll = async () => {
    for (let i = 0; i < branch.copyIdeas.length; i++) {
      const state = copyStates[i];
      if (!state.renderedPng && getSelectedImageUrl(i)) {
        await handlePreview(i);
      }
      if (copyStates[i]?.renderedPng) {
        handleDownload(i);
      }
    }
  };

  // --- Brainstorm functions ---

  const handleBrainstormSend = () => {
    if (!brainstormInput.trim() || !selectedBrand || chatMutation.isPending) return;

    const userText = brainstormInput.trim();
    setBrainstormInput('');

    setBrainstormMessages((prev) => [...prev, { role: 'user', text: userText }]);

    const chatHistory: BranchChatMessage[] = [
      ...brainstormMessages.map((m) => ({
        role: m.role,
        content: m.role === 'assistant' && m.copys
          ? `${m.text}\n\n\`\`\`copys\n${JSON.stringify(m.copys)}\n\`\`\``
          : m.text,
      })),
      { role: 'user' as const, content: userText },
    ];

    chatMutation.mutate(
      {
        brand: selectedBrand,
        branchPrompt,
        branchName: branch.name,
        category: branch.category,
        existingCopys: branch.copyIdeas,
        messages: chatHistory,
      },
      {
        onSuccess: (data) => {
          setBrainstormMessages((prev) => [
            ...prev,
            { role: 'assistant', text: data.text, copys: data.copys || undefined, addedIndexes: new Set() },
          ]);
          setTimeout(() => brainstormChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        },
        onError: (error) => {
          setBrainstormMessages((prev) => [
            ...prev,
            { role: 'assistant', text: `Error: ${error.message}. Intenta de nuevo.` },
          ]);
        },
      }
    );
  };

  const handleBrainstormAddCopy = (msgIndex: number, copyIndex: number, copy: BranchChatCopy) => {
    branch.copyIdeas.push({ headline: copy.headline, subcopy: copy.subcopy, cta: copy.cta });
    if (copy.imagePrompt) {
      branch.imageDescriptions = [...(branch.imageDescriptions || []), copy.imagePrompt];
    }
    if (branch.branchPrompt !== branchPrompt) {
      branch.branchPrompt = branchPrompt;
    }

    const newIdx = branch.copyIdeas.length - 1;
    setCopyStates((prev) => ({
      ...prev,
      [newIdx]: {
        variants: [],
        selectedVariantId: null,
        prompt: copy.imagePrompt || branch.imageDescriptions?.[0] || '',
        isGenerating: false,
        html: null,
        renderedPng: null,
        savedDesigns: [],
        activeDesignId: null,
        isRendering: false,
      },
    }));

    setBrainstormMessages((prev) =>
      prev.map((m, i) => {
        if (i !== msgIndex) return m;
        const newAdded = new Set(m.addedIndexes);
        newAdded.add(copyIndex);
        return { ...m, addedIndexes: newAdded };
      })
    );

    setCopyStates((prev) => ({ ...prev }));
    immediateSave(branch, getWorkState());
    toast({ title: `Copy "${copy.headline.slice(0, 30)}..." agregado` });
  };

  const handleSaveBranchPrompt = () => {
    branch.branchPrompt = editPromptValue.trim();
    setIsEditingPrompt(false);
    immediateSave(branch, getWorkState());
    toast({ title: 'Prompt de objetivo actualizado' });
  };

  // --- Visual Design Editor ---
  if (visualEditingIndex !== null) {
    const visualState = copyStates[visualEditingIndex];
    if (visualState?.html) {
      return (
        <VisualDesignEditor
          html={visualState.html}
          pieceIndex={visualEditingIndex}
          onCancel={() => setVisualEditingIndex(null)}
          onSave={(newHtml) => {
            handleSaveHtmlFromEditor(newHtml, visualEditingIndex);
            setVisualEditingIndex(null);
          }}
        />
      );
    }
  }

  // --- HTML Editor Modal ---
  if (editingIndex !== null) {
    return (
      <HtmlSectionEditor
        html={editHtml}
        pieceIndex={editingIndex}
        onCancel={() => setEditingIndex(null)}
        onSave={(newHtml) => {
          setEditHtml(newHtml);
          handleSaveHtmlFromEditor(newHtml);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
      <input ref={swapFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleSwapFileSelected} />
      <input ref={promoterPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file || promoterPhotoTargetIndex === null || !selectedBrand) return;
        const index = promoterPhotoTargetIndex;
        setPromoterPhotoTargetIndex(null);
        if (promoterPhotoInputRef.current) promoterPhotoInputRef.current.value = '';
        try {
          const ext = file.name.split('.').pop() || 'jpg';
          const path = `${selectedBrand}/promoter-photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('design-images')
            .upload(path, file, { contentType: file.type });
          if (uploadError) throw uploadError;
          const { data: urlData } = supabase.storage.from('design-images').getPublicUrl(path);
          setPromoterPhotos((prev) => ({ ...prev, [index]: urlData.publicUrl }));
          toast({ title: `Foto de promotor subida para Copy ${index + 1}` });
        } catch (err) {
          console.error('Error subiendo foto de promotor:', err);
          toast({ title: 'Error al subir foto de promotor', variant: 'destructive' });
        }
      }} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{resolvedBranchName}</h2>
          <p className="text-sm text-muted-foreground">
            {branch.copyIdeas.length} piezas. Genera imágenes, previsualiza y descarga todo aquí.
            {campaignId ? (
              <span className="text-green-600 ml-2">● Auto-guardado activo (ID: {campaignId.slice(0,8)}...)</span>
            ) : (
              <span className="text-red-500 ml-2">● Sin campaña — los cambios NO se guardan</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={brainstormOpen ? 'default' : 'outline'}
            onClick={() => {
              setBrainstormOpen(!brainstormOpen);
              if (!brainstormOpen) setTimeout(() => brainstormInputRef.current?.focus(), 100);
            }}
            className={brainstormOpen ? 'bg-[#2ED4C7] hover:bg-[#2ED4C7]/90 text-[#0F1419]' : ''}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Brainstorm
          </Button>
          <Button onClick={handleDownloadAll}>
            <Download className="h-4 w-4 mr-2" /> Descargar Todas
          </Button>
        </div>
      </div>

      {/* Brainstorm Panel */}
      {brainstormOpen && (
        <Card className="border-[#2ED4C7]/30 bg-[#2ED4C7]/5">
          <CardContent className="p-4 space-y-3">
            {/* Branch Prompt (editable) */}
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-[#FF7A4A] mt-1 shrink-0" />
              {isEditingPrompt ? (
                <div className="flex-1 space-y-2">
                  <Textarea
                    value={editPromptValue}
                    onChange={(e) => setEditPromptValue(e.target.value)}
                    className="text-sm min-h-[80px] bg-background"
                    placeholder="Define el objetivo de esta rama..."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveBranchPrompt}>
                      <Check className="h-3 w-3 mr-1" /> Guardar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditingPrompt(false)}>
                      <X className="h-3 w-3 mr-1" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex-1 group cursor-pointer"
                  onClick={() => { setEditPromptValue(branchPrompt); setIsEditingPrompt(true); }}
                >
                  <p className="text-xs font-medium text-muted-foreground mb-1">Prompt de objetivo (click para editar)</p>
                  <p className="text-sm text-foreground">{branchPrompt}</p>
                  <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </div>
              )}
            </div>

            {/* Chat messages */}
            <div className="max-h-[350px] overflow-y-auto space-y-3 py-2">
              {brainstormMessages.length === 0 && (
                <div className="text-center py-4 text-muted-foreground space-y-2">
                  <p className="text-xs">Pide copys, variaciones, o conversa sobre la estrategia. Los copys se agregan directo a la rama.</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {['Dame 3 copys directos', 'Versiones más emocionales', 'Copys cortos para Story', 'Variaciones con datos duros'].map((qp) => (
                      <button
                        key={qp}
                        type="button"
                        className="text-[11px] px-2.5 py-1 rounded-full border border-dashed hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/10 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => { setBrainstormInput(qp); brainstormInputRef.current?.focus(); }}
                      >
                        {qp}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {brainstormMessages.map((msg, msgIdx) => (
                <div key={msgIdx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] space-y-2`}>
                    {msg.text && (
                      <div className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-[#0F1419] text-white'
                          : 'bg-background text-foreground border'
                      }`}>
                        {msg.text}
                      </div>
                    )}
                    {msg.copys && msg.copys.length > 0 && (
                      <div className="space-y-1.5">
                        {msg.copys.map((copy, copyIdx) => {
                          const isAdded = msg.addedIndexes?.has(copyIdx);
                          return (
                            <div key={copyIdx} className={`rounded-lg border p-3 space-y-1 bg-background ${isAdded ? 'border-green-500/50' : ''}`}>
                              <p className="text-sm font-semibold">{copy.headline}</p>
                              <p className="text-xs text-muted-foreground">{copy.subcopy}</p>
                              <p className="text-xs font-medium text-[#2ED4C7]">{copy.cta}</p>
                              {copy.imagePrompt && (
                                <p className="text-[10px] text-muted-foreground/60 italic">📷 {copy.imagePrompt.slice(0, 80)}...</p>
                              )}
                              <div className="pt-1">
                                {isAdded ? (
                                  <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-[10px]">
                                    <Check className="h-2.5 w-2.5 mr-0.5" /> Agregado
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-[10px] h-6 px-2"
                                    onClick={() => handleBrainstormAddCopy(msgIdx, copyIdx, copy)}
                                  >
                                    + Agregar a rama
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 bg-background border rounded-lg px-3 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2ED4C7]" />
                    <span className="text-xs text-muted-foreground">Pensando...</span>
                  </div>
                </div>
              )}
              <div ref={brainstormChatEndRef} />
            </div>

            {/* Chat input */}
            <div className="flex items-center gap-2">
              <Input
                ref={brainstormInputRef}
                value={brainstormInput}
                onChange={(e) => setBrainstormInput(e.target.value)}
                placeholder="Ej: Dame 3 versiones más agresivas para Instagram..."
                disabled={chatMutation.isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleBrainstormSend();
                  }
                }}
                className="bg-background"
              />
              <Button
                size="icon"
                onClick={handleBrainstormSend}
                disabled={chatMutation.isPending || !brainstormInput.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Copy cards */}
      {branch.copyIdeas.map((idea, index) => {
        const state = copyStates[index];
        if (!state) return null;
        const isExpanded = expandedCopy === index;
        const selectedUrl = getSelectedImageUrl(index);

        return (
          <Card key={index} className={state.renderedPng ? 'border-green-500/40' : ''}>
            <CardContent className="p-0">
              {/* Header — always visible */}
              <button
                type="button"
                className="w-full p-4 flex items-start justify-between text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedCopy(isExpanded ? null : index)}
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Copy {index + 1}</Badge>
                    {state.renderedPng && (
                      <Badge className="bg-green-600 text-white border-0 text-xs">
                        <Check className="h-3 w-3 mr-0.5" /> Lista
                      </Badge>
                    )}
                    {state.variants.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {state.variants.length} imagen{state.variants.length !== 1 ? 'es' : ''}
                      </Badge>
                    )}
                    {(
                      <button
                        type="button"
                        className="text-muted-foreground/40 hover:text-red-500 transition-colors p-0.5"
                        title="Eliminar este copy"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`¿Eliminar Copy ${index + 1}: "${idea.headline}"?`)) {
                            branch.copyIdeas.splice(index, 1);
                            setCopyStates((prev) => {
                              const updated: Record<number, CopyState> = {};
                              branch.copyIdeas.forEach((_, i) => {
                                updated[i] = prev[i < index ? i : i + 1] || {
                                  variants: [], selectedVariantId: null,
                                  prompt: '', isGenerating: false, html: null,
                                  renderedPng: null, savedDesigns: [], activeDesignId: null, isRendering: false,
                                };
                              });
                              return updated;
                            });
                            if (expandedCopy === index) setExpandedCopy(null);
                            else if (expandedCopy !== null && expandedCopy > index) setExpandedCopy(expandedCopy - 1);
                            immediateSave(branch, getWorkState());
                            toast({ title: `Copy ${index + 1} eliminado` });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm">{idea.headline}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-1">{idea.subcopy}</p>
                  <p className="text-xs font-medium text-[#2ED4C7]">{idea.cta}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {selectedUrl && (
                    <img src={selectedUrl} alt="" className="h-12 w-12 rounded object-cover" />
                  )}
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t">
                  {/* Editable copy fields */}
                  <div className="space-y-2 pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Editar copy</span>
                    </div>
                    <input
                      type="text"
                      value={idea.headline}
                      onChange={(e) => {
                        branch.copyIdeas[index] = { ...branch.copyIdeas[index], headline: e.target.value };
                        setCopyStates((prev) => ({ ...prev }));
                        debouncedSave(branch, getWorkState());
                      }}
                      className="w-full text-sm font-semibold px-3 py-1.5 rounded-md border bg-background"
                      placeholder="Headline"
                    />
                    <input
                      type="text"
                      value={idea.subcopy}
                      onChange={(e) => {
                        branch.copyIdeas[index] = { ...branch.copyIdeas[index], subcopy: e.target.value };
                        setCopyStates((prev) => ({ ...prev }));
                        debouncedSave(branch, getWorkState());
                      }}
                      className="w-full text-xs px-3 py-1.5 rounded-md border bg-background text-muted-foreground"
                      placeholder="Subcopy"
                    />
                    <input
                      type="text"
                      value={idea.cta}
                      onChange={(e) => {
                        branch.copyIdeas[index] = { ...branch.copyIdeas[index], cta: e.target.value };
                        setCopyStates((prev) => ({ ...prev }));
                        debouncedSave(branch, getWorkState());
                      }}
                      className="w-full text-xs font-medium px-3 py-1.5 rounded-md border bg-background text-[#2ED4C7]"
                      placeholder="CTA"
                    />
                    {/* CTA quick-select chips — hidden for bulletins */}
                    {!isBulletin && brandCtas.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {brandCtas.map((ctaOption) => (
                          <button
                            key={ctaOption}
                            type="button"
                            onClick={() => {
                              branch.copyIdeas[index] = { ...branch.copyIdeas[index], cta: ctaOption };
                              setCopyStates((prev) => ({ ...prev }));
                              debouncedSave(branch, getWorkState());
                            }}
                            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                              idea.cta === ctaOption
                                ? 'border-[#2ED4C7] bg-[#2ED4C7]/10 text-[#2ED4C7]'
                                : 'border-dashed hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {ctaOption}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Save copy button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-600 border-green-600/30 hover:bg-green-600/5"
                      onClick={() => {
                        immediateSave(branch, getWorkState());
                        toast({ title: `Copy ${index + 1} guardado` });
                      }}
                    >
                      <Check className="h-3 w-3 mr-1" /> Guardar copy
                    </Button>
                  </div>

                  {/* Copy ideas — hidden for bulletins */}
                  {!isBulletin && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-[#2ED4C7]"
                      onClick={(e) => { e.stopPropagation(); handleSuggestCopy(index); }}
                      disabled={suggestingCopyIndex === index}
                    >
                      {suggestingCopyIndex === index ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      Generar variantes de copy
                    </Button>
                  </div>
                  )}

                  {/* Copy suggestions */}
                  {copySuggestions[index] && copySuggestions[index].length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Variantes de copy:</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-xs"
                          onClick={() => {
                            copySuggestions[index].forEach((sug) => {
                              branch.copyIdeas.push(sug);
                            });
                            // Add new copy states for the new ideas
                            setCopyStates((prev) => {
                              const updated = { ...prev };
                              const startIdx = branch.copyIdeas.length - copySuggestions[index].length;
                              copySuggestions[index].forEach((_, sIdx) => {
                                const newIdx = startIdx + sIdx;
                                updated[newIdx] = {
                                  variants: [],
                                  selectedVariantId: null,
                                  prompt: branch.imageDescriptions?.[0] || '',
                                  isGenerating: false,
                                  html: null,
                                  renderedPng: null,
                                  savedDesigns: [],
                                  activeDesignId: null,
                                  isRendering: false,
                                };
                              });
                              return updated;
                            });
                            setCopySuggestions((prev) => ({ ...prev, [index]: [] }));
                            toast({ title: `${copySuggestions[index].length} copys agregados a la rama` });
                            // Immediate save to DB
                            setTimeout(() => immediateSave(branch, getWorkState()), 200);
                          }}
                        >
                          Guardar todas ({copySuggestions[index].length})
                        </Button>
                      </div>
                      {copySuggestions[index].map((sug, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => handleApplyCopy(index, sug)}
                          className="w-full text-left p-3 rounded-lg border border-dashed hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5 transition-colors space-y-1"
                        >
                          <p className="text-sm font-semibold text-foreground">{sug.headline}</p>
                          <p className="text-xs text-muted-foreground">{sug.subcopy}</p>
                          <p className="text-xs font-medium text-[#FF7A4A]">{sug.cta}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Image prompt */}
                  <div className={`space-y-2 pt-4 ${isBulletin ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Prompt de imagen {isBulletin && <span className="text-[#2ED4C7]">(opcional)</span>}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-[#FF7A4A] hover:text-[#FF7A4A]"
                        onClick={() => handleSuggestIdeas(index)}
                        disabled={suggestingIndex === index}
                      >
                        {suggestingIndex === index ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        Ideas
                      </Button>
                    </div>

                    {/* Prompt suggestions */}
                    {suggestions[index] && suggestions[index].length > 0 && (
                      <div className="space-y-1.5">
                        {suggestions[index].map((suggestion, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => {
                              updateCopyState(index, { prompt: suggestion });
                              // Don't clear suggestions — keep them available
                            }}
                            className="w-full text-left text-xs p-2 rounded-md border border-dashed hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5 transition-colors text-muted-foreground hover:text-foreground"
                          >
                            💡 {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                    <Textarea
                      value={state.prompt}
                      onChange={(e) => updateCopyState(index, { prompt: e.target.value })}
                      rows={2}
                      className="text-sm"
                      placeholder="Describe la imagen que quieres generar..."
                      disabled={state.isGenerating}
                    />
                    {/* Image style selector */}
                    <div className="flex gap-1.5">
                      {[
                        { id: 'photo', label: '📷 Foto', desc: 'Foto realista' },
                        { id: 'infographic', label: '📊 Infografía', desc: 'Diagramas, mapas' },
                        { id: 'clay3d', label: '🧊 3D Clay', desc: 'Objetos 3D claymorphism' },
                        { id: 'financial', label: '💰 Financiero', desc: 'Billetes, gráficas' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setImageStyles((prev) => ({ ...prev, [index]: s.id }));
                            // Use imageSuggestion as base, adapt prefix per style
                            const base = idea.imageSuggestion || `${idea.headline}. ${idea.subcopy}`;
                            let suggested = '';
                            if (s.id === 'photo') {
                              suggested = base;
                            } else if (s.id === 'infographic') {
                              suggested = `Infografía de ${base}`;
                            } else if (s.id === 'clay3d') {
                              suggested = `Infografía 3D de ${base}`;
                            } else if (s.id === 'financial') {
                              suggested = `Composición financiera: ${base}`;
                            }
                            if (suggested) updateCopyState(index, { prompt: suggested });
                          }}
                          className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                            (imageStyles[index] || 'photo') === s.id
                              ? 'border-[#FF7A4A] bg-[#FF7A4A]/10 text-[#FF7A4A] font-medium'
                              : 'border-dashed hover:border-[#FF7A4A] hover:bg-[#FF7A4A]/5 text-muted-foreground'
                          }`}
                          title={s.desc}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleGenerateImage(index)}
                        disabled={state.isGenerating || !state.prompt.trim()}
                      >
                        {state.isGenerating ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5 mr-1" />
                        )}
                        {state.isGenerating ? 'Generando...' : 'Generar imagen'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleUploadClick(index)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Subir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStockPickerIndex(stockPickerIndex === index ? null : index)}
                      >
                        <ImageIcon className="h-3.5 w-3.5 mr-1" /> Stock
                      </Button>
                    </div>

                  {/* Stock image picker */}
                  {stockPickerIndex === index && stockImages && stockImages.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                      <span className="text-xs font-medium text-muted-foreground">
                        Biblioteca de imágenes ({stockImages.length}):
                      </span>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto">
                        {stockImages.map((img: any) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => handleSelectStock(index, img.image_url, img.image_intent || '')}
                            className="relative rounded-lg overflow-hidden border hover:border-[#2ED4C7] transition-colors"
                          >
                            <img
                              src={img.image_url}
                              alt={img.image_intent || ''}
                              className="h-20 w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {stockPickerIndex === index && (!stockImages || stockImages.length === 0) && (
                    <p className="text-xs text-muted-foreground p-2">
                      No hay imágenes en tu biblioteca. Genera una primero.
                    </p>
                  )}
                  </div>

                  {/* Loading skeleton */}
                  {state.isGenerating && (
                    <div className="space-y-2">
                      <Skeleton className="w-full h-48 rounded-lg" />
                      <p className="text-xs text-muted-foreground">Generando con GPT Image 2...</p>
                    </div>
                  )}

                  {/* Image variants */}
                  {state.variants.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Imágenes ({state.variants.length}):
                      </span>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {state.variants.map((variant) => {
                          const isSelected = state.selectedVariantId === variant.id;
                          return (
                            <button
                              key={variant.id}
                              type="button"
                              onClick={() => {
                                if (state.html && !isSelected) {
                                  // If HTML exists, swap photo without regenerating
                                  handleSwapPhotoInHtml(index, variant.id);
                                } else {
                                  handleSelectVariant(index, variant.id);
                                }
                              }}
                              className={`relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? 'border-[#2ED4C7] ring-2 ring-[#2ED4C7]/30'
                                  : 'border-transparent hover:border-muted-foreground/30'
                              }`}
                            >
                              <img
                                src={variant.imageUrl}
                                alt={variant.prompt}
                                className="h-32 w-32 object-cover"
                              />
                              {isSelected && (
                                <div className="absolute top-1 right-1 bg-[#2ED4C7] rounded-full p-0.5">
                                  <Check className="h-3 w-3 text-white" />
                                </div>
                              )}
                              <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate">
                                {variant.prompt.slice(0, 30)}...
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Format / platform selector — MULTI-SELECT */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Formato de plataforma</span>
                      <button
                        type="button"
                        onClick={() => {
                          const allFmts = Object.keys(PLATFORM_DIMENSIONS) as PlatformFormat[];
                          setSelectedFormats((prev) => {
                            const current = prev[index] ?? [selectedFormat];
                            return { ...prev, [index]: current.length === allFmts.length ? [selectedFormat] : allFmts };
                          });
                        }}
                        className="text-[10px] text-[#2ED4C7] hover:underline"
                      >
                        {(selectedFormats[index] ?? [selectedFormat]).length === Object.keys(PLATFORM_DIMENSIONS).length ? 'Solo activa' : 'Todas'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.entries(PLATFORM_DIMENSIONS) as [PlatformFormat, { width: number; height: number }][]).map(([fmt, d]) => {
                        const currentFormats = selectedFormats[index] ?? [selectedFormat];
                        const isActive = currentFormats.includes(fmt);
                        const isPrimary = selectedFormat === fmt;
                        return (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => {
                              setSelectedFormats((prev) => {
                                const current = prev[index] ?? [selectedFormat];
                                if (current.includes(fmt)) {
                                  // Deselect — but keep at least 1
                                  if (current.length > 1) {
                                    const updated = current.filter((f) => f !== fmt);
                                    // If we removed the primary, switch primary to first remaining
                                    if (selectedFormat === fmt) {
                                      setSelectedFormat(updated[0]);
                                    }
                                    return { ...prev, [index]: updated };
                                  }
                                  return prev; // Can't deselect the last one
                                } else {
                                  // Select
                                  return { ...prev, [index]: [...current, fmt] };
                                }
                              });
                              // Set as primary for preview
                              if (!selectedFormats[index]?.includes(fmt)) {
                                setSelectedFormat(fmt);
                              }
                            }}
                            className={`text-[11px] px-2.5 py-1.5 rounded-lg border transition-all ${
                              isActive
                                ? 'border-[#2ED4C7] bg-[#2ED4C7]/10 text-[#2ED4C7] font-medium'
                                : 'border-dashed hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5 text-muted-foreground'
                            }`}
                          >
                            {isActive && '✓ '}{fmt} ({d.width}×{d.height})
                          </button>
                        );
                      })}
                    </div>
                    {(selectedFormats[index] ?? [selectedFormat]).length > 1 && (
                      <p className="text-[10px] text-muted-foreground">
                        {(selectedFormats[index] ?? [selectedFormat]).length} plataformas seleccionadas
                      </p>
                    )}
                  </div>

                  {/* Template selector — MULTI-SELECT */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Template de diseño</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTemplateIds((prev) => {
                            const current = prev[index] ?? [templates[index] || defaultTemplateId];
                            return { ...prev, [index]: current.length === availableTemplates.length ? [templates[index] || defaultTemplateId] : availableTemplates.map((t) => t.id) };
                          });
                        }}
                        className="text-[10px] text-[#2ED4C7] hover:underline"
                      >
                        {(selectedTemplateIds[index] ?? [templates[index] || defaultTemplateId]).length === availableTemplates.length ? 'Solo activo' : 'Todos'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {availableTemplates.map((t) => {
                        const currentTemplates = selectedTemplateIds[index] ?? [templates[index] || defaultTemplateId];
                        const isActive = currentTemplates.includes(t.id);
                        const isPrimary = (templates[index] || defaultTemplateId) === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setSelectedTemplateIds((prev) => {
                                const current = prev[index] ?? [templates[index] || defaultTemplateId];
                                if (current.includes(t.id)) {
                                  // Deselect — but keep at least 1
                                  if (current.length > 1) {
                                    const updated = current.filter((id) => id !== t.id);
                                    // If we removed the primary, switch primary
                                    if ((templates[index] || defaultTemplateId) === t.id) {
                                      setTemplates((prev) => ({ ...prev, [index]: updated[0] }));
                                    }
                                    return { ...prev, [index]: updated };
                                  }
                                  return prev; // Can't deselect the last one
                                } else {
                                  // Select
                                  return { ...prev, [index]: [...current, t.id] };
                                }
                              });
                              // Set as primary for individual generation
                              if (!selectedTemplateIds[index]?.includes(t.id)) {
                                setTemplates((prev) => ({ ...prev, [index]: t.id }));
                              }
                            }}
                            className={`text-left p-2.5 rounded-lg border transition-all ${
                              isActive
                                ? 'border-[#2ED4C7] bg-[#2ED4C7]/10 ring-1 ring-[#2ED4C7]/30'
                                : 'border-dashed hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5'
                            }`}
                          >
                            <p className="text-xs font-semibold">
                              {isActive && '✓ '}{t.emoji} {t.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{t.description}</p>
                          </button>
                        );
                      })}
                    </div>
                    {(selectedTemplateIds[index] ?? [templates[index] || defaultTemplateId]).length > 1 && (
                      <p className="text-[10px] text-muted-foreground">
                        {(selectedTemplateIds[index] ?? [templates[index] || defaultTemplateId]).length} templates seleccionados
                      </p>
                    )}

                    {/* Custom Templates (Design Studio) */}
                    {!isBulletin && customTemplates.length > 0 && (
                      <div className="pt-2 border-t border-border/50 space-y-1.5">
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                          ⭐ Mis Templates
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {customTemplates.map((ct) => {
                            const customId = `custom:${ct.id}`;
                            const currentTemplates = selectedTemplateIds[index] ?? [templates[index] || defaultTemplateId];
                            const isActive = currentTemplates.includes(customId);
                            return (
                              <button
                                key={ct.id}
                                type="button"
                                onClick={() => {
                                  setSelectedTemplateIds((prev) => {
                                    const current = prev[index] ?? [templates[index] || defaultTemplateId];
                                    if (current.includes(customId)) {
                                      if (current.length > 1) {
                                        const updated = current.filter((id) => id !== customId);
                                        if ((templates[index] || defaultTemplateId) === customId) {
                                          setTemplates((prev) => ({ ...prev, [index]: updated[0] }));
                                        }
                                        return { ...prev, [index]: updated };
                                      }
                                      return prev;
                                    } else {
                                      return { ...prev, [index]: [...current, customId] };
                                    }
                                  });
                                  if (!selectedTemplateIds[index]?.includes(customId)) {
                                    setTemplates((prev) => ({ ...prev, [index]: customId }));
                                  }
                                }}
                                className={`text-left p-2.5 rounded-lg border transition-all ${
                                  isActive
                                    ? 'border-[#FF7A4A] bg-[#FF7A4A]/10 ring-1 ring-[#FF7A4A]/30'
                                    : 'border-dashed hover:border-[#FF7A4A] hover:bg-[#FF7A4A]/5'
                                }`}
                              >
                                <p className="text-xs font-semibold flex items-center gap-1">
                                  {isActive && '✓ '}⭐ {ct.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground">{ct.platform.replace('-', ' ')}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Promoter toggle + photo upload (available for any template) */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!promoterEnabled[index]}
                        onChange={(e) => setPromoterEnabled((prev) => ({ ...prev, [index]: e.target.checked }))}
                        className="rounded border-gray-300 text-[#2ED4C7] focus:ring-[#2ED4C7]"
                      />
                      <span className="text-xs font-semibold text-foreground">👤 Incluir promotor</span>
                    </label>
                    {promoterEnabled[index] && (
                    <div className={`space-y-2 p-3 rounded-lg border-2 ${promoterPhotos[index] ? 'border-green-500/30 bg-green-50/50' : 'border-dashed border-[#FF7A4A]/50 bg-[#FF7A4A]/5'}`}>
                      <span className="text-xs font-semibold text-foreground">
                        📷 Foto del promotor {!promoterPhotos[index] && <span className="text-[#FF7A4A]">(requerida)</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        {promoterPhotos[index] ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={promoterPhotos[index]}
                              alt="Promotor"
                              className="h-16 w-16 rounded-full object-cover border-3 border-[#2ED4C7] shadow-md"
                            />
                            <div className="flex flex-col gap-1">
                              <span className="text-sm font-medium text-green-600">✓ Foto cargada</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  setPromoterPhotoTargetIndex(index);
                                  promoterPhotoInputRef.current?.click();
                                }}
                              >
                                Cambiar foto
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-[#FF7A4A] hover:bg-[#E85A2C] text-white"
                            onClick={() => {
                              setPromoterPhotoTargetIndex(index);
                              promoterPhotoInputRef.current?.click();
                            }}
                          >
                            <Upload className="h-3.5 w-3.5 mr-1" /> Subir foto del promotor
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        La foto del promotor se monta sobre el diseño en la posición predefinida para cada formato.
                      </p>
                    </div>
                    )}
                  </div>

                  {/* Floating badge toggle */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!floatingEnabled[index]}
                        onChange={(e) => setFloatingEnabled((prev) => ({ ...prev, [index]: e.target.checked }))}
                        className="rounded border-gray-300 text-[#2ED4C7] focus:ring-[#2ED4C7]"
                      />
                      <span className="text-xs font-semibold text-foreground">🏷️ Mostrar badge flotante</span>
                    </label>
                    {floatingEnabled[index] && (
                      <div className="space-y-2 p-3 rounded-lg border border-[#2ED4C7]/30 bg-[#2ED4C7]/5">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-muted-foreground">Etiqueta</span>
                            <input
                              className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-background"
                              placeholder="Ej: TIPO FIJO"
                              value={floatingFields[index]?.label || ''}
                              onChange={(e) => updateFloatingField(index, 'label', e.target.value)}
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground">Valor</span>
                            <input
                              className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-background"
                              placeholder="Ej: $18.50 MXN"
                              value={floatingFields[index]?.value || ''}
                              onChange={(e) => updateFloatingField(index, 'value', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bulletin-specific editable fields */}
                  {isBulletin && (
                    <div className="space-y-3 p-3 rounded-lg border border-[#FF7A4A]/20 bg-[#FF7A4A]/5">
                      <span className="text-xs font-semibold text-[#FF7A4A]">📰 Datos del boletín</span>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Dato destacado</label>
                          <input
                            type="text"
                            className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-background"
                            placeholder="Ej: 4.25%–4.50%"
                            value={bulletinFields[index]?.dataValue || ''}
                            onChange={(e) => updateBulletinField(index, 'dataValue', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Etiqueta</label>
                          <input
                            type="text"
                            className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-background"
                            placeholder="Ej: Tasa de referencia"
                            value={bulletinFields[index]?.dataLabel || ''}
                            onChange={(e) => updateBulletinField(index, 'dataLabel', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Categoría</label>
                        <input
                          type="text"
                          className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-background"
                          placeholder="Ej: Decisión de Tasas"
                          value={bulletinFields[index]?.category || ''}
                          onChange={(e) => updateBulletinField(index, 'category', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Fuente</label>
                        <input
                          type="text"
                          className="w-full px-2.5 py-1.5 text-sm rounded-md border bg-background"
                          placeholder="Ej: Federal Reserve · 29 abril 2026"
                          value={bulletinFields[index]?.source || ''}
                          onChange={(e) => updateBulletinField(index, 'source', e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        🖼️ Si seleccionas una imagen arriba, se usará como fondo sutil detrás de la card.
                      </p>
                    </div>
                  )}

                  {/* Punchline (footer phrase) — hide for bulletins since source is above */}
                  {!isBulletin && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Frase del footer
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-[#FF7A4A]"
                        onClick={() => handleSuggestPunchlines(index)}
                        disabled={suggestingPunchlineIndex === index}
                      >
                        {suggestingPunchlineIndex === index ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        Ideas
                      </Button>
                    </div>
                    <input
                      type="text"
                      value={punchlines[index] || ''}
                      onChange={(e) => {
                        setPunchlines((prev) => ({ ...prev, [index]: e.target.value }));
                        debouncedSave(branch, getWorkState());
                      }}
                      placeholder="Ej: Tu cosecha no puede esperar, tu dinero tampoco"
                      className="w-full text-sm px-3 py-2 rounded-md border bg-background"
                    />
                    {/* Preset punchline chips */}
                    {brandPunchlines.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {brandPunchlines.map((pl) => (
                          <button
                            key={pl}
                            type="button"
                            onClick={() => {
                              setPunchlines((prev) => ({ ...prev, [index]: pl }));
                              debouncedSave(branch, getWorkState());
                            }}
                            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                              punchlines[index] === pl
                                ? 'border-[#FF7A4A] bg-[#FF7A4A]/10 text-[#FF7A4A]'
                                : 'border-dashed hover:border-[#FF7A4A] hover:bg-[#FF7A4A]/5 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {pl}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* AI-generated punchline suggestions */}
                    {punchlineSuggestions[index] && punchlineSuggestions[index].length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {punchlineSuggestions[index].map((pl, plIdx) => (
                          <button
                            key={plIdx}
                            type="button"
                            onClick={() => {
                              setPunchlines((prev) => ({ ...prev, [index]: pl.replace(/\*/g, '') }));
                              debouncedSave(branch, getWorkState());
                            }}
                            className="text-xs px-2.5 py-1.5 rounded-full border border-dashed hover:border-[#2ED4C7] hover:bg-[#2ED4C7]/5 transition-colors text-muted-foreground hover:text-foreground"
                          >
                            💡 {pl}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Preview / rendered piece */}
                  {state.renderedPng && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">Diseño final:</span>
                      <img
                        src={state.renderedPng}
                        alt="Preview"
                        className="w-full max-w-sm rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setLightboxImage(state.renderedPng)}
                        title="Click para ver en grande"
                      />
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePreview(index)}
                      disabled={(!selectedUrl && !isBulletin) || state.isRendering}
                    >
                      {state.isRendering ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 mr-1" />
                      )}
                      {state.renderedPng ? 'Regenerar diseño' : 'Preview diseño'}
                    </Button>

                    {/* Batch generate button — shows when multiple templates or platforms selected */}
                    {(() => {
                      const fmtCount = (selectedFormats[index] ?? [selectedFormat]).length;
                      const tplCount = (selectedTemplateIds[index] ?? [templates[index] || defaultTemplateId]).length;
                      const totalBatch = fmtCount * tplCount;
                      if (totalBatch > 1) {
                        return (
                          <Button
                            size="sm"
                            onClick={() => handleBatchGenerate(index)}
                            disabled={(!selectedUrl && !isBulletin) || state.isRendering}
                            className="bg-[#0F1419] hover:bg-[#0F1419]/90 text-white"
                          >
                            <Zap className="h-3.5 w-3.5 mr-1" />
                            Generar todas ({totalBatch})
                          </Button>
                        );
                      }
                      return null;
                    })()}

                    {state.html && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSwapPickerIndex(swapPickerIndex === index ? null : index)}
                        >
                          <ImagePlus className="h-3.5 w-3.5 mr-1" /> Cambiar foto
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setVisualEditingIndex(index)}>
                          <Move className="h-3.5 w-3.5 mr-1" /> Editor Visual
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEditHtml(index)}>
                          <Code className="h-3.5 w-3.5 mr-1" /> HTML
                        </Button>
                      </>
                    )}

                    {state.renderedPng && (
                      <Button size="sm" onClick={() => handleDownload(index)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Descargar
                      </Button>
                    )}

                    {state.renderedPng && idea.pieceV2 && getSelectedImageUrl(index) && activeBusinessId && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setMultichannelIndex(index)}
                        className="bg-[#2ED4C7] hover:bg-[#27b8ad] text-white"
                        title="Aplicar esta imagen + copy a múltiples plataformas"
                      >
                        <Layers className="h-3.5 w-3.5 mr-1" /> Multi-plataforma
                      </Button>
                    )}

                    {state.savedDesigns.length > 0 && (
                      <Badge variant="outline" className="text-xs text-green-600 border-green-600/30 self-center">
                        <Check className="h-3 w-3 mr-0.5" /> {state.savedDesigns.length} diseño{state.savedDesigns.length !== 1 ? 's' : ''} guardado{state.savedDesigns.length !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>

                  {/* Swap photo picker (stock + variants + upload) */}
                  {swapPickerIndex === index && state.html && (
                    <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Cambiar foto en este diseño:</span>
                        <Button size="sm" variant="ghost" onClick={() => setSwapPickerIndex(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Variants already generated for this copy */}
                      {state.variants.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Imágenes de este copy:</span>
                          <div className="flex gap-2 overflow-x-auto">
                            {state.variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => handleSwapPhotoFromUrl(index, v.imageUrl)}
                                className="flex-shrink-0 rounded-lg overflow-hidden border hover:border-[#2ED4C7] transition-colors"
                              >
                                <img src={v.imageUrl} alt="" className="h-16 w-16 object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); setLightboxImage(v.imageUrl); }} title="Click para ver en grande" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Stock images */}
                      {stockImages && stockImages.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Biblioteca stock ({stockImages.length}):</span>
                          <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 max-h-32 overflow-y-auto">
                            {stockImages.map((img: any) => (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => handleSwapPhotoFromUrl(index, img.image_url)}
                                className="rounded overflow-hidden border hover:border-[#2ED4C7] transition-colors"
                              >
                                <img src={img.image_url} alt="" className="h-14 w-full object-cover" onDoubleClick={(e) => { e.stopPropagation(); setLightboxImage(img.image_url); }} title="Doble click para ver en grande" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Upload new */}
                      <Button size="sm" variant="outline" onClick={() => handleSwapPhotoClick(index)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> Subir nueva foto
                      </Button>
                    </div>
                  )}

                  {/* Saved designs gallery */}
                  {state.savedDesigns.length >= 1 && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Versiones guardadas ({state.savedDesigns.length}):
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {state.savedDesigns.map((design, dIdx) => {
                          const isActive = state.activeDesignId === design.id;
                          return (
                            <div key={design.id} className="relative flex-shrink-0 group">
                              <button
                                type="button"
                                onClick={() => handleLoadDesign(index, design)}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                  isActive
                                    ? 'border-green-500 ring-2 ring-green-500/30'
                                    : 'border-transparent hover:border-muted-foreground/30'
                                }`}
                              >
                                {design.pngUrl ? (
                                  <img src={design.pngUrl} alt={`Diseño ${dIdx + 1}`} className="h-24 w-16 object-cover object-top" />
                                ) : (
                                  <div className="h-24 w-16 bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                    HTML
                                  </div>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 text-center">
                                  v{dIdx + 1}
                                </div>
                                {isActive && (
                                  <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full p-0.5">
                                    <Check className="h-2.5 w-2.5 text-white" />
                                  </div>
                                )}
                              </button>
                              {/* Enlarge button */}
                              {design.pngUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setLightboxImage(design.pngUrl); }}
                                  className="absolute top-0.5 left-0.5 bg-black/60 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Ver grande"
                                >
                                  <Maximize2 className="h-2.5 w-2.5 text-white" />
                                </button>
                              )}
                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteDesign(index, design.id); }}
                                className="absolute -top-1.5 -right-1.5 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                title="Eliminar versión"
                              >
                                <X className="h-2.5 w-2.5 text-white" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Add manual copy button — for bulletins to add more news items */}
      {isBulletin && (
        <Card
          className="border-dashed border-2 hover:border-[#2ED4C7]/50 cursor-pointer transition-all"
          onClick={() => {
            const newIndex = branch.copyIdeas.length;
            branch.copyIdeas.push({ headline: '', subcopy: '', cta: bulletinMeta?.category || '' });
            setCopyStates((prev) => ({
              ...prev,
              [newIndex]: {
                variants: [], selectedVariantId: null, prompt: '',
                isGenerating: false, html: null, renderedPng: null,
                savedDesigns: [], activeDesignId: null, isRendering: false,
              },
            }));
            // Initialize bulletin fields for new copy
            setBulletinFields((prev) => ({
              ...prev,
              [newIndex]: {
                dataValue: '', dataLabel: '',
                source: bulletinMeta?.source || '',
                category: bulletinMeta?.category || '',
              },
            }));
            setExpandedCopy(newIndex);
            setCopyStates((prev) => ({ ...prev })); // force re-render
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
        >
          <CardContent className="p-6 flex flex-col items-center justify-center text-muted-foreground">
            <span className="text-2xl mb-2">+</span>
            <p className="text-sm font-medium">Agregar otro boletín</p>
            <p className="text-xs">Ej: Inflación México, Guerra comercial, etc.</p>
          </CardContent>
        </Card>
      )}

      {/* Lightbox modal for full-size design preview */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-label="Vista previa del diseño"
        >
          <button
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
          >
            <X className="h-6 w-6 text-white" />
          </button>
          <img
            src={lightboxImage}
            alt="Diseño completo"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Multi-channel renderer modal */}
      <Dialog
        open={multichannelIndex !== null}
        onOpenChange={(open) => {
          if (!open) setMultichannelIndex(null);
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Renderizar para múltiples plataformas</DialogTitle>
          </DialogHeader>
          {multichannelIndex !== null &&
            activeBusinessId &&
            branch.copyIdeas[multichannelIndex]?.pieceV2 &&
            getSelectedImageUrl(multichannelIndex) && (
              <MultichannelRenderer
                businessId={activeBusinessId}
                pieceV2={
                  branch.copyIdeas[multichannelIndex].pieceV2 as unknown as Parameters<
                    typeof MultichannelRenderer
                  >[0]['pieceV2']
                }
                imageUrl={getSelectedImageUrl(multichannelIndex)!}
                defaultTemplateType={
                  templates[multichannelIndex] || defaultTemplateId || 'card-light'
                }
                onClose={() => setMultichannelIndex(null)}
              />
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
