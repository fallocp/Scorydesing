import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type {
  CategoryConfig,
  SelectionCategory,
  VisualSelections,
} from '@/types/design-studio';

// --- Category configurations with Spanish labels ---

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'background',
    label: 'Fondo',
    allowCustom: true,
    options: [
      { value: 'dark-navy', label: 'Oscuro/Navy' },
      { value: 'light-cream', label: 'Claro/Cream' },
      { value: 'color-turquoise', label: 'Color/Turquesa' },
    ],
  },
  {
    id: 'visualStyle',
    label: 'Estilo visual',
    allowCustom: true,
    options: [
      { value: 'minimalist', label: 'Minimalista' },
      { value: 'glassmorphism', label: 'Glassmorphism' },
      { value: 'bold', label: 'Bold/Tipográfico' },
      { value: 'financial', label: 'Financiero' },
      { value: 'gradients', label: 'Gradientes' },
      { value: 'hero-photo', label: 'Foto hero' },
    ],
  },
  {
    id: 'contentType',
    label: 'Tipo de contenido',
    allowCustom: true,
    options: [
      { value: 'stat', label: 'Dato/Estadística' },
      { value: 'news', label: 'Noticia' },
      { value: 'educational', label: 'Educativo' },
      { value: 'promo', label: 'Promoción' },
      { value: 'comparison', label: 'Comparativa' },
      { value: 'event', label: 'Evento' },
      { value: 'testimonial', label: 'Testimonial' },
    ],
  },
  {
    id: 'heroElement',
    label: 'Elemento destacado',
    allowCustom: true,
    options: [
      { value: 'big-number', label: 'Número grande' },
      { value: 'main-photo', label: 'Foto principal' },
      { value: 'icon', label: 'Ícono/Ilustración' },
      { value: 'floating-badge', label: 'Badge flotante' },
      { value: 'no-image', label: 'Sin imagen' },
    ],
  },
  {
    id: 'platform',
    label: 'Plataforma base',
    allowCustom: false,
    options: [
      { value: 'instagram-story', label: 'IG Story' },
      { value: 'instagram-post', label: 'IG Post' },
      { value: 'facebook-post', label: 'Facebook' },
      { value: 'linkedin-post', label: 'LinkedIn' },
      { value: 'banner', label: 'Banner' },
    ],
  },
];

const CUSTOM_VALUE = '__custom__';

interface VisualSelectorProps {
  selections: VisualSelections;
  onSelect: (category: SelectionCategory, value: string) => void;
  onCustomValue: (category: SelectionCategory, value: string) => void;
  disabled?: boolean;
}

export function VisualSelector({
  selections,
  onSelect,
  onCustomValue,
  disabled = false,
}: VisualSelectorProps) {
  /**
   * Get the current value for a category from selections.
   * Maps category id to the corresponding field in VisualSelections.
   */
  function getSelectionValue(categoryId: SelectionCategory): string | null {
    return selections[categoryId] ?? null;
  }

  /**
   * Determine if "Otro" is currently selected for a category.
   * "Otro" is selected when the value doesn't match any predefined option.
   */
  function isCustomSelected(config: CategoryConfig): boolean {
    const value = getSelectionValue(config.id);
    if (!value) return false;
    return !config.options.some((opt) => opt.value === value);
  }

  /**
   * Get the custom text value when "Otro" is selected.
   */
  function getCustomText(config: CategoryConfig): string {
    const value = getSelectionValue(config.id);
    if (!value) return '';
    if (config.options.some((opt) => opt.value === value)) return '';
    return value;
  }

  return (
    <div className="space-y-5">
      {CATEGORY_CONFIGS.map((config) => {
        const currentValue = getSelectionValue(config.id);
        const customSelected = isCustomSelected(config);

        return (
          <div key={config.id} className="space-y-2">
            <Label className="text-sm font-semibold text-foreground">
              {config.label}
            </Label>

            <div className="flex flex-wrap gap-2">
              {config.options.map((option) => {
                const isSelected = currentValue === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(config.id, option.value)}
                    className={cn(
                      'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}

              {/* "Otro" pill for categories that allow custom values */}
              {config.allowCustom && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(config.id, CUSTOM_VALUE)}
                  className={cn(
                    'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                    'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    customSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  Otro
                </button>
              )}
            </div>

            {/* Inline text input when "Otro" is selected */}
            {config.allowCustom && customSelected && (
              <Input
                type="text"
                placeholder="Escribe tu opción personalizada..."
                value={getCustomText(config)}
                onChange={(e) => onCustomValue(config.id, e.target.value)}
                disabled={disabled}
                className="mt-2 max-w-xs"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
