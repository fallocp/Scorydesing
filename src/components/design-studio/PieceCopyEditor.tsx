/**
 * PieceCopyEditor — Editable copy fields + image type/prompt for Design Studio.
 *
 * Shows when contentMode === 'branch' and allows the user to:
 * - Generate copy automatically from the branch (calls generate-ideas)
 * - Edit specific copy (headline, body, CTA, punchline)
 * - Select image type (Foto, Infografía, Inf Rutas y Mapas)
 * - Edit the image prompt
 *
 * These fields are optional — if empty, the branch ingredients are used as fallback.
 */

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Camera, BarChart3, TrendingUp, Sparkles, Loader2, Save } from 'lucide-react';
import type {
  CorridorFlowType,
  CorridorMode,
  CorridorOverride,
  DesignImageType,
  PieceCopy,
  PieceImagePrompt,
} from '@/types/design-studio';
import { DESIGN_IMAGE_TYPE_OPTIONS } from '@/utils/design-studio/masterImagePrompt';

interface PieceCopyEditorProps {
  pieceCopy: PieceCopy | null;
  pieceImagePrompt: PieceImagePrompt | null;
  onCopyFieldChange: (field: keyof PieceCopy, value: string) => void;
  onImageTypeChange: (type: DesignImageType) => void;
  onImagePromptChange: (text: string) => void;
  corridorOverride?: CorridorOverride;
  onCorridorOverrideChange?: (corridor: CorridorOverride) => void;
  textInImage?: boolean;
  onTextInImageChange?: (value: boolean) => void;
  onGenerateCopy?: () => Promise<void>;
  isGeneratingCopy?: boolean;
  /** Label for the generate button. Defaults to the copy+image label. */
  generateButtonLabel?: string;
  /** Loading label for the generate button. */
  generateButtonLoadingLabel?: string;
  /** When true, hides the copy fields (headline/body/cta) — used in Stage B
   *  where copy is fixed by the active bank candidate. */
  hideCopyFields?: boolean;
  /** When provided, shows a "Guardar copy" button under the copy fields that
   *  persists the edited copy back to the bank before generating the image. */
  onSaveCopy?: () => void;
  isSavingCopy?: boolean;
  disabled?: boolean;
}

/**
 * Los tres medios, con las etiquetas compartidas con el carrusel. Aquí solo se les
 * pega el icono: los nombres y las descripciones viven en un único lugar para que
 * los dos selectores de la página no puedan llamar distinto al mismo valor.
 */
const IMAGE_TYPE_ICONS: Record<DesignImageType, typeof Camera> = {
  foto: Camera,
  infografia: BarChart3,
  financiero: TrendingUp,
};

const IMAGE_TYPE_OPTIONS = DESIGN_IMAGE_TYPE_OPTIONS.map((option) => ({
  ...option,
  icon: IMAGE_TYPE_ICONS[option.value],
}));

const DEFAULT_CORRIDOR_OVERRIDE: CorridorOverride = {
  mode: 'auto',
  flowType: 'auto',
  originCountry: '',
  destinationCountry: '',
};

const CORRIDOR_MODE_OPTIONS: { value: CorridorMode; label: string }[] = [
  { value: 'auto', label: 'Automático según el copy' },
  { value: 'geographic_corridor', label: 'Corredor geográfico' },
  { value: 'operational_route', label: 'Ruta operativa 3D' },
  { value: 'global_network', label: 'Red global' },
  { value: 'bidirectional_corridor', label: 'Corredor bidireccional' },
];

const CORRIDOR_FLOW_OPTIONS: { value: CorridorFlowType; label: string }[] = [
  { value: 'auto', label: 'Detectar flujo' },
  { value: 'payment', label: 'Pago' },
  { value: 'goods', label: 'Mercancía' },
  { value: 'bidirectional', label: 'Bidireccional' },
];

export function PieceCopyEditor({
  pieceCopy,
  pieceImagePrompt,
  onCopyFieldChange,
  onImageTypeChange,
  onImagePromptChange,
  corridorOverride,
  onCorridorOverrideChange,
  textInImage = false,
  onTextInImageChange,
  onGenerateCopy,
  isGeneratingCopy = false,
  generateButtonLabel = 'Generar copy + prompt de imagen',
  generateButtonLoadingLabel = 'Generando copy e imagen...',
  hideCopyFields = false,
  onSaveCopy,
  isSavingCopy = false,
  disabled = false,
}: PieceCopyEditorProps) {
  const resolvedCorridor = corridorOverride ?? DEFAULT_CORRIDOR_OVERRIDE;

  const updateCorridor = (patch: Partial<CorridorOverride>) => {
    onCorridorOverrideChange?.({ ...resolvedCorridor, ...patch });
  };

  return (
    <div className="space-y-5 rounded-lg border border-border/50 bg-muted/30 p-4">
      {/* Copy fields */}
      {!hideCopyFields && (
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

          {onSaveCopy && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onSaveCopy}
              disabled={disabled || isSavingCopy || !pieceCopy?.headline?.trim()}
              className="w-full"
            >
              {isSavingCopy ? (
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
          )}
        </div>
      </div>
      )}

      {/* Image type selector.
          Dice "de la imagen individual" a propósito: el carrusel tiene su propio
          selector más abajo y son independientes, así que un título genérico como
          "Tipo de imagen" hacía pensar que este mandaba en todo. */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Estilo visual de la imagen individual
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

        <p className="text-[11px] text-muted-foreground">
          {IMAGE_TYPE_OPTIONS.find((o) => o.value === pieceImagePrompt?.type)?.hint
            ?? 'Elige el medio antes de generar el prompt de imagen.'}
        </p>
      </div>

      {/* Corridor resolver override — only relevant to mapa/rutas. */}
      {pieceImagePrompt?.type === 'financiero' && onCorridorOverrideChange && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/70 p-3">
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Ruta geográfica
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Automático lee el copy. Define países solo cuando quieras forzar el corredor.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              Modo
              <select
                value={resolvedCorridor.mode}
                onChange={(event) => updateCorridor({ mode: event.target.value as CorridorMode })}
                disabled={disabled}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {CORRIDOR_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-muted-foreground">
              Flujo
              <select
                value={resolvedCorridor.flowType}
                onChange={(event) => updateCorridor({ flowType: event.target.value as CorridorFlowType })}
                disabled={disabled}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {CORRIDOR_FLOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={resolvedCorridor.originCountry}
              onChange={(event) => updateCorridor({ originCountry: event.target.value })}
              disabled={disabled || resolvedCorridor.mode === 'operational_route' || resolvedCorridor.mode === 'global_network'}
              placeholder="Origen — ej. China"
              className="text-sm"
            />
            <Input
              value={resolvedCorridor.destinationCountry}
              onChange={(event) => updateCorridor({ destinationCountry: event.target.value })}
              disabled={disabled || resolvedCorridor.mode === 'operational_route' || resolvedCorridor.mode === 'global_network'}
              placeholder="Destino — ej. México"
              className="text-sm"
            />
          </div>
        </div>
      )}

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

      {/* Generate image prompt button — at the bottom so the flow reads
          edit copy → save → choose visual → generate. */}
      {onGenerateCopy && (
        <Button
          type="button"
          onClick={onGenerateCopy}
          disabled={disabled || isGeneratingCopy}
          className="w-full"
        >
          {isGeneratingCopy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {generateButtonLoadingLabel}
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              {generateButtonLabel}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
