/**
 * DisputeButton — "No estoy de acuerdo" button for validation results.
 *
 * Placed next to rejected content in the Claim Validator UI.
 * When clicked, opens a small input for the reason and records the dispute.
 * The dispute feeds back into the Compliance Wizard for rule refinement.
 */

import { useState } from 'react';
import { Flag, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useComplianceWizardStore } from '@/store/complianceWizardStore';
import { useToast } from '@/components/ui/use-toast';

interface DisputeButtonProps {
  validationId: string;
  /** Optional compact mode for inline use */
  compact?: boolean;
}

export function DisputeButton({ validationId, compact = false }: DisputeButtonProps) {
  const { disputeValidation } = useComplianceWizardStore();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setIsSubmitting(true);

    try {
      await disputeValidation(validationId, reason.trim());
      setSubmitted(true);
      setIsOpen(false);
      toast({
        title: 'Disputa registrada',
        description: 'Tu feedback se usará para ajustar las reglas en el Compliance Wizard.',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo registrar la disputa.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="h-3 w-3 text-green-600" />
        Reportado
      </span>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'sm' : 'default'}
          className={compact ? 'h-6 gap-1 px-2 text-[10px]' : 'gap-1.5 text-xs'}
        >
          <Flag className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          {compact ? 'Disputar' : 'No estoy de acuerdo'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            ¿Por qué no estás de acuerdo con este rechazo?
          </p>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ej: Este contenido es legítimo porque..."
            className="h-8 text-xs"
            disabled={isSubmitting}
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={!reason.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Enviar'
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DisputeButton;
