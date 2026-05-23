/**
 * BrandPalettePreview — Compact display of loaded brand colors and typography.
 *
 * Shows color swatches, font names, and logo indicator when the brand palette
 * is loaded. Displays validation errors with a link to brand configuration
 * when required fields are missing. Shows a skeleton state while loading.
 *
 * Requirements: 2.2, 2.3
 */

import { AlertTriangle, ExternalLink, Image as ImageIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { BrandPalette } from '@/types/design-studio';

interface BrandPalettePreviewProps {
  brandPalette: BrandPalette | null;
  validationErrors?: string[];
}

export function BrandPalettePreview({
  brandPalette,
  validationErrors = [],
}: BrandPalettePreviewProps) {
  const navigate = useNavigate();

  // Loading state
  if (brandPalette === null && validationErrors.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  // Error state — missing required fields
  if (validationErrors.length > 0) {
    return (
      <Alert variant="destructive" className="py-3">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Configuración de marca incompleta</p>
            <ul className="text-xs list-disc list-inside text-destructive/80">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => navigate('/brand-palette')}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Configurar
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Valid palette loaded
  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/20 px-4 py-3">
      {/* Color swatches */}
      <div className="flex items-center gap-1.5">
        <div
          className="h-5 w-5 rounded-full border border-border shadow-sm"
          style={{ backgroundColor: brandPalette!.primary_color }}
          title={`Primario: ${brandPalette!.primary_color}`}
        />
        <div
          className="h-5 w-5 rounded-full border border-border shadow-sm"
          style={{ backgroundColor: brandPalette!.secondary_color }}
          title={`Secundario: ${brandPalette!.secondary_color}`}
        />
        <div
          className="h-5 w-5 rounded-full border border-border shadow-sm"
          style={{ backgroundColor: brandPalette!.accent_color }}
          title={`Acento: ${brandPalette!.accent_color}`}
        />
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Typography */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {brandPalette!.fonts.display && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
            {brandPalette!.fonts.display}
          </span>
        )}
        {brandPalette!.fonts.body && (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {brandPalette!.fonts.body}
          </span>
        )}
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Logo indicator */}
      {brandPalette!.logo_url && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground" title={brandPalette!.logo_url}>
          <ImageIcon className="h-3.5 w-3.5" />
          <span>Logo</span>
        </div>
      )}
    </div>
  );
}
