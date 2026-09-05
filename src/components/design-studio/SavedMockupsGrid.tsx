/**
 * SavedMockupsGrid — Shows previously generated mockups from the database.
 * User can click one to select it for HTML conversion.
 * Includes 👍/👎 feedback buttons, visual indicators, and iteration chat.
 *
 * Also provides browsing over a potentially large history:
 * - Filter by tema (commercial branch) and by date range.
 * - Pagination in numbered tabs, 30 per page.
 * - A per-piece "subido" checkmark that persists the date it was published.
 */

import { cn } from '@/lib/utils'
import { downloadImage } from '@/utils/downloadFile'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Maximize2,
  Download,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Images,
  Instagram,
  Facebook,
  Linkedin,
  Loader2,
  RectangleHorizontal,
  Stamp,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SavedMockup } from '@/hooks/useDesignMockups'
import { useDeleteMockup, useToggleMockupUploaded } from '@/hooks/useDesignMockups'
import { useLikeMockup, useDislikeMockup, useRecentFeedback } from '@/hooks/useDesignFeedback'
import { useToast } from '@/components/ui/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MockupIterationChat } from './MockupIterationChat'
import { MockupSlideViewer, type MockupSlideItem } from './MockupSlideViewer'
import { BrandLayerDialog } from './BrandLayerDialog'
import { CollapsibleSection } from './CollapsibleSection'

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

/** How many mockups fit on one page tab. */
const PAGE_SIZE = 30

/** Sentinel for "no tema" in the filter dropdown — mockups saved in free/custom mode. */
const NO_THEME = '__none__'

/**
 * Tema of a mockup = the commercial branch it was generated from.
 * Lives inside the `selections` JSONB; absent for free/custom pieces.
 */
function mockupTheme(mockup: SavedMockup): string | null {
  const sel = mockup.selections as { commercialBranchSlug?: string | null } | null
  const slug = sel?.commercialBranchSlug
  return slug && slug.trim() ? slug : null
}

/** Slug → readable label: `costos-ahorro` → `Costos Ahorro`. */
function themeLabel(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Short date for the "subido" badge, e.g. `01 sep`. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

/**
 * Page numbers to render, collapsing long runs with ellipsis so the tab strip
 * stays a single row: 1 … 4 5 6 … 20.
 */
function buildPageList(total: number, current: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'gap')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('gap')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('gap')
  pages.push(total)
  return pages
}

interface SavedMockupsGridProps {
  mockups: SavedMockup[]
  isLoading: boolean
  onSelect: (mockup: SavedMockup) => void
  onIterateFrom?: (mockup: SavedMockup, feedback: string) => void
  selectedId: string | null
  isGenerating?: boolean
  /**
   * Called when the selected mockup is deleted, so the caller can drop whatever
   * it loaded from it. Optional: a caller that keeps no state can ignore it.
   */
  onClearSelection?: () => void
}

export function SavedMockupsGrid({
  mockups,
  isLoading,
  onSelect,
  onIterateFrom,
  selectedId,
  isGenerating = false,
  onClearSelection,
}: SavedMockupsGridProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [iteratingMockup, setIteratingMockup] = useState<SavedMockup | null>(null)
  const [brandingMockup, setBrandingMockup] = useState<SavedMockup | null>(null)
  /** Mockup pending deletion. Deleting is irreversible, so it goes through a confirm. */
  const [deletingMockup, setDeletingMockup] = useState<SavedMockup | null>(null)

  // --- Filters + pagination ---
  const [themeFilter, setThemeFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [page, setPage] = useState<number>(1)

  const { data: feedbackMap } = useRecentFeedback()
  const likeMutation = useLikeMockup()
  const dislikeMutation = useDislikeMockup()
  const deleteMutation = useDeleteMockup()
  const uploadedMutation = useToggleMockupUploaded()
  const { toast } = useToast()

  /** Distinct temas present in the data, for the dropdown. */
  const themes = useMemo(() => {
    const set = new Set<string>()
    for (const m of mockups) {
      const t = mockupTheme(m)
      if (t) set.add(t)
    }
    return Array.from(set).sort()
  }, [mockups])

  const hasUntagged = useMemo(() => mockups.some((m) => mockupTheme(m) === null), [mockups])

  /** Apply tema + date filters. `created_at` is ISO, so a YYYY-MM-DD slice compares as text. */
  const filtered = useMemo(() => {
    return mockups.filter((m) => {
      if (themeFilter !== 'all') {
        const t = mockupTheme(m)
        if (themeFilter === NO_THEME) {
          if (t !== null) return false
        } else if (t !== themeFilter) {
          return false
        }
      }
      const day = (m.created_at ?? '').slice(0, 10)
      if (dateFrom && day < dateFrom) return false
      if (dateTo && day > dateTo) return false
      return true
    })
  }, [mockups, themeFilter, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Clamp instead of trusting `page`: keeps rendering sane even if a filter shrank
  // the list. The handlers below already reset to page 1 on every filter change.
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // Filters reset the page inline (not via an effect): changing a filter while on
  // page 5 would otherwise land on an empty page of a shorter filtered list.
  const applyThemeFilter = (value: string) => {
    setThemeFilter(value)
    setPage(1)
  }
  const applyDateFrom = (value: string) => {
    setDateFrom(value)
    setPage(1)
  }
  const applyDateTo = (value: string) => {
    setDateTo(value)
    setPage(1)
  }

  const hasActiveFilters = themeFilter !== 'all' || dateFrom !== '' || dateTo !== ''
  const clearFilters = () => {
    setThemeFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const confirmDelete = async () => {
    if (!deletingMockup) return
    const target = deletingMockup
    setDeletingMockup(null)

    try {
      await deleteMutation.mutateAsync({ id: target.id })
      // Clearing the selection matters: the store still holds this image loaded
      // for HTML conversion, and leaving it selected points the flow at a mockup
      // that no longer exists.
      if (selectedId === target.id) onClearSelection?.()
      toast({ title: 'Mockup borrado' })
    } catch (err) {
      toast({
        title: 'No se pudo borrar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  const toggleUploaded = (mockup: SavedMockup) => {
    uploadedMutation.mutate(
      { id: mockup.id, uploaded: !mockup.uploaded_at },
      {
        onError: (err) =>
          toast({
            title: 'No se pudo actualizar',
            description: err instanceof Error ? err.message : 'Error desconocido',
            variant: 'destructive',
          }),
      },
    )
  }

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

  // Slide viewer walks the current page, so its indices line up with the grid.
  const slideItems: MockupSlideItem[] = pageItems.map((mockup) => ({
    id: mockup.id,
    src: mockup.image_url,
    label: platformMeta(mockup.platform).label,
    downloadName: `mockup-${mockup.id.slice(0, 8)}.png`,
  }))

  const selectClass =
    'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40'

  return (
    <>
      {/* Confirmación de borrado: quita la fila y el archivo de Storage, sin vuelta atrás */}
      <AlertDialog
        open={deletingMockup !== null}
        onOpenChange={(open) => !open && setDeletingMockup(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar este mockup?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina el registro y también la imagen del almacenamiento. No se puede
              recuperar. Si el mockup es parte de un carrusel, ese slide se queda sin imagen y
              hay que volver a generarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingMockup && (
            <img
              src={deletingMockup.image_url}
              alt=""
              className="max-h-48 w-full rounded-md object-contain bg-muted/40"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Slide viewer — navigate the current page with ← / → */}
      {expandedIndex !== null && (
        <MockupSlideViewer
          items={slideItems}
          index={expandedIndex}
          onIndexChange={setExpandedIndex}
          onClose={() => setExpandedIndex(null)}
          renderActions={(_item, i) => {
            const mockup = pageItems[i]
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
                <button
                  type="button"
                  onClick={() => {
                    setExpandedIndex(null)
                    setDeletingMockup(mockup)
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-destructive"
                  title="Borrar mockup"
                >
                  <Trash2 className="h-5 w-5" />
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

      {/* Plegable: puede haber muchas piezas y es el bloque más alto de la página,
          así que dejarlo abierto convierte cualquier navegación en un scroll largo. */}
      <CollapsibleSection
        title={`Mockups guardados (${mockups.length})`}
        Icon={Images}
        aside="Clic para seleccionar · ⤢ abre el visor y navegas con ← →"
        bodyClassName="p-4 space-y-4"
      >
        {/* Barra de filtros: tema, rango de fechas y limpiar */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Tema
            <select
              className={selectClass}
              value={themeFilter}
              onChange={(e) => applyThemeFilter(e.target.value)}
            >
              <option value="all">Todos</option>
              {themes.map((slug) => (
                <option key={slug} value={slug}>
                  {themeLabel(slug)}
                </option>
              ))}
              {hasUntagged && <option value={NO_THEME}>Sin tema</option>}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Desde
            <input
              type="date"
              className={selectClass}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => applyDateFrom(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Hasta
            <input
              type="date"
              className={selectClass}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => applyDateTo(e.target.value)}
            />
          </label>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground transition hover:bg-muted"
            >
              Limpiar
            </button>
          )}

          <span className="ml-auto self-center text-xs text-muted-foreground">
            {filtered.length} resultado{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay mockups con estos filtros.
          </p>
        ) : (
          <>
            {/* items-start: tiles keep their own height (a story is taller than a
                square post) instead of stretching to the tallest one in the row. */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-start">
              {pageItems.map((mockup, mockupIndex) => {
                const feedback = feedbackMap?.get(mockup.id)
                const isLiked = feedback === 'like'
                const isDisliked = feedback === 'dislike'
                const isUploaded = !!mockup.uploaded_at
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

                    {/* Top-left: "subido" checkbox (always visible) + estado like/selección */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleUploaded(mockup)
                        }}
                        disabled={
                          uploadedMutation.isPending &&
                          uploadedMutation.variables?.id === mockup.id
                        }
                        className={cn(
                          'flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition',
                          isUploaded
                            ? 'bg-green-600 text-white'
                            : 'bg-black/60 text-white hover:bg-green-700',
                        )}
                        title={isUploaded ? 'Marcado como subido (clic para quitar)' : 'Marcar como subido'}
                      >
                        {uploadedMutation.isPending &&
                        uploadedMutation.variables?.id === mockup.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {isUploaded && mockup.uploaded_at && (
                          <span>{shortDate(mockup.uploaded_at)}</span>
                        )}
                      </button>

                      {isLiked ? (
                        <div className="h-7 w-7 rounded-full bg-green-500 flex items-center justify-center">
                          <ThumbsUp className="h-4 w-4 text-white" />
                        </div>
                      ) : selectedId === mockup.id ? (
                        <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-xs font-bold text-white">✓</span>
                        </div>
                      ) : null}
                    </div>

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
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); downloadImage(mockup.image_url, `mockup-${mockup.id.slice(0, 8)}.png`); }}
                        className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition"
                        title="Descargar"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletingMockup(mockup)
                        }}
                        disabled={deleteMutation.isPending}
                        className="h-9 w-9 flex items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-destructive disabled:opacity-50"
                        title="Borrar mockup"
                      >
                        {deleteMutation.isPending && deleteMutation.variables?.id === mockup.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
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
                  </div>
                )
              })}
            </div>

            {/* Pestañas de páginas: 30 por página */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition hover:bg-muted disabled:opacity-40"
                  title="Anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {buildPageList(totalPages, currentPage).map((p, i) =>
                  p === 'gap' ? (
                    <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      className={cn(
                        'h-8 min-w-8 rounded-md border px-2 text-sm transition',
                        p === currentPage
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-foreground transition hover:bg-muted disabled:opacity-40"
                  title="Siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </CollapsibleSection>
    </>
  )
}
