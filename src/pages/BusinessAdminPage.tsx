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
  Save,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useBusinessConfig } from '@/hooks/useBusinessConfig';
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

/**
 * BrandIdentityEditor — Inline editor for brand identity fields (logo, colors, fonts).
 */
function BrandIdentityEditor({ businessId }: { businessId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useBusinessConfig();
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [accentColor, setAccentColor] = useState('');
  const [displayFont, setDisplayFont] = useState('');
  const [bodyFont, setBodyFont] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Populate form when config loads
  if (config && !initialized) {
    setLogoUrl(config.logo_url ?? '');
    setPrimaryColor(config.primary_color ?? '');
    setSecondaryColor(config.secondary_color ?? '');
    setAccentColor(config.accent_color ?? '');
    setDisplayFont(config.fonts?.display ?? '');
    setBodyFont(config.fonts?.body ?? '');
    setDisclaimer(config.disclaimer ?? '');
    setInitialized(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error, count } = await supabase
        .from('business_tenants')
        .update({
          logo_url: logoUrl || null,
          primary_color: primaryColor || null,
          secondary_color: secondaryColor || null,
          accent_color: accentColor || null,
          fonts: { display: displayFont || 'Inter', body: bodyFont || 'Inter', mono: 'JetBrains Mono' },
          disclaimer: disclaimer || null,
        })
        .eq('id', businessId);

      if (error) throw error;

      // Invalidate queries so Design Studio picks up the change
      await queryClient.invalidateQueries({ queryKey: ['business-config'] });
      toast({ title: 'Identidad de marca guardada', description: 'Los cambios se reflejarán en el Design Studio.' });
    } catch (err: any) {
      console.error('Error saving brand identity:', err);
      toast({ title: 'Error al guardar', description: err.message ?? 'Error desconocido', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identidad de Marca</CardTitle>
        <CardDescription>
          Logo, colores, tipografías y disclaimer del negocio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Logo URL */}
        <div className="space-y-2">
          <Label htmlFor="admin-logo-url">URL del Logo *</Label>
          <Input
            id="admin-logo-url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://tu-bucket.supabase.co/storage/v1/object/public/Brand/logo.png"
          />
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-12 w-auto object-contain rounded border p-1"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>

        {/* Colors */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="admin-primary">Color Primario *</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={primaryColor || '#000000'}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-9 w-9 rounded border cursor-pointer"
              />
              <Input
                id="admin-primary"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#0F1419"
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-secondary">Color Secundario</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={secondaryColor || '#333333'}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-9 w-9 rounded border cursor-pointer"
              />
              <Input
                id="admin-secondary"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="#2ED4C7"
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-accent">Color Acento</Label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={accentColor || '#2ED4C7'}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-9 rounded border cursor-pointer"
              />
              <Input
                id="admin-accent"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#FF7A4A"
                className="flex-1"
              />
            </div>
          </div>
        </div>

        {/* Fonts */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="admin-display-font">Tipografía Display</Label>
            <Input
              id="admin-display-font"
              value={displayFont}
              onChange={(e) => setDisplayFont(e.target.value)}
              placeholder="Fraunces"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-body-font">Tipografía Body</Label>
            <Input
              id="admin-body-font"
              value={bodyFont}
              onChange={(e) => setBodyFont(e.target.value)}
              placeholder="Inter"
            />
          </div>
        </div>

        {/* Disclaimer */}
        <div className="space-y-2">
          <Label htmlFor="admin-disclaimer">Disclaimer</Label>
          <Input
            id="admin-disclaimer"
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            placeholder="Texto legal que aparece en las piezas..."
          />
        </div>

        {/* Save */}
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </CardContent>
    </Card>
  );
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
          <BrandIdentityEditor businessId={activeBusinessId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BusinessAdminPage;
