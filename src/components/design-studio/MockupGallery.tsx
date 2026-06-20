import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, Download, Maximize2, X, RefreshCw, Send } from 'lucide-react'
import type { GeneratedMockup } from '@/types/design-studio'

export interface MockupGalleryProps {
  mockups: GeneratedMockup[]
  selectedIndex: number | null
  onSelect: (index: number) => void
  onConvert: () => void
  onRegenerate?: () => void
  onRegenerateWithFeedback?: (feedback: string) => void
  onDiscard?: () => void
  isLoading?: boolean
  disabled?: boolean
}

/** Download a base64 image as PNG */
function downloadMockup(mockup: GeneratedMockup) {
  const link = document.createElement('a')
  link.href = `data:image/png;base64,${mockup.image_base64}`
  link.download = `mockup-${mockup.index + 1}.png`
  link.click()
}

export function MockupGallery({
  mockups,
  selectedIndex,
  onSelect,
  onConvert,
  onRegenerate,
  onDiscard,
  isLoading = false,
  disabled = false,
}: MockupGalleryProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  if (isLoading && mockups.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Skeleton className="aspect-[3/4] w-full rounded-lg" />
        </div>
        <p className="text-sm text-muted-foreground text-center">Generando mockup...</p>
      </div>
    )
  }

  if (mockups.length === 0) {
    return null
  }

  return (
    <>
      {/* Lightbox / Expanded view */}
      {expandedIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpandedIndex(null)}
          role="dialog"
          aria-label="Vista ampliada del mockup"
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={`data:image/png;base64,${mockups.find(m => m.index === expandedIndex)?.image_base64}`}
              alt={`Mockup ${expandedIndex + 1} ampliado`}
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            <div className="absolute top-3 right-3 flex gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="h-9 w-9 rounded-full bg-white/90 hover:bg-white shadow"
                onClick={() => {
                  const mockup = mockups.find(m => m.index === expandedIndex)
                  if (mockup) downloadMockup(mockup)
                }}
                title="Descargar"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-9 w-9 rounded-full bg-white/90 hover:bg-white shadow"
                onClick={() => setExpandedIndex(null)}
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-center text-white/70 text-xs mt-3">
              Mockup {expandedIndex + 1} de {mockups.length}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {mockups.map((mockup) => (
            <div
              key={mockup.index}
              className={cn(
                'group relative overflow-hidden rounded-lg border-2 transition-all',
                selectedIndex === mockup.index
                  ? 'border-primary ring-2 ring-primary'
                  : 'border-transparent hover:border-muted-foreground/30',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {/* Main image — click to select */}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(mockup.index)}
                className="w-full"
              >
                <img
                  src={`data:image/png;base64,${mockup.image_base64}`}
                  alt={`Mockup opción ${mockup.index + 1}`}
                  className="w-full object-cover"
                />
              </button>

              {/* Overlay actions — visible on hover */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setExpandedIndex(mockup.index)}
                  className="h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  title="Ampliar"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadMockup(mockup)}
                  className="h-7 w-7 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  title="Descargar"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Selection indicator */}
              {selectedIndex === mockup.index && (
                <div className="absolute top-2 left-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">✓</span>
                </div>
              )}
            </div>
          ))}

          {/* Generate more button */}
          {onRegenerate && !isLoading && (
            <button
              type="button"
              disabled={disabled}
              onClick={onRegenerate}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 transition-all aspect-[3/4] text-muted-foreground hover:text-primary"
            >
              <Plus className="h-8 w-8" />
              <span className="text-xs font-medium">Generar otra</span>
            </button>
          )}

          {/* Loading indicator when generating more */}
          {isLoading && (
            <Skeleton className="aspect-[3/4] w-full rounded-lg" />
          )}
        </div>

        {/* Info text */}
        <p className="text-xs text-muted-foreground text-center">
          {mockups.length} mockup{mockups.length > 1 ? 's' : ''} generado{mockups.length > 1 ? 's' : ''} · Las imágenes se guardan en memoria hasta que cierres la página
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            onClick={onConvert}
            disabled={disabled || selectedIndex === null}
            className="flex-1"
          >
            Convertir a HTML
          </Button>

          {onDiscard && (
            <Button
              variant="outline"
              onClick={onDiscard}
              disabled={disabled}
              title="Descartar todo y empezar de nuevo"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
