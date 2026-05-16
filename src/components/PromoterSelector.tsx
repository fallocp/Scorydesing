import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { Promoter } from '@/types/xendingDesign';

/**
 * Static promoter list matching xending-design/assets/shared/promoters.json.
 * Kept in sync manually — the standalone project is the source of truth.
 */
const PROMOTERS: Promoter[] = [
  {
    key: 'juan-perez',
    fullName: 'Juan Pérez',
    role: 'Promotor Senior',
    email: 'juan@xendinglobal.com',
    phone: '+52 55 1234 5678',
    photoFile: 'juan-perez.jpg',
    qrCodeFile: 'juan-perez-qr.png',
  },
];

interface PromoterSelectorProps {
  value: string[];
  onChange: (selected: string[]) => void;
}

export function PromoterSelector({ value, onChange }: PromoterSelectorProps) {
  const allKeys = PROMOTERS.map((p) => p.key);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => value.includes(k));

  const handleToggleAll = (checked: boolean) => {
    onChange(checked ? [...allKeys] : []);
  };

  const handleToggle = (key: string, checked: boolean) => {
    if (checked) {
      onChange([...value, key]);
    } else {
      onChange(value.filter((k) => k !== key));
    }
  };

  return (
    <div className="space-y-3">
      {/* Select all */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <Checkbox
          id="promoter-all"
          checked={allSelected}
          onCheckedChange={(checked) => handleToggleAll(checked === true)}
        />
        <Label htmlFor="promoter-all" className="font-semibold cursor-pointer">
          Todos los promotores
        </Label>
      </div>

      {/* Individual promoters */}
      <div className="space-y-2">
        {PROMOTERS.map((promoter) => {
          const isChecked = value.includes(promoter.key);
          return (
            <div key={promoter.key} className="flex items-center gap-3">
              <Checkbox
                id={`promoter-${promoter.key}`}
                checked={isChecked}
                onCheckedChange={(checked) =>
                  handleToggle(promoter.key, checked === true)
                }
              />
              <Label
                htmlFor={`promoter-${promoter.key}`}
                className="flex flex-col cursor-pointer"
              >
                <span className="text-sm font-medium">{promoter.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {promoter.role}
                </span>
              </Label>
            </div>
          );
        })}
      </div>

      {value.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {value.length} promotor{value.length !== 1 ? 'es' : ''} seleccionado{value.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
