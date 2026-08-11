/**
 * CopyBankV2Panel — browse and use the v2 copy bank.
 *
 * Built for a bank of a few hundred pre-approved copies rather than a batch of
 * four freshly generated ones, so the interaction is different from
 * CopyBankPanel: filter down (branch → corridor → angle), read, pick one, mark
 * it used once it ships.
 *
 * Picking a copy calls `onSelect`, which sets it as the active candidate exactly
 * like the v1 panel does, so Stage B (image, platform, carousel) is unchanged.
 */

import { useMemo, useState } from 'react';
import {
  Check,
  CircleCheck,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  angleLabelOf,
  branchLabel,
  corridorLabel,
  DEFAULT_COPY_BANK_FILTERS,
  type CopyBankFilters,
  type CopyBankRow,
} from '@/types/copy-bank';
import { useCopyBankView } from '@/hooks/useCopyBankV2';

interface CopyBankV2PanelProps {
  rows: CopyBankRow[];
  isLoading?: boolean;
  activeId: string | null;
  onSelect: (row: CopyBankRow) => void;
  onToggleUsed: (row: CopyBankRow) => void;
  isTogglingUsed?: boolean;
  /** Shown as an empty-state hint when the bank has no rows at all. */
  emptyHint?: string;
}

/**
 * How many cards to show before the "ver más" button.
 *
 * Kept small on purpose: the bank is in the hundreds, and the panel is a
 * reading surface, not a grid to skim. Ten cards fit without scrolling past
 * the filters, so narrowing down beats scrolling down.
 */
const PAGE_SIZE = 10;

export function CopyBankV2Panel({
  rows,
  isLoading = false,
  activeId,
  onSelect,
  onToggleUsed,
  isTogglingUsed = false,
  emptyHint,
}: CopyBankV2PanelProps) {
  const [filters, setFilters] = useState<CopyBankFilters>(DEFAULT_COPY_BANK_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { visible, counts, usage } = useCopyBankView(rows, filters);

  const patch = (p: Partial<CopyBankFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setLimit(PAGE_SIZE);
  };

  const isFiltered = useMemo(
    () =>
      filters.branch !== null ||
      filters.corridor !== null ||
      filters.angleTag !== null ||
      filters.industry !== null ||
      filters.search !== '' ||
      filters.usage !== DEFAULT_COPY_BANK_FILTERS.usage,
    [filters],
  );

  if (isLoading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Cargando banco de copys...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-8 text-center">
        <Sparkles className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          El banco está vacío.
        </p>
        {emptyHint && (
          <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
        )}
      </div>
    );
  }

  const shown = visible.slice(0, limit);

  return (
    <div className="space-y-4">
      {/* Header + progreso */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Banco de copys
          <span className="ml-2 font-normal text-muted-foreground">
            {visible.length} de {rows.length}
          </span>
        </h3>
        <p className="text-xs text-muted-foreground">
          {usage.available} sin usar · {usage.used} usados
        </p>
      </div>

      {/* Barra de progreso de uso */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={usage.used}
        aria-valuemin={0}
        aria-valuemax={usage.total}
        aria-label={`${usage.used} de ${usage.total} copys usados`}
      >
        <div
          className="h-full rounded-full bg-[#2ED4C7] transition-all"
          style={{ width: usage.total > 0 ? `${(usage.used / usage.total) * 100}%` : '0%' }}
        />
      </div>

      {/* Filtros */}
      <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="Buscar en headline, subline o CTA"
              className="h-9 pl-8 text-sm"
              aria-label="Buscar copys"
            />
          </div>
          {isFiltered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters(DEFAULT_COPY_BANK_FILTERS);
                setLimit(PAGE_SIZE);
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>

        <ChipRow
          label="Estado"
          options={[
            { value: 'available', label: `Sin usar (${usage.available})` },
            { value: 'used', label: `Usados (${usage.used})` },
            { value: 'all', label: `Todos (${usage.total})` },
          ]}
          selected={filters.usage}
          onSelect={(v) => patch({ usage: v as CopyBankFilters['usage'] })}
          allowClear={false}
        />

        {counts.branches.length > 1 && (
          <ChipRow
            label="Rama"
            options={counts.branches.map((b) => ({
              value: b.value,
              label: `${branchLabel(b.value)} (${b.count})`,
            }))}
            selected={filters.branch}
            onSelect={(v) => patch({ branch: v, corridor: null, angleTag: null })}
          />
        )}

        {counts.corridors.length > 1 && (
          <ChipRow
            label="Corredor"
            options={counts.corridors.map((c) => ({
              value: c.value,
              label: `${corridorLabel(c.value)} (${c.count})`,
            }))}
            selected={filters.corridor}
            onSelect={(v) => patch({ corridor: v })}
          />
        )}

        {counts.angles.length > 1 && (
          <ChipRow
            label="Ángulo"
            options={counts.angles.map((a) => ({
              value: a.value,
              label: `${a.value.replace(/_/g, ' ')} (${a.count})`,
            }))}
            selected={filters.angleTag}
            onSelect={(v) => patch({ angleTag: v })}
          />
        )}

        {counts.industries.length > 0 && (
          <ChipRow
            label="Industria"
            options={counts.industries.map((i) => ({
              value: i.value,
              label: `${i.value.replace(/_/g, ' ')} (${i.count})`,
            }))}
            selected={filters.industry}
            onSelect={(v) => patch({ industry: v })}
          />
        )}
      </div>

      {/* Resultados */}
      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún copy coincide con estos filtros.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {shown.map((row) => (
              <CopyCard
                key={row.id}
                row={row}
                isActive={row.id === activeId}
                onSelect={() => onSelect(row)}
                onToggleUsed={() => onToggleUsed(row)}
                isTogglingUsed={isTogglingUsed}
              />
            ))}
          </div>

          {visible.length > shown.length && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
            >
              Ver {Math.min(PAGE_SIZE, visible.length - shown.length)} más
              <span className="ml-1.5 text-muted-foreground">
                ({visible.length - shown.length} restantes)
              </span>
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function CopyCard({
  row,
  isActive,
  onSelect,
  onToggleUsed,
  isTogglingUsed,
}: {
  row: CopyBankRow;
  isActive: boolean;
  onSelect: () => void;
  onToggleUsed: () => void;
  isTogglingUsed: boolean;
}) {
  const isUsed = !!row.used_at;
  const hasImagePrompt = !!row.image_meta?.imagePrompt;

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'cursor-pointer transition-all',
        isActive
          ? 'border-2 border-[#FF7A4A] bg-[#FF7A4A]/5 shadow-md'
          : 'border border-border hover:border-muted-foreground/30 hover:shadow-sm',
        isUsed && !isActive && 'opacity-60',
      )}
    >
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {isActive && (
              <Badge className="bg-[#FF7A4A] text-xs text-white">✓ Activo</Badge>
            )}
            {isUsed && (
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                Usado
              </Badge>
            )}
            {row.status === 'proposed' && (
              <Badge className="bg-amber-100 text-[10px] font-normal text-amber-800">
                Por revisar
              </Badge>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <Badge variant="outline" className="text-[10px] font-normal">
              {corridorLabel(row.corridor)}
            </Badge>
          </div>
        </div>

        <h4 className="font-bold leading-tight text-foreground">{row.headline}</h4>

        {row.subcopy && (
          <p className="text-sm leading-relaxed text-muted-foreground">{row.subcopy}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {row.cta && (
            <span className="inline-block rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground">
              {row.cta}
            </span>
          )}
          {row.cta_alt?.length > 0 && (
            <span
              className="text-[11px] text-muted-foreground"
              title={`Alternativas: ${row.cta_alt.join(' · ')}`}
            >
              +{row.cta_alt.length} alt
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{angleLabelOf(row)}</span>
          {row.industry && <span>· {row.industry.replace(/_/g, ' ')}</span>}
          {hasImagePrompt && <span>· prompt de imagen listo</span>}
        </div>

        {row.needs_legal_note && row.legal_note && (
          <p className="border-l-2 border-amber-300 pl-2 text-[10px] italic leading-snug text-amber-700">
            {row.legal_note}
          </p>
        )}

        <div
          className="flex items-center gap-1.5 border-t pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={onSelect}
            className={cn(isActive && 'bg-[#FF7A4A] hover:bg-[#E85A2C]')}
          >
            <Check className="mr-1 h-3 w-3" />
            {isActive ? 'Activo' : 'Usar este'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleUsed}
            disabled={isTogglingUsed}
            title={isUsed ? 'Marcar como disponible otra vez' : 'Marcar como ya publicado'}
            className={cn(
              'ml-auto px-2',
              isUsed
                ? 'text-emerald-600 hover:bg-emerald-50'
                : 'text-muted-foreground hover:text-emerald-600',
            )}
          >
            {isUsed ? (
              <>
                <X className="mr-1 h-3.5 w-3.5" />
                Desmarcar
              </>
            ) : (
              <>
                <CircleCheck className="mr-1 h-3.5 w-3.5" />
                Ya lo usé
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Chips
// ---------------------------------------------------------------------------

function ChipRow({
  label,
  options,
  selected,
  onSelect,
  allowClear = true,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  allowClear?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {allowClear && (
        <Chip label="Todos" active={selected === null} onClick={() => onSelect(null)} />
      )}
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          active={selected === o.value}
          onClick={() => onSelect(allowClear && selected === o.value ? null : o.value)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background text-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}
