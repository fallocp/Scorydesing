/**
 * ComplianceWizardPage — Split-panel layout for the Compliance Wizard.
 *
 * Left panel: Chat conversacional
 * Right panel: Panel estructurado
 *
 * Connects to complianceWizardStore and invokes startSession on mount.
 *
 * Requirements: 1.1, 4.1
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';
import { ComplianceStructuredPanel } from '@/components/compliance-wizard/ComplianceStructuredPanel';
import { ComplianceChat } from '@/components/compliance-wizard/ComplianceChat';

function ComplianceWizardPage() {
  const navigate = useNavigate();
  const { activeBusinessId } = useActiveBusiness();
  const { mode, startSession } = useComplianceWizardStore();

  // Start session when the component mounts and we have a businessId
  useEffect(() => {
    if (activeBusinessId) {
      startSession(activeBusinessId);
    }
  }, [activeBusinessId, startSession]);

  // No active business selected
  if (!activeBusinessId) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertTitle>Sin negocio activo</AlertTitle>
          <AlertDescription>
            Selecciona un negocio desde el panel principal para configurar compliance.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Loading state
  if (mode === 'loading') {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Cargando Compliance Wizard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Compliance Wizard
          </h1>
          <p className="text-xs text-muted-foreground">
            Configura tus reglas de compliance con IA
          </p>
        </div>
      </div>

      {/* Split-panel layout using flex */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: Chat */}
        <div className="flex-1 min-w-0 border-r">
          <ComplianceChat />
        </div>

        {/* Right panel: Structured panel */}
        <div className="flex-1 min-w-0">
          <ComplianceStructuredPanel />
        </div>
      </div>
    </div>
  );
}

export default ComplianceWizardPage;
