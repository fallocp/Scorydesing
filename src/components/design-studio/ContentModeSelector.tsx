/**
 * ContentModeSelector — Selects how content context is provided to image generation.
 *
 * Three modes:
 * - Libre: No content constraints, full creative freedom
 * - Rama comercial: Pre-approved ingredients from a commercial branch
 * - Idea propia: User writes a free-text description of what they want
 */

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, GitBranch, Lightbulb } from 'lucide-react';
import type { ContentMode } from '@/types/design-studio';
import type { DesignStudioBranch } from '@/hooks/useDesignStudioBranches';

interface ContentModeSelectorProps {
  contentMode: ContentMode;
  selectedBranchSlug: string | null;
  customIdea: string | null;
  branches: DesignStudioBranch[];
  isLoadingBranches: boolean;
  onModeChange: (mode: ContentMode) => void;
  onBranchSelect: (slug: string | null) => void;
  onCustomIdeaChange: (idea: string) => void;
  disabled?: boolean;
}

const MODE_OPTIONS: { value: ContentMode; label: string; icon: typeof Sparkles; description: string }[] = [
  {
    value: 'free',
    label: 'Libre',
    icon: Sparkles,
    description: 'Sin contexto de contenido. Libertad creativa total.',
  },
  {
    value: 'branch',
    label: 'Rama comercial',
    icon: GitBranch,
    description: 'Usa headlines, datos y CTAs pre-aprobados de una rama.',
  },
  {
    value: 'custom',
    label: 'Idea propia',
    icon: Lightbulb,
    description: 'Describe lo que quieres y GPT lo interpreta.',
  },
];

export function ContentModeSelector({
  contentMode,
  selectedBranchSlug,
  customIdea,
  branches,
  isLoadingBranches,
  onModeChange,
  onBranchSelect,
  onCustomIdeaChange,
  disabled = false,
}: ContentModeSelectorProps) {
  // Group branches by category
  const branchesByCategory = branches.reduce<Record<string, DesignStudioBranch[]>>((acc, branch) => {
    const category = branch.category_name ?? 'Sin categoría';
    if (!acc[category]) acc[category] = [];
    acc[category].push(branch);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Label className="text-sm font-semibold text-foreground">Contenido</Label>

      {/* Mode tabs */}
      <div className="flex gap-2">
        {MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = contentMode === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onModeChange(option.value)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                isSelected
                  ? 'bg-primary/10 text-primary border-primary/30 shadow-sm'
                  : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Mode description */}
      <p className="text-xs text-muted-foreground">
        {MODE_OPTIONS.find((o) => o.value === contentMode)?.description}
      </p>

      {/* Branch selector (only when mode === 'branch') */}
      {contentMode === 'branch' && (
        <div className="space-y-3 pt-2">
          {isLoadingBranches ? (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-28 rounded-full" />
              ))}
            </div>
          ) : branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay ramas comerciales configuradas para este negocio.
            </p>
          ) : (
            Object.entries(branchesByCategory).map(([category, categoryBranches]) => (
              <div key={category} className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {category}
                </span>
                <div className="flex flex-wrap gap-2">
                  {categoryBranches.map((branch) => {
                    const isSelected = selectedBranchSlug === branch.slug;

                    return (
                      <button
                        key={branch.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onBranchSelect(isSelected ? null : branch.slug)}
                        className={cn(
                          'inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                          'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-input hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        {branch.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Custom idea textarea (only when mode === 'custom') */}
      {contentMode === 'custom' && (
        <div className="pt-2">
          <Textarea
            placeholder="Describe tu idea... Ej: 'Quiero una pieza con tabla comparativa de tasas, persona sonriendo, y el headline Tu dinero vale más con nosotros'"
            value={customIdea ?? ''}
            onChange={(e) => onCustomIdeaChange(e.target.value)}
            disabled={disabled}
            rows={3}
            className="resize-none"
          />
        </div>
      )}
    </div>
  );
}
