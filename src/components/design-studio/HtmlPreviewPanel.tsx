import { useMemo, useState } from 'react';
import { ChevronDown, History, Loader2, Monitor, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  PLATFORM_DIMENSIONS,
  type HtmlIteration,
  type PlatformFormat,
} from '@/types/design-studio';

interface HtmlPreviewPanelProps {
  /** HTML string to render in the preview iframe */
  html: string;
  /** Target platform for dimension calculation */
  platform: PlatformFormat;
  /** Current iteration count */
  iterationCount: number;
  /** Maximum allowed iterations */
  maxIterations?: number;
  /** History of HTML iterations for version comparison */
  htmlHistory: HtmlIteration[];
  /** Callback when user submits iteration feedback */
  onIterate: (feedback: string) => void;
  /** Whether a generation is in progress */
  isLoading?: boolean;
  /** Whether the panel is externally disabled */
  disabled?: boolean;
}

export function HtmlPreviewPanel({
  html,
  platform,
  iterationCount,
  maxIterations = 10,
  htmlHistory,
  onIterate,
  isLoading = false,
  disabled = false,
}: HtmlPreviewPanelProps) {
  const [feedback, setFeedback] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const dims = PLATFORM_DIMENSIONS[platform];

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

  const isLimitReached = iterationCount >= maxIterations;
  const isDisabled = isLimitReached || isLoading || disabled;

  const handleSubmit = () => {
    const trimmed = feedback.trim();
    if (!trimmed || isDisabled) return;
    onIterate(trimmed);
    setFeedback('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Vista Previa HTML</h2>
          <p className="text-sm text-muted-foreground">
            Previsualiza y refina tu diseño con instrucciones en lenguaje natural.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <Monitor className="h-3 w-3 mr-1" />
            {dims.width} × {dims.height}px
          </Badge>
        </div>
      </div>

      {/* Preview area */}
      <div
        className="flex items-center justify-center bg-muted/30 rounded-lg border p-4 overflow-hidden"
        style={{ minHeight: scaledHeight + 32 }}
      >
        <div
          style={{
            width: scaledWidth,
            height: scaledHeight,
            position: 'relative',
          }}
        >
          <iframe
            srcDoc={html}
            title={`Vista previa — ${platform}`}
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
              position: 'absolute',
              top: 0,
              left: 0,
            }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>

      {/* Iteration counter */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Iteración {iterationCount}/{maxIterations}
        </span>
        {isLimitReached && (
          <span className="text-sm text-amber-600 font-medium">
            Has alcanzado el máximo de iteraciones
          </span>
        )}
      </div>

      {/* Feedback input */}
      <div className="space-y-2">
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLimitReached
              ? 'Límite de iteraciones alcanzado. Guarda el template o descarta la sesión.'
              : 'Describe los cambios que deseas (ej: "Más oscuro", "CTA más grande")...'
          }
          disabled={isDisabled}
          className="resize-none min-h-[80px]"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={isDisabled || !feedback.trim()}
            size="sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Refinando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Refinar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Iteration history */}
      {htmlHistory.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" />
                Historial de iteraciones ({htmlHistory.length})
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  historyOpen ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="space-y-2 max-h-60 overflow-y-auto rounded-md border p-3">
              {htmlHistory.map((iteration) => (
                <div
                  key={iteration.version}
                  className="flex items-start gap-3 p-2 rounded-md bg-muted/50"
                >
                  <Badge variant="outline" className="shrink-0 mt-0.5">
                    v{iteration.version}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {iteration.feedback ?? 'Versión inicial'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(iteration.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
