/**
 * SavedMockupsGrid — Shows previously generated mockups from the database.
 * User can click one to select it for HTML conversion.
 * Includes 👍/👎 feedback buttons, visual indicators, and iteration chat.
 */

import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Maximize2, Download, ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { SavedMockup } from '@/hooks/useDesignMockups'
import { useLikeMockup, useDislikeMockup, useRecentFeedback } from '@/hooks/useDesignFeedback'
import { MockupIterationChat } from './MockupIterationChat'

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
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)
  const [iteratingMockup, setIteratingMockup] = useState<SavedMockup | null>(null)
  const { data: feedbackMap } = useRecentFeedback()
  const likeMutation = useLikeMockup()
  const dislikeMutation = useDislikeMockup()

  const handleLike = (e: React.MouseEvent, mockup: SavedMockup) => {
    e.stopPropagation()
    likeMutation.mutate({
      mockupId: mockup.id,
      selections: mockup.selections,
      promptUsed: mockup.prompt_used,
    })
  }

  const handleDislike = (e: React.MouseEvent, mockup: SavedMockup) => {
    e.stopPropagation()
    dislikeMutation.mutate({
      mockupId: mockup.id,
      selections: mockup.selections,
      promptUsed: mockup.prompt_used,
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Mockups guardados</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (mockups.length === 0) {
    return null
  }

  return (
    <>
      {/* Lightbox */}
      {expandedUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setExpandedUrl(null)}
          role="dialog"
          aria-label="Vista ampliada"
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedUrl}
              alt="Mockup ampliado"
              className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
            />
            <Button
              size="icon"
              variant="secondary"
              className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 hover:bg-white shadow"
              onClick={() => setExpandedUrl(null)}
            >
              ✕
            </Button>
          </div>
        </div>
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
        <h3 className="text-sm font-semibold text-foreground">
          Mockups guardados ({mockups.length})
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {mockups.map((mockup) => {
            const feedback = feedbackMap?.get(mockup.id)
            const isLiked = feedback === 'like'
            const isDisliked = feedback === 'dislike'

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
                  alt={`Mockup ${mockup.platform}`}
                  className="w-full object-cover aspect-[3/4]"
                  loading="lazy"
                />

                {/* Hover actions — top right */}
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExpandedUrl(mockup.image_url); }}
                    className="h-6 w-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                    title="Ampliar"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                  <a
                    href={mockup.image_url}
                    download={`mockup-${mockup.id.slice(0, 8)}.png`}
                    onClick={(e) => e.stopPropagation()}
                    className="h-6 w-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                    title="Descargar"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                </div>

                {/* Bottom right: Like/Dislike + Iterate */}
                <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onIterateFrom && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIteratingMockup(mockup)
                      }}
                      className="h-6 w-6 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary/80 transition"
                      title="Iterar sobre este mockup"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleLike(e, mockup)}
                    className={cn(
                      'h-6 w-6 flex items-center justify-center rounded-full transition',
                      isLiked
                        ? 'bg-green-500 text-white'
                        : 'bg-black/60 text-white hover:bg-green-600',
                    )}
                    title="Me gusta"
                    disabled={likeMutation.isPending}
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDislike(e, mockup)}
                    className={cn(
                      'h-6 w-6 flex items-center justify-center rounded-full transition',
                      isDisliked
                        ? 'bg-red-500 text-white'
                        : 'bg-black/60 text-white hover:bg-red-600',
                    )}
                    title="No me gusta"
                    disabled={dislikeMutation.isPending}
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </div>

                {/* Platform badge */}
                <div className="absolute bottom-1.5 left-1.5">
                  <span className="text-[9px] font-medium bg-black/50 text-white px-1.5 py-0.5 rounded">
                    {mockup.platform.replace('-', ' ')}
                  </span>
                </div>

                {/* Top-left indicator */}
                {isLiked ? (
                  <div className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                    <ThumbsUp className="h-2.5 w-2.5 text-white" />
                  </div>
                ) : selectedId === mockup.id ? (
                  <div className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">✓</span>
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
