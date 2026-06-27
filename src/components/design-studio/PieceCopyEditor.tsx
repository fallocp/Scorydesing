/**
 * PieceCopyEditor — Editable copy fields + image type/prompt for Design Studio.
 *
 * Shows when contentMode === 'branch' and allows the user to:
 * - Generate copy automatically from the branch (calls generate-ideas)
 * - Edit specific copy (headline, body, CTA, punchline)
 * - Select image type (Foto, Infografía, 3D Clay, Financiero)
 * - Edit the image prompt
 *
 * These fields are optional — if empty, the branch ingredients are used as fallback.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Camera, BarChart3, Box, TrendingUp, Sparkles, Loader2 } from 'lucide-react';
import type { PieceCopy, PieceImagePrompt, DesignImageType } from '@/types/design-studio';

interface PieceCopyEditorProps {
  pieceCopy: PieceCopy | null;
  pieceImagePrompt: PieceImagePrompt | null;
  onCopyFieldChange: (field: keyof PieceCopy, value: string) => void;
  onImageTypeChange: (type: DesignImageType) => void;
  onImagePromptChange: (text: string) => void;
  textInImage?: boolean;
  onTextInImageChange?: (value: boolean) => void;
  onGenerateCopy?: () => Promise<void>;
  isGeneratingCopy?: boolean;
  disabled?: boolean;
}

const IMAGE_TYPE_OPTIONS: { value: DesignImageType; label: string; icon: typeof Camera }[] = [
  { value: 'foto', label: 'Foto', icon: Camera },
  { value: 'infografia', label: 'Infografía', icon: BarChart3 },
  { value: '3d_clay', label: '3D Clay', icon: Box },
  { value: 'financiero', label: 'Financiero', icon: TrendingUp },
];

export function PieceCopyEditor({
  pieceCopy,
  pieceImagePrompt,
  onCopyFieldChange,
  onImageTypeChange,
  onImagePromptChange,
  textInImage = false,
  onTextInImageChange,
  onGenerateCopy,
  isGeneratingCopy = false,
  disabled = false,
}: PieceCopyEditorProps) {
  return (
    <div className="space-y-5 rounded-lg border border-border/50 bg-muted/30 p-4">
      {/* Generate copy button */}
      {onGenerateCopy && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onGenerateCopy}
          disabled={disabled || isGeneratingCopy}
          className="w-full"
        >
          {isGeneratingCopy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generando copy e imagen...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generar copy + prompt de imagen
            </>
          )}
        </Button>
      )}

      {/* Copy fields */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Copy específico (opcional)
        </Label>

        <div className="space-y-2">
          <Input
            placeholder="Headline — ej: La comisión visible no es todo"
            value={pieceCopy?.headline ?? ''}
            onChange={(e) => onCopyFieldChange('headline', e.target.value)}
            disabled={disabled}
            className="text-sm"
          />
          <Textarea
            placeholder="Body — ej: En una transferencia internacional, la comisión que ves rara vez cuenta toda la historia..."
            value={pieceCopy?.body ?? ''}
            onChange={(e) => onCopyFieldChange('body', e.target.value)}
            disabled={disabled}
            rows={2}
            className="text-sm resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="CTA — ej: Pide el desglose completo"
              value={pieceCopy?.cta ?? ''}
              onChange={(e) => onCopyFieldChange('cta', e.target.value)}
              disabled={disabled}
              className="text-sm"
            />
            <Input
              placeholder="Punchline (opcional)"
              value={pieceCopy?.punchline ?? ''}
              onChange={(e) => onCopyFieldChange('punchline', e.target.value)}
              disabled={disabled}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Image type selector */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Tipo de imagen
        </Label>

        <div className="flex gap-2">
          {IMAGE_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = pieceImagePrompt?.type === option.value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => onImageTypeChange(option.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Text-in-image toggle */}
      {onTextInImageChange && (
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Texto en la imagen
          </Label>
          <div className="flex gap-2">
            {[
              { value: false, label: 'Sin texto', hint: 'El texto lo pone el template' },
              { value: true, label: 'Con texto', hint: 'La IA escribe el headline' },
            ].map((opt) => {
              const isSelected = textInImage === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={disabled}
                  title={opt.hint}
                  onClick={() => onTextInImageChange(opt.value)}
                  className={cn(
                    'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Image prompt */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Prompt de imagen (opcional)
        </Label>
        <Textarea
          placeholder="Describe la imagen que quieres — ej: Escena de escritorio financiero premium con un CFO revisando una pantalla de laptop..."
          value={pieceImagePrompt?.prompt ?? ''}
          onChange={(e) => onImagePromptChange(e.target.value)}
          disabled={disabled}
          rows={3}
          className="text-sm resize-none"
        />
      </div>
    </div>
  );
}
