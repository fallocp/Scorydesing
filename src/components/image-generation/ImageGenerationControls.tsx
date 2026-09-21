import { useId } from 'react';
import { IMAGE_MODELS, IMAGE_MODEL_LABELS, IMAGE_QUALITIES, type ImageGenerationSettings, type ImageModel, type ImageQuality } from '@/lib/imageGenerationSettings';

export interface ImageGenerationControlsProps {
  value: ImageGenerationSettings;
  onChange(value: ImageGenerationSettings): void;
  disabled?: boolean;
  className?: string;
  availableModels?: readonly ImageModel[];
  availableQualities?: readonly ImageQuality[];
}
export function ImageGenerationControls({ value, onChange, disabled, className = '', availableModels, availableQualities }: ImageGenerationControlsProps) {
  const id = useId();
  const selectClass = 'min-w-0 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60';
  return <div className={`grid grid-cols-2 gap-3 ${className}`} role="group" aria-label="Generación de imágenes">
    <label htmlFor={`${id}-model`} className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground"><span>Modelo</span>
      <select id={`${id}-model`} aria-label="Modelo de imagen" value={value.model} disabled={disabled} className={selectClass}
        onChange={event => onChange({ ...value, model: event.target.value as ImageModel })}>
        {IMAGE_MODELS.map(model => <option key={model} value={model} disabled={!!availableModels && !availableModels.includes(model)}>{IMAGE_MODEL_LABELS[model]}</option>)}
      </select></label>
    <label htmlFor={`${id}-quality`} className="min-w-0 space-y-1 text-xs font-medium text-muted-foreground"><span>Calidad</span>
      <select id={`${id}-quality`} aria-label="Calidad de imagen" value={value.quality} disabled={disabled} className={selectClass}
        onChange={event => onChange({ ...value, quality: event.target.value as ImageQuality })}>
        {IMAGE_QUALITIES.map(quality => <option key={quality} value={quality} disabled={!!availableQualities && !availableQualities.includes(quality)}>{quality[0].toUpperCase() + quality.slice(1)}</option>)}
      </select></label>
  </div>;
}
