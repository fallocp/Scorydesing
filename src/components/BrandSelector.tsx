/**
 * BrandSelector — Brand/business selection component.
 *
 * Updated to load brands/businesses from DB instead of hardcoded options.
 * In multi-tenant mode, this becomes the business switcher.
 * Falls back to hardcoded options when no DB businesses are available.
 *
 * Requirements: 16.1, 16.2, 16.6
 */

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBusinessTenants } from '@/hooks/useBusinessTenants';
import { useDeploymentMode } from '@/hooks/useDeploymentMode';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import type { Brand, BusinessTenant } from '@/types/xendingDesign';

/** Hardcoded fallback options for when no DB businesses are available */
const FALLBACK_BRAND_OPTIONS: { value: Brand; name: string; description: string }[] = [
  {
    value: 'xending',
    name: 'Xending',
    description: 'USA — Pagos internacionales y FX para la industria agrícola',
  },
  {
    value: 'xending_capital',
    name: 'Xending Capital',
    description: 'México — Financiamiento SOFOM, factoraje y líneas de crédito',
  },
];

interface BrandSelectorProps {
  value: Brand | null;
  onChange: (brand: Brand) => void;
}

export function BrandSelector({ value, onChange }: BrandSelectorProps) {
  const deploymentMode = useDeploymentMode();
  const { data: businesses, isLoading } = useBusinessTenants();
  const { activeBusiness, setActiveBusiness } = useActiveBusiness();

  // When DB businesses are available, use them
  const hasDbBusinesses = businesses && businesses.length > 0;

  const handleBusinessSelect = async (business: BusinessTenant) => {
    try {
      await setActiveBusiness(business);
      // Map slug to Brand type for backward compatibility
      const slug = business.slug;
      if (slug === 'xending' || slug === 'xending_capital') {
        onChange(slug as Brand);
      } else {
        // For non-standard slugs, default to xending brand type
        onChange('xending');
      }
    } catch {
      // Error handled in useActiveBusiness
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }

  // DB-driven mode: show businesses from database
  if (hasDbBusinesses) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {businesses.map((business) => {
          const isSelected = activeBusiness?.id === business.id;
          return (
            <Card
              key={business.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md',
                isSelected
                  ? 'border-2 border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
                  : 'border border-border hover:border-muted-foreground/30',
              )}
              onClick={() => handleBusinessSelect(business)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleBusinessSelect(business);
                }
              }}
            >
              <CardContent className="p-5 flex items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                    isSelected
                      ? 'border-[#2ED4C7] bg-[#2ED4C7]'
                      : 'border-muted-foreground/40',
                  )}
                >
                  {isSelected && (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">{business.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(business as any).industry ?? business.slug}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Fallback: hardcoded brand options (no DB businesses available)
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {FALLBACK_BRAND_OPTIONS.map((option) => {
        const isSelected = value === option.value;
        return (
          <Card
            key={option.value}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              isSelected
                ? 'border-2 border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
                : 'border border-border hover:border-muted-foreground/30',
            )}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(option.value);
              }
            }}
          >
            <CardContent className="p-5 flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                  isSelected
                    ? 'border-[#2ED4C7] bg-[#2ED4C7]'
                    : 'border-muted-foreground/40',
                )}
              >
                {isSelected && (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">{option.name}</p>
                <p className="text-sm text-muted-foreground">{option.description}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
