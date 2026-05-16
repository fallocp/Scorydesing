/**
 * XendingDesignPage — Main entry point for the Xending Design Generator.
 *
 * Updated to use the new campaign architecture:
 * - CategoryTabs + BranchCardGrid replace the flat branch list
 * - BusinessSwitcher in header (visible only in multi-tenant mode)
 * - CombinableGeneratorPanel as the main generation flow
 * - Generated ideas are persisted to Supabase via useGeneratedIdeas hooks
 *
 * Requirements: 10.1, 10.2, 10.6
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Image, Library, Newspaper, Building2, Settings, FileText, Eye, Presentation, Palette } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { BrandSelector } from '@/components/BrandSelector';
import { CategoryTabs } from '@/components/CategoryTabs';
import { BranchCardGrid } from '@/components/BranchCardGrid';
import { VerticalCardGrid } from '@/components/VerticalCardGrid';
import { MomentCardGrid } from '@/components/MomentCardGrid';
import { CombinableGeneratorPanel } from '@/components/CombinableGeneratorPanel';
import { BranchPickerForVertical } from '@/components/BranchPickerForVertical';
import { IdeasPanel } from '@/components/IdeasPanel';
import type { CopyIdea } from '@/components/IdeasPanel';
import { MasterPromptEditor } from '@/components/MasterPromptEditor';
import { StrategicConfigViewer } from '@/components/StrategicConfigViewer';
import { useDesignStore } from '@/store/designStore';
import { useDeploymentMode } from '@/hooks/useDeploymentMode';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';
import {
  useGeneratedIdeas,
  useSaveGeneratedIdeas,
  useDeleteGeneratedIdea,
  useDeleteAllGeneratedIdeas,
  useUpdateIdeaStatus,
} from '@/hooks/useGeneratedIdeas';
import type { GeneratedIdeaRow } from '@/hooks/useGeneratedIdeas';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { CommercialBranch, CampaignCategory, BusinessTenant, IndustryVertical, MarketMoment, StrategicConfig } from '@/types/xendingDesign';

const MODE_OPTIONS = [
  {
    key: 'campaign',
    title: 'Nueva Campaña',
    description: 'Planifica una campaña desde cero con estrategia y ramas',
    icon: Sparkles,
    route: '/campaign',
  },
  {
    key: 'bulletin',
    title: 'Boletín Express',
    description: 'Publica noticias y comunicados al instante',
    icon: Newspaper,
    route: '/bulletin',
  },
  {
    key: 'stock',
    title: 'Generar Stock',
    description: 'Genera imágenes stock temáticas en lote',
    icon: Image,
    route: '/stock',
  },
  {
    key: 'library',
    title: 'Biblioteca de Assets',
    description: 'Explora y administra tu biblioteca de imágenes',
    icon: Library,
    route: '/library',
  },
  {
    key: 'presentations',
    title: 'Presentaciones',
    description: 'Pitch decks y presentaciones con branding Xending',
    icon: Presentation,
    route: '/presentations',
  },
  {
    key: 'palette',
    title: 'Paleta de Marca',
    description: 'Colores, tipografías, gradientes y tokens del sistema',
    icon: Palette,
    route: '/palette',
  },
] as const;

function XendingDesignPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const deploymentMode = useDeploymentMode();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const setBrand = useDesignStore((s) => s.setBrand);
  const activeCategory = useDesignStore((s) => s.activeCategory);

  const { activeBusiness, activeBusinessId, setActiveBusiness } = useActiveBusiness();
  const { data: businesses, isLoading: businessesLoading } = useBusinessTenants();

  const [selectedBranch, setSelectedBranch] = useState<CommercialBranch | null>(null);
  const [selectedVertical, setSelectedVertical] = useState<IndustryVertical | null>(null);
  const [selectedMoment, setSelectedMoment] = useState<MarketMoment | null>(null);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showBranchConfig, setShowBranchConfig] = useState(false);

  // Persisted ideas hooks
  const { data: persistedIdeas = [] } = useGeneratedIdeas(selectedBranch?.id);
  const saveIdeas = useSaveGeneratedIdeas();
  const deleteIdea = useDeleteGeneratedIdea();
  const deleteAllIdeas = useDeleteAllGeneratedIdeas();
  const updateIdeaStatus = useUpdateIdeaStatus();

  // Check for existing campaigns for the selected branch
  const { data: existingCampaigns = [], isFetching: isFetchingCampaigns } = useQuery({
    queryKey: ['branch-campaigns', selectedBranch?.id, selectedBrand],
    queryFn: async () => {
      if (!selectedBranch?.id) return [];

      const { data, error } = await supabase
        .from('design_campaigns')
        .select('id, name, created_at, status, commercial_branch_id, branch_data')
        .eq('brand', selectedBrand!)
        .eq('commercial_branch_id', selectedBranch.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Double-check: filter out campaigns whose branch_data.name doesn't match
      // (handles cases where commercial_branch_id was incorrectly assigned)
      const results = (data ?? []).filter((c: any) => {
        const branchDataName = (c.branch_data as any)?.name;
        // If branch_data has a name, it must match the selected branch
        if (branchDataName && branchDataName !== selectedBranch.name) return false;
        return true;
      });

      return results;
    },
    enabled: !!selectedBranch?.id && !!selectedBrand,
    staleTime: 30_000,
    placeholderData: (prev, prevQuery) => {
      const prevBranchId = (prevQuery?.queryKey as any)?.[1];
      if (prevBranchId === selectedBranch?.id) return prev;
      return [];
    },
  });

  const handleContinueCampaign = useCallback(
    (campaignId: string) => {
      // Clear stale campaign from store so CopyWorkstation uses the URL param
      const { setCampaign } = useDesignStore.getState();
      setCampaign(null);
      navigate(`/xending-design/campaign?step=2&branchId=${campaignId}`);
    },
    [navigate],
  );

  const handleBusinessChange = useCallback(
    async (businessId: string) => {
      const business = businesses?.find((b) => b.id === businessId) ?? null;
      if (business) {
        try {
          await setActiveBusiness(business);
          // Also set the brand based on the business slug for backward compat
          if (business.slug === 'xending' || business.slug === 'xending_capital') {
            setBrand(business.slug as 'xending' | 'xending_capital');
          }
          toast({ title: `Negocio: ${business.name}` });
        } catch {
          toast({ title: 'Error al cambiar negocio', variant: 'destructive' });
        }
      }
    },
    [businesses, setActiveBusiness, setBrand, toast],
  );

  const handleBranchSelect = useCallback((branch: CommercialBranch) => {
    setSelectedBranch(branch);
  }, []);

  const handleClearBranch = useCallback(() => {
    setSelectedBranch(null);
  }, []);

  const handleVerticalSelect = useCallback((vertical: IndustryVertical) => {
    setSelectedVertical(vertical);
    // Sync vertical to dimensions store so CombinableGeneratorPanel has it pre-selected
    useDesignStore.getState().setSelectedDimensions({ verticalId: vertical.id });
  }, []);

  const handleMomentSelect = useCallback((moment: MarketMoment) => {
    setSelectedMoment(moment);
  }, []);

  const handleCategoryChange = useCallback((_category: CampaignCategory) => {
    // Clear all selections when switching categories
    setSelectedBranch(null);
    setSelectedVertical(null);
    setSelectedMoment(null);
  }, []);

  const handleIdeasGenerated = useCallback((data: unknown) => {
    const result = data as { ideas?: CopyIdea[] };
    if (result?.ideas && activeBusinessId && selectedBranch) {
      // Read current dimensions from store for angle/funnel metadata
      const dims = useDesignStore.getState().selectedDimensions;

      // Persist generated ideas to Supabase
      const rows = result.ideas.map((idea) => ({
        business_id: activeBusinessId,
        branch_id: selectedBranch.id ?? null,
        vertical_id: selectedVertical?.id ?? null,
        moment_id: selectedMoment?.id ?? null,
        channel: dims.channel ?? null,
        angle: dims.narrativeAngle ?? idea.angle ?? null,
        headline: idea.headline,
        subcopy: idea.subcopy,
        cta: idea.cta,
        image_suggestion: idea.imageSuggestion ?? null,
        status: 'generated',
      }));
      saveIdeas.mutate(rows, {
        onError: () => {
          toast({ title: 'Error al guardar ideas', variant: 'destructive' });
        },
      });
    }
  }, [activeBusinessId, selectedBranch, selectedVertical, selectedMoment, saveIdeas, toast]);

  const handleClearIdeas = useCallback(() => {
    deleteAllIdeas.mutate(selectedBranch?.id ?? undefined, {
      onError: () => {
        toast({ title: 'Error al limpiar ideas', variant: 'destructive' });
      },
    });
  }, [deleteAllIdeas, selectedBranch, toast]);

  const handleDeleteIdea = useCallback((id: string) => {
    deleteIdea.mutate(id, {
      onError: () => {
        toast({ title: 'Error al eliminar idea', variant: 'destructive' });
      },
    });
  }, [deleteIdea, toast]);

  const handleToggleIdeaStatus = useCallback(
    (id: string, newStatus: 'approved' | 'generated') => {
      updateIdeaStatus.mutate(
        { id, status: newStatus },
        {
          onError: () => {
            toast({ title: 'Error al actualizar estado', variant: 'destructive' });
          },
        },
      );
    },
    [updateIdeaStatus, toast],
  );

  const handleProceedWithIdeas = useCallback(
    (approvedIdeas: GeneratedIdeaRow[]) => {
      const branch = selectedBranch;
      if (!branch) {
        toast({ title: 'Selecciona una rama primero', variant: 'destructive' });
        return;
      }
      if (approvedIdeas.length === 0) {
        return;
      }

      // If there's an existing campaign for this branch, navigate to it and append new ideas
      const existingCampaign = existingCampaigns.find(
        (c: any) => c.commercial_branch_id === branch.id && c.status !== 'completed'
      );

      if (existingCampaign) {
        // Append new copyIdeas to the existing campaign's branch_data
        const branchData = existingCampaign.branch_data as any;
        const existingCopyIdeas = branchData?._workState?.copyIdeas ?? branchData?.copyIdeas ?? [];
        const newCopyIdeas = approvedIdeas.map((idea) => ({
          headline: idea.headline,
          subcopy: idea.subcopy,
          cta: idea.cta,
          imageSuggestion: idea.image_suggestion ?? undefined,
        }));
        const mergedCopyIdeas = [...existingCopyIdeas, ...newCopyIdeas];

        // Update the campaign in DB with merged copyIdeas
        supabase
          .from('design_campaigns')
          .update({
            branch_data: {
              ...branchData,
              copyIdeas: mergedCopyIdeas,
              _workState: {
                ...(branchData?._workState ?? {}),
                copyIdeas: mergedCopyIdeas,
              },
            },
          })
          .eq('id', existingCampaign.id)
          .then(({ error }) => {
            if (error) console.error('Error appending ideas to campaign:', error);
          });

        // Mark ideas as used
        approvedIdeas.forEach((idea) => {
          updateIdeaStatus.mutate({ id: idea.id, status: 'used' });
        });

        // Navigate to the existing campaign
        navigate(`/xending-design/campaign?step=2&branchId=${existingCampaign.id}`);
        return;
      }

      // No existing campaign — create a new branch and navigate
      const config = branch.strategic_config as any;
      const strategyBranch = {
        id: branch.id ?? crypto.randomUUID(),
        name: branch.name,
        commercial_branch_id: branch.id,
        category: activeCategory?.name ?? '',
        description: config?.objetivo ?? '',
        targetAudience: config?.audiencia ?? '',
        keyMessage: config?.promesa ?? '',
        branchPrompt: config?.objetivo ?? '',
        copyIdeas: approvedIdeas.map((idea) => ({
          headline: idea.headline,
          subcopy: idea.subcopy,
          cta: idea.cta,
          imageSuggestion: idea.image_suggestion ?? undefined,
        })),
        imageDescriptions: approvedIdeas
          .map((idea) => idea.image_suggestion)
          .filter((s): s is string => !!s),
        approved: true,
        // Carry the full branch so CopyWorkstation can read strategic_config
        strategic_config: config,
      };

      // Save to store so CampaignWizardPage can pick it up
      const { setBranches, setCampaign } = useDesignStore.getState();
      setBranches([strategyBranch]);
      // Clear stale campaign so CopyWorkstation creates a fresh one for this branch
      setCampaign(null);

      // Mark ideas as used so they don't show up again
      approvedIdeas.forEach((idea) => {
        updateIdeaStatus.mutate({ id: idea.id, status: 'used' });
      });

      // Navigate to campaign wizard step 2 (CopyWorkstation)
      navigate('/campaign?step=2');
    },
    [selectedBranch, activeCategory, navigate, toast, existingCampaigns, updateIdeaStatus],
  );

  const isReady = selectedBrand || activeBusinessId;

  /**
   * Determine what type of content to show based on the active category slug.
   * - 'branches': Xending Pagos/FX and similar commercial categories
   * - 'verticals': Produce/Agro, Industrias
   * - 'moments': Market Updates
   */
  const getCategoryContentType = (category: CampaignCategory | null): 'branches' | 'verticals' | 'moments' => {
    if (!category) return 'branches';
    const slug = category.slug?.toLowerCase() ?? '';
    if (slug.includes('market') || slug.includes('updates')) return 'moments';
    if (slug.includes('agro') || slug.includes('produce') || slug.includes('industria')) return 'verticals';
    return 'branches';
  };

  const categoryContentType = getCategoryContentType(activeCategory);

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Xending Design Generator</h1>
          <p className="text-muted-foreground mt-1">
            Crea visuales de marketing de marca para tus negocios
          </p>
        </div>

        {/* Business Switcher — visible only in multi-tenant mode */}
        {deploymentMode === 'multi' && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {businessesLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <Select
                value={activeBusinessId ?? undefined}
                onValueChange={handleBusinessChange}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar negocio" />
                </SelectTrigger>
                <SelectContent>
                  {businesses?.map((biz) => (
                    <SelectItem key={biz.id} value={biz.id!}>
                      {biz.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Brand Selection — always visible for switching */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Seleccionar Marca</h2>
        <BrandSelector value={selectedBrand} onChange={setBrand} />
      </section>

      {/* Admin Quick Actions */}
      {isReady && (
        <section className="flex flex-wrap gap-2">
          <Collapsible open={showPromptEditor} onOpenChange={setShowPromptEditor}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <FileText className="h-4 w-4" />
                {showPromptEditor ? 'Cerrar' : 'Editar'} Master Prompt
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 w-full">
              <MasterPromptEditor />
            </CollapsibleContent>
          </Collapsible>

          {selectedBranch && (
            <Collapsible open={showBranchConfig} onOpenChange={setShowBranchConfig}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Eye className="h-4 w-4" />
                  {showBranchConfig ? 'Cerrar' : 'Ver'} Config: {selectedBranch.name}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 w-full">
                <StrategicConfigViewer
                  branchName={selectedBranch.name}
                  config={selectedBranch.strategic_config as StrategicConfig}
                />
              </CollapsibleContent>
            </Collapsible>
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate('/admin/business')}
          >
            <Settings className="h-4 w-4" />
            Admin Panel
          </Button>
        </section>
      )}

      {/* Category Tabs + Content Grid (new architecture) */}
      {isReady && (
        <section className="space-y-5">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Categorías de Campaña</h2>
            <CategoryTabs onCategoryChange={handleCategoryChange} />
          </div>

          {/* Content grid based on category type */}
          {activeCategory && categoryContentType === 'branches' && (
            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">
                Ramas Comerciales — {activeCategory.name}
              </h3>
              <BranchCardGrid
                categoryId={activeCategory.id ?? null}
                selectedBranchId={selectedBranch?.id ?? null}
                onBranchSelect={handleBranchSelect}
              />
            </div>
          )}

          {activeCategory && categoryContentType === 'verticals' && (
            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">
                Verticales — {activeCategory.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                Selecciona una vertical y luego elige qué beneficio quieres explotar (rama comercial).
              </p>
              <VerticalCardGrid
                categoryId={activeCategory.id ?? null}
                selectedVerticalId={selectedVertical?.id ?? null}
                onVerticalSelect={handleVerticalSelect}
              />

              {/* Branch picker — shown after a vertical is selected */}
              {selectedVertical && (
                <BranchPickerForVertical
                  selectedBranchId={selectedBranch?.id ?? null}
                  onBranchSelect={handleBranchSelect}
                />
              )}
            </div>
          )}

          {activeCategory && categoryContentType === 'moments' && (
            <div className="space-y-3">
              <h3 className="text-base font-medium text-foreground">
                Momentos de Mercado — {activeCategory.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                Contenido coyuntural basado en eventos de mercado. Selecciona un momento para generar contenido.
              </p>
              <MomentCardGrid
                categoryId={activeCategory.id ?? null}
                selectedMomentId={selectedMoment?.id ?? null}
                onMomentSelect={handleMomentSelect}
              />
            </div>
          )}

          {/* Combinable Generator Panel */}
          {selectedBranch && (
            <CombinableGeneratorPanel
              branch={selectedBranch}
              categoryId={activeCategory?.id ?? null}
              onClearBranch={handleClearBranch}
              onIdeasGenerated={handleIdeasGenerated}
              previousHeadlines={persistedIdeas.map((i) => i.headline)}
            />
          )}

          {/* Existing campaigns for this branch — continue without regenerating */}
          {!isFetchingCampaigns && existingCampaigns.length > 0 && (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Ya tienes {existingCampaigns.length} diseño{existingCampaigns.length > 1 ? 's' : ''} guardado{existingCampaigns.length > 1 ? 's' : ''} para esta rama
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Puedes continuar donde lo dejaste sin regenerar
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      handleContinueCampaign(existingCampaigns[0].id);
                    }}
                  >
                    Continuar diseño →
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generated Ideas — show generated and approved (hide only used) */}
          {persistedIdeas.filter((i) => i.status !== 'used').length > 0 && (
            <IdeasPanel
              persistedIdeas={persistedIdeas.filter((i) => i.status !== 'used')}
              onToggleStatus={handleToggleIdeaStatus}
              onProceed={handleProceedWithIdeas}
              onDelete={handleDeleteIdea}
              onClear={handleClearIdeas}
            />
          )}
        </section>
      )}

      {/* Mode Picker / Tools */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Herramientas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {MODE_OPTIONS.map((mode) => {
            const Icon = mode.icon;
            const disabled = !isReady;
            return (
              <Card
                key={mode.key}
                className={cn(
                  'transition-all',
                  disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-md hover:border-[#2ED4C7]/50',
                )}
                onClick={() => {
                  if (!disabled) navigate(mode.route);
                }}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                onKeyDown={(e) => {
                  if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    navigate(mode.route);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-[#0F1419] p-2">
                      <Icon className="h-5 w-5 text-[#2ED4C7]" />
                    </div>
                    <CardTitle className="text-base">{mode.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{mode.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {!isReady && (
          <p className="text-sm text-muted-foreground">
            Selecciona una marca o negocio arriba para comenzar
          </p>
        )}
      </section>
    </div>
  );
}

export default XendingDesignPage;
