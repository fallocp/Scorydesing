import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface TemplateSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  isSaving?: boolean;
  error?: string | null;
}

/**
 * Modal dialog that requests a template name before saving.
 * Validates that the name is not empty and shows saving/error states.
 */
export function TemplateSaveDialog({
  open,
  onOpenChange,
  onSave,
  isSaving = false,
  error = null,
}: TemplateSaveDialogProps) {
  const [name, setName] = useState('');

  // Reset name when dialog opens
  useEffect(() => {
    if (open) {
      setName('');
    }
  }, [open]);

  const trimmedName = name.trim();
  const isNameEmpty = trimmedName.length === 0;
  const isSaveDisabled = isNameEmpty || isSaving;

  const handleSave = () => {
    if (!isSaveDisabled) {
      onSave(trimmedName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isSaveDisabled) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Guardar como template</DialogTitle>
          <DialogDescription>
            Ingresa un nombre descriptivo para tu nuevo template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="template-name">Nombre del template</Label>
            <Input
              id="template-name"
              placeholder="Ej: Promo Verano Dark"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              autoFocus
            />
            {isNameEmpty && name !== '' && (
              <p className="text-sm text-destructive">
                El nombre no puede estar vacío.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaveDisabled}
          >
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
