import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ContentType } from '@/types/xendingDesign';

const CONTENT_TYPE_OPTIONS: {
  value: ContentType;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: 'breaking-news',
    label: 'Noticias Urgentes',
    description: 'Eventos urgentes del mercado, decisiones de tasas, cambios regulatorios',
    icon: '⚡',
  },
  {
    value: 'market-update',
    label: 'Actualización de Mercado',
    description: 'Tasas FX, movimientos de divisas, resúmenes de mercado',
    icon: '📊',
  },
  {
    value: 'corporate',
    label: 'Corporativo',
    description: 'Comunicaciones formales, one-pagers, papelería',
    icon: '🏢',
  },
  {
    value: 'stat-of-the-day',
    label: 'Dato del Día',
    description: 'Métricas clave, logros, grandes números',
    icon: '🔢',
  },
  {
    value: 'tip-educational',
    label: 'Tip / Educativo',
    description: 'Compartir conocimiento, tips de producto, tutoriales',
    icon: '💡',
  },
  {
    value: 'event-special',
    label: 'Evento / Especial',
    description: 'Días festivos, eventos de la industria, hitos',
    icon: '🎉',
  },
];

interface ContentTypeSelectorProps {
  value: ContentType | '';
  onChange: (contentType: ContentType) => void;
}

export function ContentTypeSelector({ value, onChange }: ContentTypeSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ContentType)}>
      <SelectTrigger>
        <SelectValue placeholder="Seleccionar tipo de contenido" />
      </SelectTrigger>
      <SelectContent>
        {CONTENT_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-2">
              <span>{option.icon}</span>
              <span className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
