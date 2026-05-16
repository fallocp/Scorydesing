/**
 * ContentLibraryFilters — Filter bar for the Content Library page.
 *
 * Provides selects for: rama comercial, ángulo narrativo, funnel stage, status,
 * and a text search input.
 *
 * Requirements: 8.7
 */

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentLibraryFilterValues {
  branchId: string;
  narrativeAngleId: string;
  funnelStage: string;
  status: string;
  search: string;
}

interface ContentLibraryFiltersProps {
  filters: ContentLibraryFilterValues;
  onChange: (filters: ContentLibraryFilterValues) => void;
  branches?: Array<{ id: string; name: string }>;
  angles?: Array<{ id: string; name: string; funnel_stage: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FUNNEL_STAGE_OPTIONS = [
  { value: 'atraccion', label: 'Atracción', color: 'bg-green-100 text-green-800' },
  { value: 'conexion', label: 'Conexión', color: 'bg-blue-100 text-blue-800' },
  { value: 'conversion', label: 'Conversión', color: 'bg-red-100 text-red-800' },
] as const;

const STATUS_OPTIONS = [
  { value: 'generated', label: 'Generada' },
  { value: 'approved', label: 'Aprobada' },
  { value: 'image_selected', label: 'Con imagen' },
  { value: 'channels_adapted', label: 'Canales adaptados' },
  { value: 'rendered', label: 'Renderizada' },
  { value: 'scheduled', label: 'Programada' },
  { value: 'published', label: 'Publicada' },
] as const;

const ALL_VALUE = '__all__';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ContentLibraryFilters({
  filters,
  onChange,
  branches = [],
  angles = [],
}: ContentLibraryFiltersProps) {
  const update = (partial: Partial<ContentLibraryFilterValues>) =>
    onChange({ ...filters, ...partial });

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-3">
      {/* Text search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por headline..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="pl-9"
        />
      </div>

      {/* Branch filter */}
      <Select
        value={filters.branchId || ALL_VALUE}
        onValueChange={(v) => update({ branchId: v === ALL_VALUE ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Rama comercial" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas las ramas</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Narrative angle filter */}
      <Select
        value={filters.narrativeAngleId || ALL_VALUE}
        onValueChange={(v) => update({ narrativeAngleId: v === ALL_VALUE ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Ángulo narrativo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos los ángulos</SelectItem>
          {angles.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Funnel stage filter */}
      <Select
        value={filters.funnelStage || ALL_VALUE}
        onValueChange={(v) => update({ funnelStage: v === ALL_VALUE ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[170px]">
          <SelectValue placeholder="Etapa de funnel" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas las etapas</SelectItem>
          {FUNNEL_STAGE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${opt.color}`}>
                  {opt.label}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select
        value={filters.status || ALL_VALUE}
        onValueChange={(v) => update({ status: v === ALL_VALUE ? '' : v })}
      >
        <SelectTrigger className="w-full sm:w-[170px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todos los status</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
