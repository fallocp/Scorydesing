import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Static partner list matching xending-design/assets/shared/partners.json
 */
const PARTNERS = [
  { key: 'monex-usa', name: 'Monex USA' },
  { key: 'ping-pong', name: 'Ping Pong' },
  { key: 'none', name: 'Sin partner' },
] as const;

interface PartnerSelectorProps {
  value: string;
  onChange: (partner: string) => void;
}

export function PartnerSelector({ value, onChange }: PartnerSelectorProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Seleccionar partner" />
      </SelectTrigger>
      <SelectContent>
        {PARTNERS.map((partner) => (
          <SelectItem key={partner.key} value={partner.key}>
            {partner.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
