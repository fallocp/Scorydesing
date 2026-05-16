/**
 * MasterPromptEditor — Admin textarea for editing the business master prompt.
 * Shows version history and uses the `useMasterPrompt` hook.
 *
 * Requirements: 12.1, 12.3, 12.4
 */

import { useState, useEffect } from 'react';
import { Save, History, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useMasterPrompt } from '@/hooks/useMasterPrompt';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useToast } from '@/components/ui/use-toast';
import type { MasterPrompt } from '@/types/xendingDesign';

interface MasterPromptEditorProps {
  /** Optional class name for the root element */
  className?: string;
}

export function MasterPromptEditor({ className }: MasterPromptEditorProps) {
  const { activeBusinessId } = useActiveBusiness();
  const { masterPrompt, isLoading, updatePromptAsync, isUpdating } = useMasterPrompt();
  const { toast } = useToast();

  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Sync draft with latest prompt
  useEffect(() => {
    if (masterPrompt?.prompt_text) {
      setDraft(masterPrompt.prompt_text);
    }
  }, [masterPrompt?.prompt_text]);

  // Fetch version history
  const historyQuery = useQuery({
    queryKey: ['master-prompt-history', activeBusinessId],
    queryFn: async () => {
      if (!activeBusinessId) return [];
      const { data, error } = await supabase
        .from('master_prompts')
        .select('*')
        .eq('business_id', activeBusinessId)
        .order('version', { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return (data ?? []) as MasterPrompt[];
    },
    enabled: !!activeBusinessId && showHistory,
    staleTime: 30_000,
  });

  const isDirty = draft !== (masterPrompt?.prompt_text ?? '');

  const handleSave = async () => {
    if (!isDirty || draft.length < 10) return;
    try {
      await updatePromptAsync(draft);
      toast({ title: 'Master prompt actualizado' });
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    }
  };

  const handleRestore = (version: MasterPrompt) => {
    setDraft(version.prompt_text);
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Master Prompt</CardTitle>
          {masterPrompt && (
            <Badge variant="secondary">v{masterPrompt.version}</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe el master prompt del negocio (mínimo 10 caracteres)..."
          rows={8}
          className="resize-y"
        />

        {draft.length > 0 && draft.length < 10 && (
          <p className="text-sm text-destructive">
            El prompt debe tener al menos 10 caracteres.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={!isDirty || draft.length < 10 || isUpdating}
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {isUpdating ? 'Guardando...' : 'Guardar Nueva Versión'}
          </Button>
        </div>

        <Separator />

        {/* Version History */}
        <Collapsible open={showHistory} onOpenChange={setShowHistory}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <History className="h-4 w-4" />
              Historial de Versiones
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2">
            {historyQuery.isLoading && <Skeleton className="h-16 w-full" />}
            {historyQuery.data?.map((version) => (
              <div
                key={version.id}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      v{version.version}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(version.created_at ?? '').toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-muted-foreground line-clamp-2">
                    {version.prompt_text}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => handleRestore(version)}
                  title="Restaurar esta versión"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {historyQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No hay versiones anteriores.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
