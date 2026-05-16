import { RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CopyProposalCard } from './CopyProposalCard';
import { useDesignStore } from '@/store/designStore';
import { useGenerateCopy } from '@/hooks/useGenerateCopy';
import { useToast } from '@/components/ui/use-toast';

export function CopyProposalList() {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const currentCampaign = useDesignStore((s) => s.currentCampaign);
  const proposals = useDesignStore((s) => s.proposals);
  const setProposals = useDesignStore((s) => s.setProposals);
  const approveProposal = useDesignStore((s) => s.approveProposal);
  const rejectProposal = useDesignStore((s) => s.rejectProposal);
  const updateProposal = useDesignStore((s) => s.updateProposal);

  const generateCopy = useGenerateCopy();

  const approvedCount = proposals.filter((p) => p.approved === true).length;
  const rejectedCount = proposals.filter((p) => p.approved === false).length;
  const pendingCount = proposals.filter((p) => p.approved === null).length;

  const handleGenerate = () => {
    if (!selectedBrand || !currentCampaign) {
      toast({
        title: 'Información faltante',
        description: 'Por favor completa el brief de campaña primero.',
        variant: 'destructive',
      });
      return;
    }

    generateCopy.mutate(
      {
        brief: currentCampaign.brief,
        brand: selectedBrand,
        count: 15,
        contentType: currentCampaign.contentType,
      },
      {
        onSuccess: (data) => {
          setProposals(data.proposals);
        },
        onError: (error) => {
          toast({
            title: 'Error al generar copy',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleGenerateMore = () => {
    if (!selectedBrand || !currentCampaign) return;

    generateCopy.mutate(
      {
        brief: currentCampaign.brief,
        brand: selectedBrand,
        count: rejectedCount || 5,
        contentType: currentCampaign.contentType,
      },
      {
        onSuccess: (data) => {
          // Replace rejected proposals with new ones, keep approved and pending
          const kept = proposals.filter((p) => p.approved !== false);
          setProposals([...kept, ...data.proposals]);
        },
        onError: (error) => {
          toast({
            title: 'Error al generar copy',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const isLoading = generateCopy.isPending;

  return (
    <div className="space-y-4">
      {/* Header with counts */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Propuestas de Copy</h2>
          <p className="text-sm text-muted-foreground">
            Aprueba o rechaza cada propuesta. Genera más para reemplazar las rechazadas.
          </p>
        </div>

        {proposals.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
              {approvedCount} aprobados
            </Badge>
            <Badge variant="outline" className="text-red-500 border-red-300/50">
              {rejectedCount} rechazados
            </Badge>
            <Badge variant="secondary">{pendingCount} pendientes</Badge>
          </div>
        )}
      </div>

      {/* Generate / Generate More buttons */}
      <div className="flex items-center gap-3">
        {proposals.length === 0 && (
          <Button onClick={handleGenerate} disabled={isLoading}>
            <Sparkles className="h-4 w-4 mr-2" />
            {isLoading ? 'Generando...' : 'Generar Copy'}
          </Button>
        )}

        {proposals.length > 0 && rejectedCount > 0 && (
          <Button variant="outline" onClick={handleGenerateMore} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Generando...' : `Generar ${rejectedCount} Más`}
          </Button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && proposals.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 p-4 border rounded-lg">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proposal cards grid */}
      {proposals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {proposals.map((proposal) => (
            <CopyProposalCard
              key={proposal.id}
              proposal={proposal}
              onApprove={approveProposal}
              onReject={rejectProposal}
              onUpdate={updateProposal}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && proposals.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Sin propuestas aún. Haz clic en "Generar Copy" para comenzar.</p>
        </div>
      )}
    </div>
  );
}
