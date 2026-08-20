import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, Download, Maximize2 } from 'lucide-react'
import type { GeneratedMockup } from '@/types/design-studio'
import { MockupSlideViewer, type MockupSlideItem } from './MockupSlideViewer'

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

  const slideItems: MockupSlideItem[] = mockups.map((mockup) => ({
    id: String(mockup.index),
    src: `data:image/png;base64,${mockup.image_base64}`,
    downloadName: `mockup-${mockup.index + 1}.png`,
  }))

  return (
    <>
      {/* Slide viewer — navigate the session mockups with ← / → */}
      {expandedIndex !== null && (
        <MockupSlideViewer
          items={slideItems}
          index={expandedIndex}
          onIndexChange={setExpandedIndex}
          onClose={() => setExpandedIndex(null)}
          renderActions={(_item, i) => {
            const mockup = mockups[i]
            if (!mockup || disabled) return null
            return (
              <button
                type="button"
                onClick={() => {
                  onSelect(mockup.index)
                  setExpandedIndex(null)
                }}
                className={cn(
                  'h-10 rounded-full px-4 text-sm font-medium transition',
                  selectedIndex === mockup.index
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white/10 text-white hover:bg-white/20',
                )}
              >
                {selectedIndex === mockup.index ? 'Seleccionado' : 'Seleccionar'}
              </button>
            )
          }}
        />
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {mockups.map((mockup, mockupIndex) => (
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
                  onClick={() => setExpandedIndex(mockupIndex)}
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  title="Ampliar"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => downloadMockup(mockup)}
                  className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                  title="Descargar"
                >
                  <Download className="h-4 w-4" />
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
              <span className="text-xs font-medium">Generar otra imagen</span>
            </button>
          )}

          {/* Loading indicator when generating more */}
          {isLoading && (
            <Skeleton className="aspect-[3/4] w-full rounded-lg" />
          )}
        </div>

        {/* Info text. Dice "imagen individual" porque esta galería está al final de
            la página, debajo de la sección del carrusel, y "mockups" se leía como
            el resultado de cualquiera de los dos flujos. */}
        <p className="text-xs text-muted-foreground text-center">
          {mockups.length} imagen{mockups.length > 1 ? 'es' : ''} individual{mockups.length > 1 ? 'es' : ''} generada{mockups.length > 1 ? 's' : ''} · Las imágenes se guardan en memoria hasta que cierres la página
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
