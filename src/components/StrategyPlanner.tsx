/**
 * StrategyPlanner — Strategy branch generation component.
 *
 * Updated to pass category_id to the generate-strategy edge function
 * so that generated branches are scoped to the selected CampaignCategory.
 *
 * Requirements: 10.6
 */

import { useState } from 'react';
import { Sparkles, Check, X, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useDesignStore } from '@/store/designStore';
import { useGenerateStrategy } from '@/hooks/useGenerateStrategy';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useSavedBranches } from '@/hooks/useSavedBranches';
import { useToast } from '@/components/ui/use-toast';
import type { StrategyBranch } from '@/types/xendingDesign';

export function StrategyPlanner() {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const branches = useDesignStore((s) => s.branches);
  const setBranches = useDesignStore((s) => s.setBranches);
  const approveBranch = useDesignStore((s) => s.approveBranch);
  const rejectBranch = useDesignStore((s) => s.rejectBranch);
  const activeCategory = useDesignStore((s) => s.activeCategory);
  const { activeBusinessId } = useActiveBusiness();

  const { saveBranch: saveBranchMutation } = useSavedBranches(selectedBrand);

  const [context, setContext] = useState('');
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);

  const generateStrategy = useGenerateStrategy();
  const isLoading = generateStrategy.isPending;

  const approvedCount = branches.filter((b) => b.approved === true).length;
  const rejectedCount = branches.filter((b) => b.approved === false).length;

  const handleApproveBranch = (id: string) => {
    approveBranch(id);
    // Auto-save to Supabase
    const branch = branches.find((b) => b.id === id);
    if (branch && selectedBrand) {
      saveBranchMutation.mutate(
        { branch: { ...branch, approved: true }, brand: selectedBrand },
        {
          onSuccess: () => toast({ title: `"${branch.name}" guardada` }),
          onError: (err) => console.error('Error saving branch:', err),
        }
      );
    }
  };
  const pendingCount = branches.filter((b) => b.approved === null).length;

  const handleGenerate = () => {
    if (!selectedBrand) {
      toast({ title: 'Selecciona una marca', variant: 'destructive' });
      return;
    }
    if (!context.trim()) {
      toast({ title: 'Escribe el contexto de tu negocio', variant: 'destructive' });
      return;
    }

    // Get existing themes to avoid duplicates
    const existingThemes = branches
      .filter((b) => b.approved === true)
      .map((b) => b.name);

    generateStrategy.mutate(
      {
        context: context.trim(),
        brand: selectedBrand,
        existingThemes,
        // Pass category_id to scope generated branches to the selected category
        category_id: activeCategory?.id ?? undefined,
        // Pass business_id for DB-driven prompt building
        business_id: activeBusinessId ?? undefined,
      },
      {
        onSuccess: (data) => {
          setBranches(data.branches);
          toast({ title: `${data.branches.length} ramas de campaña generadas` });
        },
        onError: (error) => {
          toast({ title: 'Error al generar estrategia', description: error.message, variant: 'destructive' });
        },
      }
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedBranch(expandedBranch === id ? null : id);
  };

  return (
    <div className="space-y-6">
      {/* Context input */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Contexto de Negocio</h2>
        <p className="text-sm text-muted-foreground">
          Describe tu negocio, productos, ventajas competitivas, audiencia, y lo que quieres comunicar.
          Claude analizará tu contexto y propondrá ramas de campaña.
        </p>
        <Textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Ej: Vendemos dólares a mejor precio que bancos americanos, ahorro de 50% en fees. Pagamos mismo día. Cuenta multidivisas. Coberturas para asegurar el valor. Industrias: produce (aguacate, frutas, verduras, pescados), automotriz, manufactura..."
          rows={6}
          disabled={isLoading}
        />
        <Button onClick={handleGenerate} disabled={isLoading || !context.trim()}>
          <Sparkles className="h-4 w-4 mr-2" />
          {isLoading ? 'Analizando...' : 'Generar Ramas de Campaña'}
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 p-4 border rounded-lg">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Branches */}
      {branches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-foreground">Ramas de Campaña</h2>
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
                {approvedCount} aprobadas
              </Badge>
              <Badge variant="outline" className="text-red-500 border-red-300/50">
                {rejectedCount} rechazadas
              </Badge>
              <Badge variant="secondary">{pendingCount} pendientes</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((branch) => (
              <BranchCard
                key={branch.id}
                branch={branch}
                isExpanded={expandedBranch === branch.id}
                onToggleExpand={() => toggleExpand(branch.id)}
                onApprove={() => handleApproveBranch(branch.id)}
                onReject={() => rejectBranch(branch.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BranchCard({
  branch,
  isExpanded,
  onToggleExpand,
  onApprove,
  onReject,
}: {
  branch: StrategyBranch;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isApproved = branch.approved === true;
  const isRejected = branch.approved === false;

  return (
    <Card
      className={cn(
        'transition-all',
        isApproved && 'border-2 border-green-500/60 bg-green-50/30 dark:bg-green-950/10',
        isRejected && 'border border-red-300/40 opacity-50',
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-xs">{branch.category}</Badge>
              {isApproved && <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">Aprobada</Badge>}
              {isRejected && <Badge variant="outline" className="text-red-500 border-red-300/50 text-xs">Rechazada</Badge>}
            </div>
            <h3 className="font-semibold text-foreground">{branch.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{branch.description}</p>
          </div>
        </div>

        {/* Key message */}
        <p className="text-sm font-medium text-[#2ED4C7]">💡 {branch.keyMessage}</p>

        {/* Expand/collapse */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={onToggleExpand}
        >
          {isExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {isExpanded ? 'Ocultar detalles' : 'Ver copy e imágenes sugeridas'}
        </Button>

        {/* Expanded details */}
        {isExpanded && (
          <div className="space-y-4 pt-2 border-t">
            {/* Target audience */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">🎯 Audiencia</p>
              <p className="text-sm">{branch.targetAudience}</p>
            </div>

            {/* Copy ideas */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">✍️ Ideas de Copy ({branch.copyIdeas.length})</p>
              <div className="space-y-2">
                {branch.copyIdeas.map((idea, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-semibold">{idea.headline}</p>
                    <p className="text-xs text-muted-foreground">{idea.subcopy}</p>
                    <p className="text-xs font-medium text-[#2ED4C7]">{idea.cta}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Image descriptions */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                <ImageIcon className="h-3 w-3 inline mr-1" />
                Imágenes Sugeridas ({branch.imageDescriptions.length})
              </p>
              <div className="space-y-1.5">
                {branch.imageDescriptions.map((desc, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-muted-foreground/50">{i + 1}.</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isApproved ? 'default' : 'outline'}
            className={cn('flex-1', isApproved && 'bg-green-600 hover:bg-green-700 text-white')}
            onClick={onApprove}
          >
            <Check className="h-4 w-4 mr-1" />
            Aprobar
          </Button>
          <Button
            size="sm"
            variant={isRejected ? 'destructive' : 'outline'}
            className="flex-1"
            onClick={onReject}
          >
            <X className="h-4 w-4 mr-1" />
            Rechazar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
