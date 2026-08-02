/**
 * CopyBankPanel — Stage A of the Design Studio flow.
 *
 * Shows the persistent bank of generated copy candidates (backed by
 * `generated_ideas`, source='design_studio'). The user "palomea" (checks) ONE
 * candidate to make it active — that copy then feeds Stage B (visual + image).
 * Non-active candidates stay saved until deleted. When candidates span more
 * than one industry (Industria = Auto), a filter chip row appears.
 *
 * Recycles the card/selection/delete pattern from IdeasPanel, but single-select
 * instead of multi-select.
 */

import { useMemo, useState } from 'react';
import { Check, Trash2, Sparkles, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CopyBankItem } from '@/hooks/useDesignCopyBank';
import { DESIGN_STUDIO_IMAGE_PROMPT_REVISION } from '@/types/design-studio';

interface CopyBankPanelProps {
  items: CopyBankItem[];
  activeId: string | null;
  isLoading?: boolean;
  onSelectActive: (item: CopyBankItem) => void;
  onDelete: (id: string) => void;
  /** Rate a copy: 'liked' steers new batches to imitate it, 'disliked' avoids
   *  it. Passing the same rating again clears it (toggle). */
  onRate: (item: CopyBankItem, rating: 'liked' | 'disliked') => void;
}

const ALL = '__all__';

export function CopyBankPanel({
  items,
  activeId,
  isLoading = false,
  onSelectActive,
  onDelete,
  onRate,
}: CopyBankPanelProps) {
  const [industryFilter, setIndustryFilter] = useState<string>(ALL);

  // Distinct industries present in the bank (for the filter chips).
  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const name = it.meta.industryName?.trim();
      if (name) set.add(name);
    }
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (industryFilter === ALL) return items;
    return items.filter((it) => (it.meta.industryName?.trim() ?? '') === industryFilter);
  }, [items, industryFilter]);

  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Cargando banco de copys...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-6 text-center">
        <Sparkles className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Aún no hay copys en el banco. Genera 4 arriba para empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Banco de copys ({items.length})
        </h3>
        {activeId && (
          <span className="text-xs text-muted-foreground">
            1 activo — se usa abajo para la imagen
          </span>
        )}
      </div>

      {/* Industry filter — only when the bank spans multiple industries */}
      {industries.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <FilterChip
            label="Todas"
            active={industryFilter === ALL}
            onClick={() => setIndustryFilter(ALL)}
          />
          {industries.map((name) => (
            <FilterChip
              key={name}
              label={name}
              active={industryFilter === name}
              onClick={() => setIndustryFilter(name)}
            />
          ))}
        </div>
      )}

      {/* Candidate cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(({ row, meta }) => {
          const isActive = row.id === activeId;
          const promptIsCurrent = meta.imagePromptRevision === DESIGN_STUDIO_IMAGE_PROMPT_REVISION;
          return (
            <Card
              key={row.id}
              onClick={() => onSelectActive({ row, meta })}
              className={cn(
                'transition-all cursor-pointer',
                isActive
                  ? 'border-2 border-[#FF7A4A] bg-[#FF7A4A]/5 shadow-md'
                  : 'border border-border hover:border-muted-foreground/30 hover:shadow-sm',
              )}
            >
              <CardContent className="p-4 space-y-2.5">
                {/* Status row */}
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    className={cn(
                      'text-xs',
                      isActive
                        ? 'bg-[#FF7A4A] text-white'
                        : 'bg-emerald-100 text-emerald-700',
                    )}
                  >
                    {isActive ? '✓ Activo' : 'Guardado'}
                  </Badge>
                  <div className="flex items-center gap-1.5">
                    {meta.industryName && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {meta.industryName}
                      </Badge>
                    )}
                    {meta.angleName && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {meta.angleName}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Headline */}
                <h4 className="font-bold text-foreground leading-tight">
                  {row.headline}
                </h4>

                {/* Subcopy */}
                {row.subcopy && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {row.subcopy}
                  </p>
                )}

                {/* CTA */}
                {row.cta && (
                  <div className="inline-block bg-muted text-foreground text-xs font-medium px-3 py-1 rounded-md">
                    {row.cta}
                  </div>
                )}

                {/* Image-prompt status hint */}
                {meta.imagePrompt && (
                  <p className={cn(
                    'text-[11px] italic',
                    promptIsCurrent ? 'text-muted-foreground' : 'text-amber-700',
                  )}>
                    {promptIsCurrent
                      ? `Prompt de imagen listo (${meta.imageType ?? 'foto'})`
                      : `Prompt anterior — regenera (${meta.imageType ?? 'foto'})`}
                  </p>
                )}

                {/* Actions */}
                <div
                  className="flex items-center gap-1.5 pt-2 border-t"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onSelectActive({ row, meta })}
                    className={cn(isActive && 'bg-[#FF7A4A] hover:bg-[#E85A2C]')}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    {isActive ? 'Activo' : 'Usar este'}
                  </Button>

                  {/* Feedback: like / dislike (toggle) */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRate({ row, meta }, 'liked')}
                    title="Me gusta — imita este tono en las próximas"
                    className={cn(
                      'px-2',
                      meta.rating === 'liked'
                        ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-muted-foreground hover:text-emerald-600',
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRate({ row, meta }, 'disliked')}
                    title="No me gusta — evita este estilo"
                    className={cn(
                      'px-2',
                      meta.rating === 'disliked'
                        ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                        : 'text-muted-foreground hover:text-amber-600',
                    )}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(row.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto"
                    title="Eliminar del banco"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
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
      className={cn(
        'rounded-full px-3 py-1 text-xs font-medium transition-colors border',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-foreground border-input hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}
