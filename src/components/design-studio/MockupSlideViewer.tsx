/**
 * MockupSlideViewer — Full-screen slide viewer for a list of mockups.
 *
 * Replaces the single-image lightboxes that lived inside MockupGallery and
 * SavedMockupsGrid: once open, the user can walk the whole list with the
 * arrows (or ← / → keys) without going back to the grid.
 */

import { useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadImage } from '@/utils/downloadFile'

export interface MockupSlideItem {
  /** Stable key */
  id: string
  /** Anything an <img src> accepts: public URL or data: URL */
  src: string
  /** Shown under the image, e.g. "linkedin post" */
  label?: string
  /** File name used by the download action */
  downloadName?: string
}

interface MockupSlideViewerProps {
  items: MockupSlideItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  /** Extra per-slide actions (like/dislike, iterate, select...) */
  renderActions?: (item: MockupSlideItem, index: number) => React.ReactNode
}

export function MockupSlideViewer({
  items,
  index,
  onIndexChange,
  onClose,
  renderActions,
}: MockupSlideViewerProps) {
  const total = items.length
  const current = items[index]

  const goPrev = useCallback(() => {
    if (total === 0) return
    onIndexChange((index - 1 + total) % total)
  }, [index, total, onIndexChange])

  const goNext = useCallback(() => {
    if (total === 0) return
    onIndexChange((index + 1) % total)
  }, [index, total, onIndexChange])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, goPrev, goNext])

  // Keep the active thumbnail in view while navigating
  useEffect(() => {
    document
      .querySelector(`[data-slide-thumb="${index}"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [index])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista ampliada del mockup"
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium text-white tabular-nums">
            {index + 1} / {total}
          </span>
          {current.label && (
            <span className="truncate rounded bg-white/10 px-2 py-1 text-xs text-white/80">
              {current.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {renderActions?.(current, index)}
          <button
            type="button"
            onClick={() => downloadImage(current.src, current.downloadName ?? `mockup-${index + 1}.png`)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            title="Descargar"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            title="Cerrar (Esc)"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Slide */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              goPrev()
            }}
            className="absolute left-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:left-6"
            title="Anterior (←)"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}

        <img
          key={current.id}
          src={current.src}
          alt={current.label ? `Mockup ${current.label}` : `Mockup ${index + 1}`}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />

        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              goNext()
            }}
            className="absolute right-2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:right-6"
            title="Siguiente (→)"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {total > 1 && (
        <div
          className="flex gap-2 overflow-x-auto px-4 py-3"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              data-slide-thumb={i}
              onClick={() => onIndexChange(i)}
              className={cn(
                'h-16 w-16 shrink-0 overflow-hidden rounded border-2 transition',
                i === index
                  ? 'border-primary opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-90',
              )}
              title={`Mockup ${i + 1}`}
            >
              <img
                src={item.src}
                alt=""
                className="h-full w-full bg-black/40 object-contain"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
