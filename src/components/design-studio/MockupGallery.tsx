import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { GeneratedMockup } from '@/types/design-studio'

export interface MockupGalleryProps {
  mockups: GeneratedMockup[]
  selectedIndex: number | null
  onSelect: (index: number) => void
  onConvert: () => void
  isLoading?: boolean
  disabled?: boolean
}

export function MockupGallery({
  mockups,
  selectedIndex,
  onSelect,
  onConvert,
  isLoading = false,
  disabled = false,
}: MockupGalleryProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
        <Button disabled className="w-full">
          Convertir a HTML
        </Button>
      </div>
    )
  }

  if (mockups.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {mockups.map((mockup) => (
          <button
            key={mockup.index}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(mockup.index)}
            className={cn(
              'relative overflow-hidden rounded-lg border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selectedIndex === mockup.index
                ? 'border-primary ring-2 ring-primary'
                : 'border-transparent hover:border-muted-foreground/30',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <img
              src={`data:image/png;base64,${mockup.image_base64}`}
              alt={`Mockup opción ${mockup.index + 1}`}
              className="aspect-square w-full object-cover"
            />
          </button>
        ))}
      </div>

      <Button
        onClick={onConvert}
        disabled={disabled || selectedIndex === null}
        className="w-full"
      >
        Convertir a HTML
      </Button>
    </div>
  )
}
