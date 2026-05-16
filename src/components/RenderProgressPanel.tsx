import { Loader2, FileImage } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface RenderProgressPanelProps {
  /** Whether rendering is currently in progress */
  isRendering: boolean;
  /** Total number of files to render */
  totalFiles: number;
  /** Index of the file currently being rendered (0-based) */
  currentFileIndex: number;
  /** Name of the file currently being rendered */
  currentFileName: string;
}

export function RenderProgressPanel({
  isRendering,
  totalFiles,
  currentFileIndex,
  currentFileName,
}: RenderProgressPanelProps) {
  if (!isRendering && totalFiles === 0) {
    return null;
  }

  const completedCount = currentFileIndex;
  const progressPercent = totalFiles > 0 ? (completedCount / totalFiles) * 100 : 0;
  const isComplete = !isRendering && completedCount === totalFiles && totalFiles > 0;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        {isRendering ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#2ED4C7]" />
        ) : (
          <FileImage className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium text-foreground">
          {isRendering
            ? 'Renderizando PNGs...'
            : isComplete
              ? 'Renderizado completo'
              : 'Listo para renderizar'}
        </span>
      </div>

      {/* Progress bar */}
      {(isRendering || isComplete) && (
        <div className="space-y-1.5">
          <Progress value={isComplete ? 100 : progressPercent} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completedCount} de {totalFiles} archivos
            </span>
            {isRendering && currentFileName && (
              <span className="truncate max-w-[200px]">
                Renderizando: {currentFileName}
              </span>
            )}
            {isComplete && <span className="text-green-600">Todo listo</span>}
          </div>
        </div>
      )}
    </div>
  );
}
