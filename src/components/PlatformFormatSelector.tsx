import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { PlatformFormat } from '@/types/xendingDesign';
import { PLATFORM_DIMENSIONS } from '@/types/xendingDesign';

const PLATFORM_OPTIONS: {
  value: PlatformFormat;
  label: string;
}[] = [
  { value: 'instagram-story', label: 'Story' },
  { value: 'instagram-post', label: 'Post Cuadrado' },
  { value: 'linkedin-post', label: 'LinkedIn / Horizontal' },
  { value: 'banner', label: 'Banner / Presentación' },
];

interface PlatformFormatSelectorProps {
  value: PlatformFormat[];
  onChange: (platforms: PlatformFormat[]) => void;
}

export function PlatformFormatSelector({ value, onChange }: PlatformFormatSelectorProps) {
  const handleToggle = (platform: PlatformFormat, checked: boolean) => {
    if (checked) {
      onChange([...value, platform]);
    } else {
      onChange(value.filter((p) => p !== platform));
    }
  };

  return (
    <div className="space-y-3">
      {PLATFORM_OPTIONS.map((option) => {
        const dims = PLATFORM_DIMENSIONS[option.value];
        const isChecked = value.includes(option.value);
        return (
          <div key={option.value} className="flex items-center gap-3">
            <Checkbox
              id={`platform-${option.value}`}
              checked={isChecked}
              onCheckedChange={(checked) =>
                handleToggle(option.value, checked === true)
              }
            />
            <Label
              htmlFor={`platform-${option.value}`}
              className="flex items-center gap-2 cursor-pointer text-sm"
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-muted-foreground">
                ({dims.width}×{dims.height})
              </span>
            </Label>
          </div>
        );
      })}
    </div>
  );
}
