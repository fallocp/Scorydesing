import { useMemo, useState } from 'react';
import { Monitor } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { DisclaimerPreview } from './DisclaimerPreview';
import { useDesignStore } from '@/store/designStore';
import { PLATFORM_DIMENSIONS, type PlatformFormat } from '@/types/xendingDesign';

const PLATFORM_LABELS: Record<PlatformFormat, string> = {
  'instagram-story': 'Story',
  'instagram-post': 'Post Cuadrado',
  'linkedin-post': 'LinkedIn / Horizontal',
  'banner': 'Banner / Presentación',
};

interface HtmlPreviewPanelProps {
  /** Optional HTML string to preview. If not provided, shows a placeholder. */
  html?: string;
}

export function HtmlPreviewPanel({ html }: HtmlPreviewPanelProps) {
  const selectedPlatforms = useDesignStore((s) => s.selectedPlatforms);
  const [activePlatform, setActivePlatform] = useState<PlatformFormat>(
    selectedPlatforms[0] ?? 'instagram-post'
  );

  const dims = PLATFORM_DIMENSIONS[activePlatform];

  // Calculate scale to fit the preview container while maintaining aspect ratio
  const maxContainerWidth = 600;
  const maxContainerHeight = 500;
  const scale = useMemo(() => {
    const scaleX = maxContainerWidth / dims.width;
    const scaleY = maxContainerHeight / dims.height;
    return Math.min(scaleX, scaleY, 1);
  }, [dims.width, dims.height]);

  const scaledWidth = dims.width * scale;
  const scaledHeight = dims.height * scale;

  // Build a blob URL for the iframe content
  const iframeSrc = useMemo(() => {
    if (!html) return '';
    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [html]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Vista Previa</h2>
          <p className="text-sm text-muted-foreground">
            Previsualiza tu diseño ensamblado en las dimensiones de la plataforma objetivo.
          </p>
        </div>

        {/* Platform selector */}
        {selectedPlatforms.length > 1 && (
          <div className="flex items-center gap-2">
            <Label htmlFor="preview-platform" className="text-sm">
              Plataforma:
            </Label>
            <Select
              value={activePlatform}
              onValueChange={(v) => setActivePlatform(v as PlatformFormat)}
            >
              <SelectTrigger id="preview-platform" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {selectedPlatforms.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Dimensions badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          <Monitor className="h-3 w-3 mr-1" />
          {PLATFORM_LABELS[activePlatform]}
        </Badge>
        <Badge variant="outline">
          {dims.width} × {dims.height}px
        </Badge>
      </div>

      {/* Preview area */}
      <div
        className="flex items-center justify-center bg-muted/30 rounded-lg border p-4"
        style={{ minHeight: scaledHeight + 32 }}
      >
        {html ? (
          <iframe
            src={iframeSrc}
            title={`Vista previa — ${PLATFORM_LABELS[activePlatform]}`}
            width={dims.width}
            height={dims.height}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: dims.width,
              height: dims.height,
              border: 'none',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
            sandbox="allow-same-origin"
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg"
            style={{ width: scaledWidth, height: scaledHeight }}
          >
            <Monitor className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">La vista previa HTML aparecerá aquí</p>
            <p className="text-xs mt-1">
              Completa los pasos anteriores para generar una vista previa
            </p>
          </div>
        )}
      </div>

      {/* Disclaimer preview */}
      <DisclaimerPreview />
    </div>
  );
}
