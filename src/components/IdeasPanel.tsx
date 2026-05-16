/**
 * IdeasPanel — Displays generated copy ideas/proposals.
 *
 * Toggle approve on each idea (local state + DB sync).
 * "Crear Piezas" button appears when ≥1 idea is selected.
 * Supports persisted ideas from Supabase with status badges and delete.
 */

import { useState, useEffect } from 'react';
import { Sparkles, Check, Copy, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { GeneratedIdeaRow } from '@/hooks/useGeneratedIdeas';

export interface CopyIdea {
  headline: string;
  subcopy: string;
  cta: string;
  angle?: string;
  imageSuggestion?: string;
}

interface IdeasPanelProps {
  persistedIdeas: GeneratedIdeaRow[];
  onToggleStatus: (id: string, newStatus: 'approved' | 'generated') => void;
  onProceed: (approvedIdeas: GeneratedIdeaRow[]) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  generated: { label: 'Generada', className: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Seleccionada', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rechazada', className: 'bg-red-100 text-red-700' },
  used: { label: 'Usada', className: 'bg-purple-100 text-purple-700' },
};

// Angle badge colors — each narrative angle gets a distinct color
const ANGLE_COLORS: Record<string, string> = {
  'caso hipotético': 'bg-amber-100 text-amber-800 border-amber-200',
  'caso hipotetico': 'bg-amber-100 text-amber-800 border-amber-200',
  'dato duro': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'testimonial': 'bg-pink-100 text-pink-800 border-pink-200',
  'costo de no actuar': 'bg-red-100 text-red-800 border-red-200',
  'contraste': 'bg-violet-100 text-violet-800 border-violet-200',
  'pregunta provocadora': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'metáfora': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'metafora': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'analogía': 'bg-teal-100 text-teal-800 border-teal-200',
  'analogia': 'bg-teal-100 text-teal-800 border-teal-200',
  'historia': 'bg-orange-100 text-orange-800 border-orange-200',
  'autoridad': 'bg-slate-100 text-slate-800 border-slate-200',
};

function getAngleColor(angle: string): string {
  const normalized = angle.toLowerCase().trim();
  return ANGLE_COLORS[normalized] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function IdeasPanel({
  persistedIdeas,
  onToggleStatus,
  onProceed,
  onDelete,
  onClear,
}: IdeasPanelProps) {
  const { toast } = useToast();

  // Local selection state — tracks which ideas are selected WITHOUT waiting for DB roundtrip
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Sync local state with DB state on initial load / when persistedIdeas change
  useEffect(() => {
    const dbApproved = new Set(
      persistedIdeas.filter((i) => i.status === 'approved').map((i) => i.id),
    );
    setSelectedIds(dbApproved);
  }, [persistedIdeas]);

  if (persistedIdeas.length === 0) return null;

  const selectedCount = selectedIds.size;

  const handleToggle = (idea: GeneratedIdeaRow) => {
    const isCurrentlySelected = selectedIds.has(idea.id);
    const newStatus = isCurrentlySelected ? 'generated' : 'approved';

    // Update local state immediately (no waiting for DB)
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlySelected) {
        next.delete(idea.id);
      } else {
        next.add(idea.id);
      }
      return next;
    });

    // Sync to DB in background
    onToggleStatus(idea.id, newStatus);
  };

  const handleProceed = () => {
    const approved = persistedIdeas.filter((i) => selectedIds.has(i.id));
    if (approved.length === 0) return;
    onProceed(approved);
  };

  const handleCopyText = (idea: GeneratedIdeaRow) => {
    const parts = [idea.headline];
    if (idea.subheadline) parts.push(idea.subheadline);
    parts.push('');
    if (idea.copy_base) {
      parts.push(idea.copy_base);
    } else {
      parts.push(idea.subcopy);
    }
    parts.push('');
    if (idea.slides && idea.slides.length > 0) {
      parts.push('--- Slides ---');
      idea.slides.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
      parts.push('');
    }
    parts.push(idea.cta);
    navigator.clipboard.writeText(parts.join('\n'));
    toast({ title: 'Copiado al portapapeles' });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = new Set(persistedIdeas.map((i) => i.id));
    setSelectedIds(allIds);
    // Sync all to approved in DB
    persistedIdeas.forEach((idea) => {
      if (idea.status !== 'approved') {
        onToggleStatus(idea.id, 'approved');
      }
    });
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    // Sync all to generated in DB
    persistedIdeas.forEach((idea) => {
      if (idea.status === 'approved') {
        onToggleStatus(idea.id, 'generated');
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#2ED4C7]" />
          <h3 className="text-base font-semibold text-foreground">
            Ideas Generadas ({persistedIdeas.length})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount < persistedIdeas.length ? (
            <Button variant="ghost" size="sm" onClick={handleSelectAll}>
              Seleccionar todas
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
              Deseleccionar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClear} className="text-red-500 hover:text-red-700">
            Limpiar
          </Button>
        </div>
      </div>

      {/* Ideas grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {persistedIdeas.map((idea) => {
          const isSelected = selectedIds.has(idea.id);
          const isExpanded = expandedIds.has(idea.id);
          const hasRichContent = !!(idea.subheadline || idea.copy_base || (idea.slides && idea.slides.length > 0));
          const statusInfo = isSelected
            ? STATUS_LABELS.approved
            : (STATUS_LABELS[idea.status] ?? STATUS_LABELS.generated);

          return (
            <Card
              key={idea.id}
              className={cn(
                'transition-all cursor-pointer',
                isSelected
                  ? 'border-2 border-green-500 bg-green-50/50 shadow-md'
                  : 'border border-border hover:border-muted-foreground/30 hover:shadow-sm',
              )}
              onClick={() => handleToggle(idea)}
            >
              <CardContent className="p-5 space-y-3">
                {/* Status badge + date */}
                <div className="flex items-center justify-between">
                  <Badge className={cn('text-xs', statusInfo.className)}>
                    {isSelected ? '✓ Seleccionada' : statusInfo.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(idea.created_at)}
                  </span>
                </div>

                {/* Headline */}
                <h4 className="font-bold text-foreground text-lg leading-tight">
                  {idea.headline}
                </h4>

                {/* Subheadline (new) */}
                {idea.subheadline && (
                  <p className="text-sm text-foreground/80 font-medium leading-snug">
                    {idea.subheadline}
                  </p>
                )}

                {/* Subcopy / body */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {idea.subcopy}
                </p>

                {/* CTA */}
                <div className="inline-block bg-[#FF7A4A] text-white text-sm font-medium px-4 py-1.5 rounded-md">
                  {idea.cta}
                </div>

                {/* Angle badge */}
                {idea.angle && (
                  <div>
                    <Badge variant="outline" className={cn('text-xs border', getAngleColor(idea.angle))}>
                      {idea.angle}
                    </Badge>
                  </div>
                )}

                {/* Image suggestion */}
                {idea.image_suggestion && (
                  <p className="text-xs text-muted-foreground italic">
                    📷 {idea.image_suggestion}
                  </p>
                )}

                {/* Image text for overlay (new) */}
                {idea.image_text && (
                  <p className="text-xs text-muted-foreground">
                    🖼️ Texto imagen: <span className="font-medium">{idea.image_text}</span>
                  </p>
                )}

                {/* Expand toggle for rich content */}
                {hasRichContent && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground w-full justify-center"
                      onClick={() => toggleExpand(idea.id)}
                    >
                      {isExpanded ? (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Ocultar detalle
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Ver copy completo y slides
                        </>
                      )}
                    </Button>

                    {isExpanded && (
                      <div className="mt-3 space-y-4 border-t pt-3">
                        {/* Slides for carousel */}
                        {idea.slides && idea.slides.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                              Slides para carrusel ({idea.slides.length})
                            </span>
                            <div className="space-y-1.5">
                              {idea.slides.map((slide, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2"
                                >
                                  <span className="text-xs font-bold text-[#FF7A4A] shrink-0 mt-0.5">
                                    {idx + 1}
                                  </span>
                                  <span>{slide}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Full copy base */}
                        {idea.copy_base && (
                          <div className="space-y-2">
                            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                              Copy completo (LinkedIn / Email)
                            </span>
                            <div className="text-sm text-muted-foreground bg-muted/20 rounded-md px-3 py-2 whitespace-pre-line leading-relaxed">
                              {idea.copy_base}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions — stop propagation so card click doesn't fire */}
                <div className="flex items-center gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleToggle(idea)}
                    className={cn(isSelected && 'bg-green-600 hover:bg-green-700')}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    {isSelected ? 'Seleccionada' : 'Seleccionar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyText(idea)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(idea.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sticky bottom action bar */}
      {selectedCount > 0 && (
        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border rounded-lg p-4 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium text-foreground">
            {selectedCount} idea{selectedCount > 1 ? 's' : ''} seleccionada{selectedCount > 1 ? 's' : ''}
          </span>
          <Button
            onClick={handleProceed}
            size="lg"
            className="bg-[#FF7A4A] hover:bg-[#E85A2C] text-white font-semibold"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Crear Piezas con {selectedCount} idea{selectedCount > 1 ? 's' : ''} →
          </Button>
        </div>
      )}
    </div>
  );
}
