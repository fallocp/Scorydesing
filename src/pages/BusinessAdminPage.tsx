/**
 * BusinessAdminPage — Admin panel for editing business config, branches,
 * verticals, moments, master prompt, and compliance rules.
 *
 * Route: /admin/business
 * Protected by role check (owner/admin only).
 *
 * Requirements: 3.6, 12.3, 13.4
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  FileText,
  ShieldAlert,
  GitBranch,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { MasterPromptEditor } from '@/components/MasterPromptEditor';
import { ComplianceRulesEditor } from '@/components/ComplianceRulesEditor';
import { StrategicConfigEditor } from '@/components/StrategicConfigEditor';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useCommercialBranches } from '@/hooks/useCommercialBranches';
import { useCampaignCategories } from '@/hooks/useCampaignCategories';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { CommercialBranch, StrategicConfig } from '@/types/xendingDesign';

/**
 * Hook to check if the current user has admin/owner role for the active business.
 */
function useIsAdmin() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['user-role', activeBusinessId],
    queryFn: async () => {
      if (!activeBusinessId) return false;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase
        .from('user_business_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('business_id', activeBusinessId)
        .maybeSingle();

      if (error || !data) return false;
      return data.role === 'owner' || data.role === 'admin';
    },
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });
}

function BusinessAdminPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const { data: categories } = useCampaignCategories();

  const [editingBranch, setEditingBranch] = useState<CommercialBranch | null>(
    null,
  );

  // Fetch branches for the first category (or all)
  const firstCategoryId = categories?.[0]?.id ?? null;
  const { data: branches } = useCommercialBranches(firstCategoryId);

  if (!activeBusinessId) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertTitle>Sin negocio activo</AlertTitle>
          <AlertDescription>
            Selecciona un negocio desde el panel principal para administrarlo.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (roleLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Acceso denegado</AlertTitle>
          <AlertDescription>
            Solo los propietarios y administradores pueden acceder a esta página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleSaveBranchConfig = async (config: StrategicConfig) => {
    if (!editingBranch?.id) return;
    try {
      const { error } = await supabase
        .from('commercial_branches')
        .update({ strategic_config: config })
        .eq('id', editingBranch.id);
      if (error) throw error;
      toast({ title: 'Configuración guardada' });
      setEditingBranch(null);
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' });
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Administrar Negocio
          </h1>
          <p className="text-muted-foreground">
            {activeBusiness?.name ?? 'Negocio'}
          </p>
        </div>
      </div>

      {/* Admin Tabs */}
      <Tabs defaultValue="prompt" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompt" className="gap-2">
            <FileText className="h-4 w-4" />
            Master Prompt
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Compliance
          </TabsTrigger>
          <TabsTrigger value="branches" className="gap-2">
            <GitBranch className="h-4 w-4" />
            Ramas
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        {/* Master Prompt Tab */}
        <TabsContent value="prompt">
          <MasterPromptEditor />
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          <ComplianceRulesEditor />
        </TabsContent>

        {/* Branches Tab */}
        <TabsContent value="branches" className="space-y-4">
          {editingBranch ? (
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingBranch(null)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver a la lista
              </Button>
              <StrategicConfigEditor
                branchName={editingBranch.name}
                defaultValues={editingBranch.strategic_config}
                onSave={handleSaveBranchConfig}
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {branches?.map((branch) => (
                <Card
                  key={branch.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setEditingBranch(branch)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditingBranch(branch);
                    }
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{branch.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="line-clamp-2">
                      {branch.strategic_config?.objetivo ?? 'Sin objetivo definido'}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
              {(!branches || branches.length === 0) && (
                <p className="text-sm text-muted-foreground col-span-2">
                  No hay ramas comerciales configuradas.
                </p>
              )}
            </div>
          )}
        </TabsContent>

        {/* Config Tab */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Configuración del Negocio
              </CardTitle>
              <CardDescription>
                Identidad de marca, colores, fuentes y disclaimers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-muted-foreground">Nombre:</span>
                <span>{activeBusiness?.name}</span>
                <span className="text-muted-foreground">Slug:</span>
                <span>{activeBusiness?.slug}</span>
                <span className="text-muted-foreground">Industria:</span>
                <span>{(activeBusiness as any)?.industry ?? '—'}</span>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Para editar la identidad de marca, usa el Wizard de Onboarding o
                contacta al administrador.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BusinessAdminPage;
