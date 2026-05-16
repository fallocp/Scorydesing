import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lightbulb, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StrategyPlanner } from '@/components/StrategyPlanner';
import { CopyWorkstation } from '@/components/CopyWorkstation';
import { useDesignStore } from '@/store/designStore';
import { supabase } from '@/integrations/supabase/client';
import type { StrategyBranch } from '@/types/xendingDesign';

const STEPS = [
  { number: 1, label: 'Estrategia', icon: Lightbulb },
  { number: 2, label: 'Crear Piezas', icon: Palette },
] as const;

function CampaignWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const branches = useDesignStore((s) => s.branches);

  // If navigating from saved branch (XendingDesignPage), start on step 2 directly
  const initialStep = searchParams.get('step') === '2' ? 2 : 1;
  const branchIdFromUrl = searchParams.get('branchId');
  const [currentStep, setCurrentStep] = useState(initialStep);

  const initialBranch = initialStep === 2 ? (branches.find((b) => b.approved === true) ?? null) : null;
  const [approvedBranch, setApprovedBranch] = useState<StrategyBranch | null>(initialBranch);

  // If we have branchId from URL but no approved branch in store, create a minimal branch
  // so CopyWorkstation can load the saved state from DB
  if (branchIdFromUrl && !approvedBranch && currentStep === 2) {
    const minimalBranch: StrategyBranch = {
      id: branchIdFromUrl,
      name: 'Cargando...',
      category: '',
      description: '',
      targetAudience: '',
      keyMessage: '',
      branchPrompt: '',
      copyIdeas: [],
      imageDescriptions: [],
      approved: true,
    };
    setApprovedBranch(minimalBranch);
  }

  // Load campaign data from DB to get the real branch name and copy ideas
  useEffect(() => {
    if (!branchIdFromUrl || !approvedBranch || approvedBranch.name !== 'Cargando...') return;

    const loadCampaignData = async () => {
      try {
        const { data, error } = await supabase
          .from('design_campaigns')
          .select('name, branch_data')
          .eq('id', branchIdFromUrl)
          .single();

        if (error || !data) return;

        const branchData = data.branch_data as any;
        // Prioritize _workState.copyIdeas (most recent, includes Brainstorm/variant additions)
        // over branchData.copyIdeas (may be stale from initial branch creation)
        const workStateCopys = branchData?._workState?.copyIdeas;
        const branchCopys = branchData?.copyIdeas;
        const copyIdeas = (workStateCopys && workStateCopys.length >= (branchCopys?.length ?? 0))
          ? workStateCopys
          : (branchCopys ?? []);

        setApprovedBranch((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            name: branchData?.name || data.name || prev.name,
            category: branchData?.category || prev.category,
            description: branchData?.description || prev.description,
            targetAudience: branchData?.targetAudience || prev.targetAudience,
            keyMessage: branchData?.keyMessage || prev.keyMessage,
            branchPrompt: branchData?.branchPrompt || prev.branchPrompt,
            copyIdeas: copyIdeas.length > 0 ? copyIdeas : prev.copyIdeas,
            imageDescriptions: branchData?.imageDescriptions || prev.imageDescriptions,
            strategic_config: branchData?.strategic_config,
            commercial_branch_id: branchData?.commercial_branch_id,
          } as StrategyBranch;
        });
      } catch (err) {
        console.error('Error loading campaign data:', err);
      }
    };

    loadCampaignData();
  }, [branchIdFromUrl, approvedBranch?.name]);

  const approvedBranchCount = branches.filter((b) => b.approved === true).length;

  const handleBack = () => {
    if (currentStep > 1) {
      setApprovedBranch(null);
      setCurrentStep(1);
    }
  };

  const handleSelectBranchForPieces = (branch: StrategyBranch) => {
    // Preserve _workState from the original branch if it exists
    const originalBranch = branches.find((b) => b.id === branch.id);
    const workState = (originalBranch as any)?._workState;
    const branchWithState = workState ? { ...branch, _workState: workState } : branch;
    setApprovedBranch(branchWithState as StrategyBranch);
    setCurrentStep(2);
  };

  if (!selectedBrand) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <p className="text-muted-foreground">Por favor selecciona una marca primero.</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          Ir a Selección de Marca
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Volver">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Asistente de Campaña</h1>
          <p className="text-sm text-muted-foreground">Paso {currentStep} de {STEPS.length}</p>
        </div>
      </div>

      {/* Step Indicator */}
      <nav aria-label="Pasos del asistente">
        <ol className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = currentStep === step.number;
            const isCompleted = currentStep > step.number;
            return (
              <li key={step.number} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { if (isCompleted) setCurrentStep(step.number); }}
                  disabled={!isCompleted && !isActive}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors whitespace-nowrap',
                    isActive && 'bg-[#0F1419] text-white',
                    isCompleted && 'bg-[#2ED4C7]/10 text-[#2ED4C7] hover:bg-[#2ED4C7]/20 cursor-pointer',
                    !isActive && !isCompleted && 'text-muted-foreground opacity-50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
                {step.number < STEPS.length && (
                  <div className={cn('h-px w-3 sm:w-6', isCompleted ? 'bg-[#2ED4C7]' : 'bg-border')} />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {/* Step 1: Estrategia */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <StrategyPlanner />
            {approvedBranchCount > 0 && (
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold">Ramas aprobadas — selecciona una para crear piezas:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {branches.filter((b) => b.approved === true).map((b) => (
                    <Button
                      key={b.id}
                      variant="outline"
                      className="h-auto py-3 px-4 text-left justify-start"
                      onClick={() => handleSelectBranchForPieces(b)}
                    >
                      <div>
                        <p className="font-medium text-sm">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.category}</p>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Crear Piezas — wait until branch is fully loaded from DB */}
        {currentStep === 2 && approvedBranch && approvedBranch.name !== 'Cargando...' && (
          <CopyWorkstation
            branch={approvedBranch}
            branchName={approvedBranch.name}
            initialBrainstormOpen={searchParams.get('brainstorm') === '1'}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="outline" onClick={handleBack} disabled={currentStep === 1}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Atrás
        </Button>

        {currentStep === 1 && approvedBranchCount > 0 && (
          <p className="text-sm text-muted-foreground">Selecciona una rama arriba</p>
        )}
      </div>
    </div>
  );
}

export default CampaignWizardPage;
