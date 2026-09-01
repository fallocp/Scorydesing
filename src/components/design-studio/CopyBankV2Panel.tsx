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
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Images,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import {
  angleLabelOf,
  applyCopyBankFilters,
  branchLabel,
  businessSideLabel,
  copyBankProgress,
  COPY_BANK_TAB_LABELS,
  COPY_BANK_TAB_ORDER,
  corridorLabel,
  DEFAULT_COPY_BANK_FILTERS,
  matchesCopyBankTab,
  type CopyBankFilters,
  type CopyBankRow,
  type CopyBankTab,
} from '@/types/copy-bank';
import { useCopyBankView } from '@/hooks/useCopyBankV2';

interface CopyBankV2PanelProps {
  rows: CopyBankRow[];
  isLoading?: boolean;
  activeId: string | null;
  onSelect: (row: CopyBankRow) => void;
  onToggleUsed: (row: CopyBankRow) => void;
  isTogglingUsed?: boolean;
  /**
   * Approve or reject an agent proposal. Only reachable from the "Propuestas"
   * tab: the seeded library arrived pre-approved, so there is nothing to decide
   * about it and offering the choice there would only invite mistakes.
   */
  onReview?: (row: CopyBankRow, status: 'approved' | 'rejected') => void;
  isReviewing?: boolean;
  /** Shown as an empty-state hint when the bank has no rows at all. */
  emptyHint?: string;
}

/**
 * Cards per page.
 *
 * Fixed pages rather than an accumulating "ver más": the bank is in the hundreds,
 * and appending ten more cards per click grew the panel into an endless vertical
 * scroll. A page keeps the panel the same height no matter how deep you go.
 */
const PAGE_SIZE = 10;

/**
 * Baseline for the chip filters inside a tab.
 *
 * `usage` is forced to 'all' because the tabs now own that axis — leaving the
 * default 'available' would silently hide the used copies inside the "Usados"
 * tab, which is empty by definition then.
 */
const PANEL_BASE_FILTERS: CopyBankFilters = {
  ...DEFAULT_COPY_BANK_FILTERS,
  usage: 'all',
};

export function CopyBankV2Panel({
  rows,
  isLoading = false,
  activeId,
  onSelect,
  onToggleUsed,
  isTogglingUsed = false,
  onReview,
  isReviewing = false,
  emptyHint,
}: CopyBankV2PanelProps) {
  const [filters, setFilters] = useState<CopyBankFilters>(PANEL_BASE_FILTERS);
  const [tab, setTab] = useState<CopyBankTab>('bank');
  const [page, setPage] = useState(0);

  // The tab narrows the population; the chips narrow within it.
  const tabRows = useMemo(
    () => rows.filter((r) => matchesCopyBankTab(r, tab)),
    [rows, tab],
  );

  const { visible, counts } = useCopyBankView(tabRows, filters);

  /**
   * Tab counts are computed over the rows that pass the CHIP filters, so they
   * answer "how many would I see if I clicked this tab right now" instead of a
   * global number that contradicts the list.
   */
  const tabCounts = useMemo(() => {
    const scoped = applyCopyBankFilters(rows, filters);
    return COPY_BANK_TAB_ORDER.reduce(
      (acc, t) => {
        acc[t] = scoped.filter((r) => matchesCopyBankTab(r, t)).length;
        return acc;
      },
      {} as Record<CopyBankTab, number>,
    );
  }, [rows, filters]);

  /** Usage progress is a property of the whole bank, not of the visible tab. */
  const bankUsage = useMemo(() => {
    const total = rows.filter((r) => r.status !== 'proposed').length;
    const used = rows.filter((r) => r.status !== 'proposed' && r.used_at).length;
    return { total, used, available: total - used };
  }, [rows]);

  const patch = (p: Partial<CopyBankFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(0);
  };

  const selectTab = (next: CopyBankTab) => {
    setTab(next);
    setPage(0);
  };

  const isFiltered = useMemo(
    () =>
      filters.branch !== null ||
      filters.corridor !== null ||
      filters.angleTag !== null ||
      filters.industry !== null ||
      filters.search !== '',
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

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = visible.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Header + progreso */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Banco de copys
          <span className="ml-2 font-normal text-muted-foreground">
            {visible.length} en {COPY_BANK_TAB_LABELS[tab].toLowerCase()}
          </span>
        </h3>
        <p className="text-xs text-muted-foreground">
          {bankUsage.available} sin usar · {bankUsage.used} usados
        </p>
      </div>

      {/* Barra de progreso de uso */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={bankUsage.used}
        aria-valuemin={0}
        aria-valuemax={bankUsage.total}
        aria-label={`${bankUsage.used} de ${bankUsage.total} copys usados`}
      >
        <div
          className="h-full rounded-full bg-[#2ED4C7] transition-all"
          style={{
            width: bankUsage.total > 0 ? `${(bankUsage.used / bankUsage.total) * 100}%` : '0%',
          }}
        />
      </div>

      {/* Pestañas: aprobación, trabajo y publicación son ejes distintos */}
      <div
        role="tablist"
        aria-label="Vistas del banco de copys"
        className="flex flex-wrap items-center gap-1 border-b border-border"
      >
        {COPY_BANK_TAB_ORDER.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(t)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-[#FF7A4A] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {COPY_BANK_TAB_LABELS[t]}
              <span
                className={cn(
                  'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]',
                  active ? 'bg-[#FF7A4A]/15 text-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {tabCounts[t]}
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'proposed' && tabCounts.proposed > 0 && (
        <p className="text-xs text-amber-700">
          Copys recién generados. Apruébalos para que pasen al banco, o descártalos.
        </p>
      )}

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
                setFilters(PANEL_BASE_FILTERS);
                setPage(0);
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>

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

        {counts.businessSides.length > 0 && (
          <ChipRow
            label="Operación"
            options={counts.businessSides.map((s) => ({
              value: s.value,
              label: `${businessSideLabel(s.value)} (${s.count})`,
            }))}
            selected={filters.businessSide}
            onSelect={(v) => patch({ businessSide: v })}
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
                onReview={onReview}
                isReviewing={isReviewing}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 0}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {safePage + 1} de {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPage(safePage + 1)}
                disabled={safePage >= pageCount - 1}
              >
                Siguiente
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
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
  onReview,
  isReviewing,
}: {
  row: CopyBankRow;
  isActive: boolean;
  onSelect: () => void;
  onToggleUsed: () => void;
  isTogglingUsed: boolean;
  onReview?: (row: CopyBankRow, status: 'approved' | 'rejected') => void;
  isReviewing: boolean;
}) {
  const isUsed = !!row.used_at;
  const progress = copyBankProgress(row);

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'cursor-pointer transition-all',
        isActive
          ? 'border-2 border-[#FF7A4A] bg-[#FF7A4A]/10 shadow-md ring-2 ring-[#FF7A4A]/20'
          : 'border border-border hover:border-muted-foreground/30 hover:shadow-sm',
        // A copy in progress stays legible: it is the one you are most likely to
        // come back to. Only the published ones fade.
        isUsed && !isActive && 'opacity-60',
        !isActive && progress.started && 'border-[#FF7A4A]/40',
      )}
    >
      <CardContent className="space-y-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {isActive && (
              <Badge className="bg-[#FF7A4A] text-xs text-white">✓ Trabajando</Badge>
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
            {/* Work state, read off image_meta: what already exists for this copy. */}
            {progress.hasImagePrompt && (
              <Badge
                variant="outline"
                className="gap-1 border-[#2ED4C7]/50 text-[10px] font-normal text-foreground"
              >
                <Wand2 className="h-3 w-3" />
                Prompt listo
              </Badge>
            )}
            {progress.carouselTotal > 0 && (
              <Badge
                variant="outline"
                className="gap-1 border-[#2ED4C7]/50 text-[10px] font-normal text-foreground"
              >
                <Images className="h-3 w-3" />
                Carrusel {progress.carouselDone}/{progress.carouselTotal}
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
        </div>

        {row.needs_legal_note && row.legal_note && (
          <p className="border-l-2 border-amber-300 pl-2 text-[10px] italic leading-snug text-amber-700">
            {row.legal_note}
          </p>
        )}

        {/* Triage of a proposal: decide before it becomes part of the library. */}
        {row.status === 'proposed' && onReview && (
          <div
            className="flex items-center gap-1.5 border-t pt-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={isReviewing}
              onClick={() => onReview(row, 'approved')}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              <CircleCheck className="mr-1 h-3.5 w-3.5" />
              Aprobar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isReviewing}
              onClick={() => onReview(row, 'rejected')}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Descartar
            </Button>
          </div>
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
            {isActive ? 'Trabajando' : 'Usar este'}
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
