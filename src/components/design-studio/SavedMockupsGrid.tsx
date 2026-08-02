/**
 * SavedMockupsGrid — Shows previously generated mockups from the database.
 * User can click one to select it for HTML conversion.
 * Includes 👍/👎 feedback buttons, visual indicators, and iteration chat.
 */

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Maximize2,
  Download,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Instagram,
  Facebook,
  Linkedin,
  RectangleHorizontal,
  Stamp,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { SavedMockup } from '@/hooks/useDesignMockups'
import { useLikeMockup, useDislikeMockup, useRecentFeedback } from '@/hooks/useDesignFeedback'
import { MockupIterationChat } from './MockupIterationChat'
import { MockupSlideViewer, type MockupSlideItem } from './MockupSlideViewer'
import { BrandLayerDialog } from './BrandLayerDialog'

/**
 * Icon, short label and thumbnail aspect per platform.
 *
 * `aspect` mirrors the exact size the backend asks the image model for
 * (`platformToSize` in generate-design-mockups): story 1024x1536 (2:3),
 * IG post 1024x1024 (1:1), LinkedIn/Facebook/banner 1536x1024 (3:2).
 * Matching the box to that ratio removes the letterboxing. `object-contain`
 * stays as the safety net so an old mockup with a different ratio is shown
 * whole instead of cropped.
 */
const PLATFORM_META: Record<string, { label: string; Icon: LucideIcon; aspect: string }> = {
  'instagram-story': { label: 'IG Story', Icon: Instagram, aspect: 'aspect-[2/3]' },
  'instagram-post': { label: 'IG Post', Icon: Instagram, aspect: 'aspect-square' },
  'facebook-post': { label: 'Facebook', Icon: Facebook, aspect: 'aspect-[3/2]' },
  'linkedin-post': { label: 'LinkedIn', Icon: Linkedin, aspect: 'aspect-[3/2]' },
  banner: { label: 'Banner', Icon: RectangleHorizontal, aspect: 'aspect-[3/2]' },
}

function platformMeta(platform: string) {
  return (
    PLATFORM_META[platform] ?? {
      label: platform.replace(/-/g, ' '),
      Icon: RectangleHorizontal,
      aspect: 'aspect-square',
    }
  )
}

interface SavedMockupsGridProps {
  mockups: SavedMockup[]
  isLoading: boolean
  onSelect: (mockup: SavedMockup) => void
  onIterateFrom?: (mockup: SavedMockup, feedback: string) => void
  selectedId: string | null
  isGenerating?: boolean
}

export function SavedMockupsGrid({
  mockups,
  isLoading,
  onSelect,
  onIterateFrom,
  selectedId,
  isGenerating = false,
}: SavedMockupsGridProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [iteratingMockup, setIteratingMockup] = useState<SavedMockup | null>(null)
  const [brandingMockup, setBrandingMockup] = useState<SavedMockup | null>(null)
  const { data: feedbackMap } = useRecentFeedback()
  const likeMutation = useLikeMockup()
  const dislikeMutation = useDislikeMockup()

  const likeMockup = (mockup: SavedMockup) => {
    likeMutation.mutate({
      mockupId: mockup.id,
      selections: mockup.selections,
      promptUsed: mockup.prompt_used,
    })
  }

  const dislikeMockup = (mockup: SavedMockup) => {
    dislikeMutation.mutate({
      mockupId: mockup.id,
      selections: mockup.selections,
      promptUsed: mockup.prompt_used,
    })
  }

  const handleLike = (e: React.MouseEvent, mockup: SavedMockup) => {
    e.stopPropagation()
    likeMockup(mockup)
  }

  const handleDislike = (e: React.MouseEvent, mockup: SavedMockup) => {
    e.stopPropagation()
    dislikeMockup(mockup)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Mockups guardados</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (mockups.length === 0) {
    return null
  }

  const slideItems: MockupSlideItem[] = mockups.map((mockup) => ({
    id: mockup.id,
    src: mockup.image_url,
    label: platformMeta(mockup.platform).label,
    downloadName: `mockup-${mockup.id.slice(0, 8)}.png`,
  }))

  return (
    <>
      {/* Slide viewer — navigate the whole list with ← / → */}
      {expandedIndex !== null && (
        <MockupSlideViewer
          items={slideItems}
          index={expandedIndex}
          onIndexChange={setExpandedIndex}
          onClose={() => setExpandedIndex(null)}
          renderActions={(_item, i) => {
            const mockup = mockups[i]
            if (!mockup) return null
            const feedback = feedbackMap?.get(mockup.id)
            return (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setExpandedIndex(null)
                    setBrandingMockup(mockup)
                  }}
                  className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-medium text-white transition hover:bg-white/20"
                  title="Montar logo y disclaimer"
                >
                  <Stamp className="h-4 w-4" />
                  Montar marca
                </button>
                {onIterateFrom && (
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedIndex(null)
                      setIteratingMockup(mockup)
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-primary/80"
                    title="Iterar sobre este mockup"
                  >
                    <MessageSquare className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => likeMockup(mockup)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full transition',
                    feedback === 'like'
                      ? 'bg-green-500 text-white'
                      : 'bg-white/10 text-white hover:bg-green-600',
                  )}
                  title="Me gusta"
                  disabled={likeMutation.isPending}
                >
                  <ThumbsUp className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => dislikeMockup(mockup)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full transition',
                    feedback === 'dislike'
                      ? 'bg-red-500 text-white'
                      : 'bg-white/10 text-white hover:bg-red-600',
                  )}
                  title="No me gusta"
                  disabled={dislikeMutation.isPending}
                >
                  <ThumbsDown className="h-5 w-5" />
                </button>
              </>
            )
          }}
        />
      )}

      {/* Brand layer — logo, disclaimer and optional person over the mockup */}
      {brandingMockup && (
        <BrandLayerDialog
          mockup={brandingMockup}
          onClose={() => setBrandingMockup(null)}
        />
      )}

      {/* Iteration Chat Modal */}
      {iteratingMockup && onIterateFrom && (
        <MockupIterationChat
          imageUrl={iteratingMockup.image_url}
          originalPrompt={iteratingMockup.prompt_used || ''}
          mockupId={iteratingMockup.id}
          isGenerating={isGenerating}
          onGenerate={(feedback) => {
            onIterateFrom(iteratingMockup, feedback)
            setIteratingMockup(null)
          }}
          onClose={() => setIteratingMockup(null)}
        />
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-semibold text-foreground">
            Mockups guardados ({mockups.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Clic para seleccionar · ⤢ abre el visor y navegas con ← →
          </p>
        </div>
        {/* items-start: tiles keep their own height (a story is taller than a
            square post) instead of stretching to the tallest one in the row. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-start">
          {mockups.map((mockup, mockupIndex) => {
            const feedback = feedbackMap?.get(mockup.id)
            const isLiked = feedback === 'like'
            const isDisliked = feedback === 'dislike'
            const {
              label: platformLabel,
              Icon: PlatformIcon,
              aspect: platformAspect,
            } = platformMeta(mockup.platform)

            return (
              <div
                key={mockup.id}
                className={cn(
                  'group relative overflow-hidden rounded-lg border-2 transition-all cursor-pointer',
                  isLiked && 'border-green-500 ring-1 ring-green-500/30',
                  isDisliked && 'opacity-50',
                  !isLiked && !isDisliked && selectedId === mockup.id
                    ? 'border-primary ring-2 ring-primary'
                    : !isLiked && !isDisliked && 'border-transparent hover:border-muted-foreground/30',
                )}
                onClick={() => onSelect(mockup)}
              >
                <img
                  src={mockup.image_url}
                  alt={`Mockup ${platformLabel}`}
                  className={cn('w-full object-contain bg-muted/40', platformAspect)}
                  loading="lazy"
                />

                {/* Hover actions — top right */}
                <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpandedIndex(mockupIndex); }}
                    className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                    title="Ampliar"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                  <a
                    href={mockup.image_url}
                    download={`mockup-${mockup.id.slice(0, 8)}.png`}
                    onClick={(e) => e.stopPropagation()}
                    className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                    title="Descargar"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </div>

                {/* Bottom right: Like/Dislike + Iterate */}
                <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setBrandingMockup(mockup)
                    }}
                    className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary/80 transition"
                    title="Montar marca"
                  >
                    <Stamp className="h-4 w-4" />
                  </button>
                  {onIterateFrom && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIteratingMockup(mockup)
                      }}
                      className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary/80 transition"
                      title="Iterar sobre este mockup"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleLike(e, mockup)}
                    className={cn(
                      'h-9 w-9 flex items-center justify-center rounded-full transition',
                      isLiked
                        ? 'bg-green-500 text-white'
                        : 'bg-black/60 text-white hover:bg-green-600',
                    )}
                    title="Me gusta"
                    disabled={likeMutation.isPending}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDislike(e, mockup)}
                    className={cn(
                      'h-9 w-9 flex items-center justify-center rounded-full transition',
                      isDisliked
                        ? 'bg-red-500 text-white'
                        : 'bg-black/60 text-white hover:bg-red-600',
                    )}
                    title="No me gusta"
                    disabled={dislikeMutation.isPending}
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </button>
                </div>

                {/* Platform badge */}
                <div className="absolute bottom-2 left-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium bg-black/60 text-white px-2 py-1 rounded">
                    <PlatformIcon className="h-3.5 w-3.5" />
                    {platformLabel}
                  </span>
                </div>

                {/* Top-left indicator */}
                {isLiked ? (
                  <div className="absolute top-2 left-2 h-7 w-7 rounded-full bg-green-500 flex items-center justify-center">
                    <ThumbsUp className="h-4 w-4 text-white" />
                  </div>
                ) : selectedId === mockup.id ? (
                  <div className="absolute top-2 left-2 h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-white">✓</span>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
