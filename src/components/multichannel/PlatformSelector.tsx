/**
 * PlatformSelector — checkbox grid for selecting target platforms.
 *
 * Used by the multichannel renderer to let the user pick which platforms
 * to apply the approved idea + image to.
 */

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { PlatformFormat } from '@/hooks/useRenderMultichannel';

interface PlatformOption {
  id: PlatformFormat;
  label: string;
  dimensions: string;
  description: string;
  hasCaption: boolean;
}

const PLATFORM_OPTIONS: PlatformOption[] = [
  {
    id: 'linkedin-post',
    label: 'LinkedIn Post',
    dimensions: '1200×628',
    description: 'Caption ejecutivo, ▪ bullets, sin hashtags',
    hasCaption: true,
  },
  {
    id: 'instagram-post',
    label: 'Instagram Post',
    dimensions: '1080×1080',
    description: 'Caption corto, hashtags B2B',
    hasCaption: true,
  },
  {
    id: 'instagram-story',
    label: 'Instagram Story',
    dimensions: '1080×1920',
    description: 'Sin caption (la pieza es standalone)',
    hasCaption: false,
  },
  {
    id: 'facebook-post',
    label: 'Facebook Post',
    dimensions: '1200×628',
    description: 'Mismo overlay que LinkedIn, caption B2B casual',
    hasCaption: true,
  },
  {
    id: 'banner',
    label: 'Banner (ad)',
    dimensions: '1920×1080',
    description: 'Sin caption, ad standalone',
    hasCaption: false,
  },
];

export interface PlatformSelectorProps {
  selected: PlatformFormat[];
  onChange: (platforms: PlatformFormat[]) => void;
  disabled?: boolean;
}

export function PlatformSelector({ selected, onChange, disabled }: PlatformSelectorProps) {
  const toggle = (platform: PlatformFormat) => {
    if (disabled) return;
    const isSelected = selected.includes(platform);
    onChange(isSelected ? selected.filter((p) => p !== platform) : [...selected, platform]);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Plataformas</Label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {PLATFORM_OPTIONS.map((opt) => {
          const isSelected = selected.includes(opt.id);
          return (
            <label
              key={opt.id}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                isSelected
                  ? 'border-[#2ED4C7] bg-[#2ED4C7]/5'
                  : 'border-border hover:border-muted-foreground/30'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggle(opt.id)}
                disabled={disabled}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-sm">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.dimensions}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
