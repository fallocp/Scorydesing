/**
 * DisclaimerPreview — Shows the mandatory disclaimer for the active brand/business.
 *
 * Updated to load disclaimer from DB (business tenant config) instead of
 * hardcoded text. Falls back to the hardcoded brand config when no active
 * business is set.
 *
 * Requirements: 16.1, 16.2, 16.6
 */

import { AlertCircle } from 'lucide-react';
import { useBrandConfig } from '@/hooks/useBrandConfig';
import { useBusinessConfig } from '@/hooks/useBusinessConfig';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

export function DisclaimerPreview() {
  const { activeBusinessId } = useActiveBusiness();
  const { data: businessConfig } = useBusinessConfig();
  const brandConfig = useBrandConfig();

  // Determine display name and disclaimer text
  // Prefer DB-driven business config when available
  const displayName = activeBusinessId && businessConfig
    ? businessConfig.name
    : brandConfig?.displayName ?? '';

  const disclaimer = activeBusinessId && businessConfig
    ? businessConfig.disclaimer ?? ''
    : brandConfig?.disclaimer ?? '';

  if (!disclaimer) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        Disclaimer Obligatorio — {displayName}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {disclaimer}
      </p>
    </div>
  );
}
