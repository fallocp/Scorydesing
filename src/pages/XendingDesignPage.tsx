/**
 * XendingDesignPage — Home de Scory Design.
 *
 * Hoy esta pantalla hace tres cosas: elegir negocio (Xending / Xending Capital),
 * elegir marca, y abrir las Herramientas. La generación de contenido vive
 * completa en Design Studio (`/design-studio`).
 *
 * ─── Lo que se retiró de aquí, y por qué ────────────────────────────────────
 *
 * 1. El generador de ideas (`CombinableGeneratorPanel`): llamaba a
 *    `generate-ideas`, que resuelve su contexto con `commercial_branches.prompt_kit`
 *    y `strategic_config` — las reglas editoriales anteriores a los copy kits, que
 *    no están desactualizadas respecto a ellos sino en contra.
 *
 * 2. Las tres entradas al Asistente de Campaña: la tarjeta "Nueva Campaña", la
 *    tarjeta "Continuar diseño →" con su query sobre `design_campaigns`, y el
 *    `onProceed` de `IdeasPanel`.
 *
 * 3. La sección "Categorías de Campaña" completa: `CategoryTabs`,
 *    `BranchCardGrid`, `VerticalCardGrid`, `MomentCardGrid`,
 *    `BranchPickerForVertical` e `IdeasPanel`. Era el front-end del flujo viejo.
 *    Sin la salida al Asistente solo servía para filtrar un panel de lectura.
 *
 *    Verificado antes de quitarla: `DesignStudioPage` no importa `useDesignStore`,
 *    así que no lee `activeCategory`, `selectedDimensions` ni `selectedBrand`.
 *    Tiene su propio selector de ramas (`useDesignStudioBranches`). Los únicos
 *    lectores de `activeCategory` y `selectedDimensions` eran `StrategyPlanner`,
 *    `CopyWorkstation` y `CampaignWizardPage`, los tres del Asistente desruteado.
 *
 * 4. Los colapsables "Editar Master Prompt" (`MasterPromptEditor`) y "Ver Config"
 *    (`StrategicConfigViewer`). El primero sigue disponible en el Admin Panel; el
 *    segundo dependía de la rama seleccionada, que ya no se elige aquí.
 *
 * 5. Las tarjetas "Boletín Express", "Generar Stock" y "Compliance Wizard", que
 *    no están en uso. Sus rutas se desrutearon en `App.tsx`. Las reglas de
 *    compliance se siguen editando en el Admin Panel → tab Compliance
 *    (`ComplianceRulesEditor`), sobre la misma `business_tenants.compliance_rules`.
 *
 * Nada de esto borró datos: `generated_ideas`, `design_campaigns` y
 * `commercial_branches` siguen intactas. Ver la nota en `App.tsx`.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, Building2, Settings, Presentation, Palette, Wand2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BrandSelector } from '@/components/BrandSelector';
import { useDesignStore } from '@/store/designStore';
import { useDeploymentMode } from '@/hooks/useDeploymentMode';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { usePresentationDesignService } from '@/components/presentations/PresentationDesignContext';

const MODE_OPTIONS = [
  {
    key: 'library',
    title: 'Biblioteca de Assets',
    description: 'Explora y administra tu biblioteca de imágenes',
    icon: Library,
    route: '/assets',
  },
  {
    key: 'presentations',
    title: 'Presentaciones',
    description: 'Pitch decks y presentaciones con branding Xending',
    icon: Presentation,
    route: '/presentations',
  },
  {
    key: 'free-design',
    title: 'Diseño libre',
    description: 'Portadas, páginas y diseños especiales con HTML editable',
    icon: Palette,
    route: '/free-design',
  },
  {
    key: 'palette',
    title: 'Paleta de Marca',
    description: 'Colores, tipografías, gradientes y tokens del sistema',
    icon: Palette,
    route: '/brand-palette',
  },
  {
    key: 'materials',
    title: 'Materiales de referencia',
    description: 'PDFs, documentación e ideas con una ficha revisable',
    icon: Library,
    route: '/materials',
  },
  {
    key: 'onboarding',
    title: 'Configurar marca',
    description: 'Comprende tus materiales, explora una dirección y guarda tu perfil',
    icon: Building2,
    route: '/onboarding',
  },
  {
    key: 'design-studio',
    title: 'Design Studio',
    description: 'Imágenes, carruseles, guiones, News y reporte FX',
    icon: Wand2,
    route: '/design-studio',
  },
] as const;

function XendingDesignPage() {
  const designService = usePresentationDesignService();
  const navigate = useNavigate();
  const { toast } = useToast();
  const deploymentMode = useDeploymentMode();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const setBrand = useDesignStore((s) => s.setBrand);

  const { activeBusinessId, setActiveBusiness } = useActiveBusiness();
  const { data: businesses, isLoading: businessesLoading } = useBusinessTenants();

  const handleBusinessChange = useCallback(
    async (businessId: string) => {
      const business = businesses?.find((b) => b.id === businessId) ?? null;
      if (business) {
        try {
          await setActiveBusiness(business);
          // Also set the brand based on the business slug for backward compat
          if (business.slug === 'xending' || business.slug === 'xending_capital') {
            setBrand(business.slug as 'xending' | 'xending_capital');
          }
          toast({ title: `Negocio: ${business.name}` });
        } catch {
          toast({ title: 'Error al cambiar negocio', variant: 'destructive' });
        }
      }
    },
    [businesses, setActiveBusiness, setBrand, toast],
  );

  const isReady = selectedBrand || activeBusinessId;

  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Xending Design Generator</h1>
          <p className="text-muted-foreground mt-1">
            Crea visuales de marketing de marca para tus negocios
          </p>
        </div>

        {/* Business Switcher — visible only in multi-tenant mode */}
        {deploymentMode === 'multi' && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {businessesLoading ? (
              <Skeleton className="h-9 w-48" />
            ) : (
              <Select
                value={activeBusinessId ?? undefined}
                onValueChange={handleBusinessChange}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar negocio" />
                </SelectTrigger>
                <SelectContent>
                  {businesses?.map((biz) => (
                    <SelectItem key={biz.id} value={biz.id!}>
                      {biz.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Brand Selection — always visible for switching */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Seleccionar Marca</h2>
        <BrandSelector value={selectedBrand} onChange={setBrand} />
      </section>

      {/* Admin Quick Actions */}
      {isReady && (
        <section className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => navigate('/admin/business')}
          >
            <Settings className="h-4 w-4" />
            Admin Panel
          </Button>
        </section>
      )}

      {/* Mode Picker / Tools */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Herramientas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {MODE_OPTIONS.filter(mode => (mode.key !== 'free-design' || !!designService) && (mode.key !== 'materials' || !!designService?.client.materials)
            && (mode.key !== 'onboarding' || !!designService?.client.onboarding)).map((mode) => {
            const Icon = mode.icon;
            const disabled = !isReady || (mode.key === 'onboarding' && !activeBusinessId);
            return (
              <Card
                key={mode.key}
                className={cn(
                  'transition-all',
                  disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-md hover:border-[#2ED4C7]/50',
                )}
                onClick={() => {
                  if (!disabled) navigate(mode.route);
                }}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                onKeyDown={(e) => {
                  if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    navigate(mode.route);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-[#0F1419] p-2">
                      <Icon className="h-5 w-5 text-[#2ED4C7]" />
                    </div>
                    <CardTitle className="text-base">{mode.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{mode.description}</CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {!isReady && (
          <p className="text-sm text-muted-foreground">
            Selecciona una marca o negocio arriba para comenzar
          </p>
        )}
      </section>
    </div>
  );
}

export default XendingDesignPage;
