/**
 * ContentLibraryPage — Page that combines filters + table for the content library.
 *
 * Uses useContentLibrary hook with filters, useDesignStore for activeBusiness.
 * Shows counters: total pieces, unused, published.
 *
 * Requirements: 8.1, 8.7
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDesignStore } from '@/store/designStore';
import { useContentLibrary } from '@/hooks/useContentLibrary';
import { useNarrativeAngles } from '@/hooks/useNarrativeAngles';
import {
  ContentLibraryFilters,
  type ContentLibraryFilterValues,
} from '@/components/library/ContentLibraryFilters';
import { ContentLibraryTable } from '@/components/library/ContentLibraryTable';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function ContentLibraryPage() {
  const navigate = useNavigate();
  const activeBusiness = useDesignStore((s) => s.activeBusiness);

  const [filters, setFilters] = useState<ContentLibraryFilterValues>({
    branchId: '',
    narrativeAngleId: '',
    funnelStage: '',
    status: '',
    search: '',
  });

  // Fetch content library with server-side filters
  const { data: pieces, isLoading } = useContentLibrary({
    businessId: activeBusiness?.id,
    branchId: filters.branchId || undefined,
    narrativeAngleId: filters.narrativeAngleId || undefined,
    funnelStage: filters.funnelStage || undefined,
    status: filters.status || undefined,
  });

  // Fetch narrative angles for the filter dropdown
  const { data: angles } = useNarrativeAngles();

  // Client-side text search filter
  const filteredPieces = useMemo(() => {
    if (!pieces) return [];
    if (!filters.search.trim()) return pieces as any[];
    const query = filters.search.toLowerCase();
    return (pieces as any[]).filter((p: any) => {
      const headline = p.piece_data?.headline ?? '';
      const body = p.piece_data?.body ?? '';
      return (
        headline.toLowerCase().includes(query) ||
        body.toLowerCase().includes(query)
      );
    });
  }, [pieces, filters.search]);

  // Counters
  const totalPieces = (pieces as any[] | undefined)?.length ?? 0;
  const unusedCount = (pieces as any[] | undefined)?.filter(
    (p: any) => p.status === 'generated' || p.status === 'approved'
  ).length ?? 0;
  const publishedCount = (pieces as any[] | undefined)?.filter(
    (p: any) => p.status === 'published'
  ).length ?? 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          aria-label="Volver a Xending Design"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Biblioteca de Contenido</h1>
          <p className="text-sm text-muted-foreground">
            Todas las piezas generadas por el pipeline
          </p>
        </div>
      </div>

      {/* Counters */}
      {activeBusiness && (
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1">
            {totalPieces} piezas
          </Badge>
          <Badge variant="secondary" className="text-sm px-3 py-1 bg-yellow-50 text-yellow-700">
            {unusedCount} sin usar
          </Badge>
          <Badge variant="secondary" className="text-sm px-3 py-1 bg-green-50 text-green-700">
            {publishedCount} publicadas
          </Badge>
        </div>
      )}

      {/* Filters */}
      {activeBusiness && (
        <ContentLibraryFilters
          filters={filters}
          onChange={setFilters}
          branches={[]}
          angles={(angles as any[] | undefined)?.map((a: any) => ({
            id: a.id,
            name: a.name,
            funnel_stage: a.funnel_stage,
          })) ?? []}
        />
      )}

      {/* Table */}
      {activeBusiness ? (
        <ContentLibraryTable pieces={filteredPieces} isLoading={isLoading} />
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Library className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Selecciona un negocio activo para ver la biblioteca de contenido</p>
        </div>
      )}
    </div>
  );
}

export default ContentLibraryPage;
