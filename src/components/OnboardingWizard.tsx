/**
 * OnboardingWizard — 8-step wizard container for new business setup.
 *
 * Provides progress indicator, back navigation, step validation, and
 * quick-start template selection. Each step is a child component that
 * receives callbacks for navigation and data persistence.
 *
 * Requirements: 14.1, 14.10, 14.11, 17.4
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

import { OnboardingStep1_Identity } from './OnboardingStep1_Identity';
import { OnboardingStep2_Categories } from './OnboardingStep2_Categories';
import { OnboardingStep3_Branches } from './OnboardingStep3_Branches';
import { OnboardingStep4_Verticals } from './OnboardingStep4_Verticals';
import { OnboardingStep5_Moments } from './OnboardingStep5_Moments';
import { OnboardingStep6_Channels } from './OnboardingStep6_Channels';
import { OnboardingStep7_Prompt } from './OnboardingStep7_Prompt';
import { OnboardingStep8_Review } from './OnboardingStep8_Review';

import type { OnboardingTemplate } from '@/data/onboardingTemplates';

const STEP_LABELS = [
  'Identidad',
  'Categorías',
  'Ramas',
  'Verticales',
  'Momentos',
  'Canales',
  'Prompt',
  'Revisión',
] as const;

const TOTAL_STEPS = STEP_LABELS.length;

export interface OnboardingData {
  businessId: string | null;
  businessName: string;
  template: OnboardingTemplate | null;
  categoriesCreated: boolean;
  branchesCreated: boolean;
  verticalsCreated: boolean;
  momentsCreated: boolean;
  channelsCreated: boolean;
  promptCreated: boolean;
}

const initialData: OnboardingData = {
  businessId: null,
  businessName: '',
  template: null,
  categoriesCreated: false,
  branchesCreated: false,
  verticalsCreated: false,
  momentsCreated: false,
  channelsCreated: false,
  promptCreated: false,
};

export function OnboardingWizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>(initialData);
  const [stepValid, setStepValid] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const progressPercent = ((currentStep + 1) / TOTAL_STEPS) * 100;

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const goNext = useCallback(() => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep((s) => s + 1);
      setStepValid(false);
    }
  }, [currentStep]);

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setStepValid(true); // previous steps are already valid
    }
  }, [currentStep]);

  const goToStep = useCallback((step: number) => {
    if (step >= 0 && step < TOTAL_STEPS) {
      setCurrentStep(step);
    }
  }, []);

  const handleComplete = useCallback(() => {
    toast({ title: '¡Negocio configurado!', description: 'Ya puedes empezar a generar contenido.' });
    navigate('/');
  }, [navigate, toast]);

  const renderStep = () => {
    const commonProps = {
      data,
      updateData,
      onValidChange: setStepValid,
      goNext,
    };

    switch (currentStep) {
      case 0:
        return <OnboardingStep1_Identity {...commonProps} />;
      case 1:
        return <OnboardingStep2_Categories {...commonProps} />;
      case 2:
        return <OnboardingStep3_Branches {...commonProps} />;
      case 3:
        return <OnboardingStep4_Verticals {...commonProps} />;
      case 4:
        return <OnboardingStep5_Moments {...commonProps} />;
      case 5:
        return <OnboardingStep6_Channels {...commonProps} />;
      case 6:
        return <OnboardingStep7_Prompt {...commonProps} />;
      case 7:
        return <OnboardingStep8_Review data={data} goToStep={goToStep} onComplete={handleComplete} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
          <Rocket className="h-6 w-6" />
          Configurar Nuevo Negocio
        </h1>
        <p className="text-sm text-muted-foreground">
          Paso {currentStep + 1} de {TOTAL_STEPS}: {STEP_LABELS[currentStep]}
        </p>
      </div>

      {/* Progress bar */}
      <Progress value={progressPercent} className="h-2" />

      {/* Step indicators */}
      <div className="flex items-center justify-between px-2" role="navigation" aria-label="Pasos del wizard">
        {STEP_LABELS.map((label, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;
          return (
            <button
              key={label}
              onClick={() => idx <= currentStep && goToStep(idx)}
              disabled={idx > currentStep}
              className={cn(
                'flex flex-col items-center gap-1 text-xs transition-colors',
                isCurrent && 'text-primary font-medium',
                isCompleted && 'text-primary/70 cursor-pointer',
                !isCurrent && !isCompleted && 'text-muted-foreground/50',
              )}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Paso ${idx + 1}: ${label}`}
            >
              <span
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-colors',
                  isCurrent && 'border-primary bg-primary text-primary-foreground',
                  isCompleted && 'border-primary/70 bg-primary/10 text-primary',
                  !isCurrent && !isCompleted && 'border-muted-foreground/30',
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </span>
              <span className="hidden sm:block">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">{renderStep()}</div>

      {/* Navigation buttons */}
      {currentStep < TOTAL_STEPS - 1 && (
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <Button onClick={goNext} disabled={!stepValid} className="gap-2">
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
