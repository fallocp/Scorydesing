/**
 * BusinessSwitcher — Dropdown in app header showing businesses the user
 * belongs to. Sets active business_id in Zustand + Supabase session via
 * `useActiveBusiness`. Hidden when `DEPLOYMENT_MODE=single`.
 *
 * Requirements: 13.5, 13.6, 17.10
 */

import { Building2, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useDeploymentMode } from '@/hooks/useDeploymentMode';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { BusinessTenant } from '@/types/xendingDesign';

export function BusinessSwitcher() {
  const deploymentMode = useDeploymentMode();
  const { data: businesses, isLoading } = useBusinessTenants();
  const { activeBusiness, setActiveBusiness } = useActiveBusiness();
  const { toast } = useToast();

  // Hidden in single-tenant mode
  if (deploymentMode === 'single') {
    return null;
  }

  const handleSelect = async (business: BusinessTenant) => {
    if (activeBusiness?.id === business.id) return;
    try {
      await setActiveBusiness(business);
      toast({ title: `Negocio activo: ${business.name}` });
    } catch {
      toast({ title: 'Error al cambiar negocio', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <Skeleton className="h-9 w-[180px]" />;
  }

  if (!businesses || businesses.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[140px] truncate">
            {activeBusiness?.name ?? 'Seleccionar negocio'}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>Negocios</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {businesses.map((biz) => {
          const isActive = activeBusiness?.id === biz.id;
          return (
            <DropdownMenuItem
              key={biz.id}
              onClick={() => handleSelect(biz)}
              className={cn('cursor-pointer gap-2', isActive && 'font-medium')}
            >
              {biz.name}
              {isActive && <Check className="ml-auto h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
