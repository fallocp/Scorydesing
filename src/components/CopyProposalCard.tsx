import { useState } from 'react';
import { Check, X, Pencil, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CopyProposal } from '@/types/xendingDesign';

interface CopyProposalCardProps {
  proposal: CopyProposal;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUpdate: (id: string, updates: Partial<CopyProposal>) => void;
}

export function CopyProposalCard({ proposal, onApprove, onReject, onUpdate }: CopyProposalCardProps) {
  const { id, headline, subcopy, cta, angle, imageSuggestion, approved } = proposal;

  const [isEditing, setIsEditing] = useState(false);
  const [editHeadline, setEditHeadline] = useState(headline);
  const [editSubcopy, setEditSubcopy] = useState(subcopy);
  const [editCta, setEditCta] = useState(cta);

  const isApproved = approved === true;
  const isRejected = approved === false;
  const isPending = approved === null;

  const handleEdit = () => {
    setEditHeadline(headline);
    setEditSubcopy(subcopy);
    setEditCta(cta);
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdate(id, {
      headline: editHeadline.trim(),
      subcopy: editSubcopy.trim(),
      cta: editCta.trim(),
    });
    setIsEditing(false);
  };

  return (
    <Card
      className={cn(
        'transition-all',
        isApproved && 'border-2 border-green-500/60 bg-green-50/30 dark:bg-green-950/10',
        isRejected && 'border border-red-300/40 opacity-60',
        isPending && 'border border-border'
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Angle badge + edit toggle */}
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="text-xs">
            {angle}
          </Badge>
          <div className="flex items-center gap-1.5">
            {isApproved && (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
                Aprobado
              </Badge>
            )}
            {isRejected && (
              <Badge variant="outline" className="text-red-500 border-red-300/50">
                Rechazado
              </Badge>
            )}
            {!isEditing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={handleEdit}
                aria-label="Editar propuesta"
              >
                <Pencil className="h-3 w-3 mr-1" />
                Editar
              </Button>
            )}
          </div>
        </div>

        {/* Copy content — view or edit mode */}
        {isEditing ? (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Titular</label>
              <Input
                value={editHeadline}
                onChange={(e) => setEditHeadline(e.target.value)}
                placeholder="Titular"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Subcopy</label>
              <Textarea
                value={editSubcopy}
                onChange={(e) => setEditSubcopy(e.target.value)}
                placeholder="Subcopy"
                rows={2}
                className="text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">CTA</label>
              <Input
                value={editCta}
                onChange={(e) => setEditCta(e.target.value)}
                placeholder="Call to action"
                className="text-sm"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={handleSave} className="flex-1">
                <Save className="h-3.5 w-3.5 mr-1" />
                Guardar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setIsEditing(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <h3 className="font-semibold text-foreground leading-tight">{headline}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{subcopy}</p>
            <p className="text-sm font-medium text-[#2ED4C7]">{cta}</p>
          </div>
        )}

        {/* Image suggestion */}
        {imageSuggestion && !isEditing && (
          <p className="text-xs text-muted-foreground/70 leading-snug">
            📷 Sugerencia de imagen: {imageSuggestion}
          </p>
        )}

        {/* Action buttons */}
        {!isEditing && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant={isApproved ? 'default' : 'outline'}
              className={cn(
                'flex-1',
                isApproved && 'bg-green-600 hover:bg-green-700 text-white'
              )}
              onClick={() => onApprove(id)}
              aria-label={`Aprobar: ${headline}`}
            >
              <Check className="h-4 w-4 mr-1" />
              Aprobar
            </Button>
            <Button
              size="sm"
              variant={isRejected ? 'destructive' : 'outline'}
              className="flex-1"
              onClick={() => onReject(id)}
              aria-label={`Rechazar: ${headline}`}
            >
              <X className="h-4 w-4 mr-1" />
              Rechazar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
