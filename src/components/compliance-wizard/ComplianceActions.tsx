/**
 * ComplianceActions — Action buttons for approving rules and disabling validation.
 *
 * - "Aprobar reglas" calls `approveRules()` from the store (primary/success style)
 * - "Desactivar validación" calls `disableValidation()` from the store (destructive/outline)
 * - Shows toast notifications for success/error feedback
 *
 * Requirements: 5.1, 5.4, 5.5
 */

import { useState } from 'react';
import { CheckCircle2, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';

export function ComplianceActions() {
  const { currentRules, isGenerating, approveRules, disableValidation } =
    useComplianceWizardStore();
  const { toast } = useToast();
  const [isApproving, setIsApproving] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await approveRules();
      toast({
        title: 'Reglas aprobadas',
        description:
          'Las reglas fueron guardadas y la validación de Nivel 2 está activa.',
      });
    } catch (err) {
      toast({
        title: 'Error al aprobar reglas',
        description:
          err instanceof Error ? err.message : 'Ocurrió un error inesperado.',
        variant: 'destructive',
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleDisable = async () => {
    setIsDisabling(true);
    try {
      await disableValidation();
      toast({
        title: 'Validación desactivada',
        description:
          'La validación personalizada fue desactivada. Las reglas se conservan.',
      });
    } catch (err) {
      toast({
        title: 'Error al desactivar validación',
        description:
          err instanceof Error ? err.message : 'Ocurrió un error inesperado.',
        variant: 'destructive',
      });
    } finally {
      setIsDisabling(false);
    }
  };

  const isApproveDisabled =
    !currentRules || isGenerating || isApproving || isDisabling;

  return (
    <div className="flex items-center gap-2 border-t px-4 py-3">
      <Button
        onClick={handleApprove}
        disabled={isApproveDisabled}
        className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        size="sm"
      >
        <CheckCircle2 className="mr-1.5 h-4 w-4" />
        {isApproving ? 'Aprobando…' : 'Aprobar reglas'}
      </Button>

      <Button
        variant="outline"
        onClick={handleDisable}
        disabled={isGenerating || isDisabling}
        className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50"
        size="sm"
      >
        <ShieldOff className="mr-1.5 h-4 w-4" />
        {isDisabling ? 'Desactivando…' : 'Desactivar validación'}
      </Button>
    </div>
  );
}

export default ComplianceActions;
