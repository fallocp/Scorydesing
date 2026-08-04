/**
 * BrandLayerDialog — mounts brand elements on top of an already generated
 * mockup: logo, legal disclaimer and an optional person block.
 *
 * The flow reuses what already exists instead of adding a second editor:
 *  1. Build the brand-layer HTML at the image's own pixel size.
 *  2. Hand it to `VisualDesignEditor` (the presentations editor) to drag,
 *     resize and edit text.
 *  3. Export the PNG through the Puppeteer render server, at the SAME size the
 *     image came out of the model, and save it as a variant of the original
 *     (`parent_mockup_id`) so it lands in the saved-mockups grid.
 *
 * The original mockup is never modified.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Loader2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { VisualDesignEditor } from '@/components/VisualDesignEditor'
import { useActiveBusiness } from '@/hooks/useActiveBusiness'
import { useBusinessConfig } from '@/hooks/useBusinessConfig'
import {
  useBrandLogos,
  useDeleteBrandLogo,
  useUploadBrandLogo,
  type BrandLogo,
} from '@/hooks/useBrandLogos'
import { useSaveMockup, type SavedMockup } from '@/hooks/useDesignMockups'
import { renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer'
import {
  BRAND_LAYER_ELEMENTS,
  buildBrandLayerHtml,
  patchBrandLayerHtml,
  type BrandLayerPatch,
} from '@/utils/design-studio/buildBrandLayerHtml'
import { sampleBottomColor } from '@/utils/design-studio/sampleImageColor'
import { Slider } from '@/components/ui/slider'
import {
  useBrandDisclaimers,
  useDeleteBrandDisclaimer,
  useSaveBrandDisclaimer,
} from '@/hooks/useBrandDisclaimers'
import {
  useDeletePromoter,
  usePromoters,
  useSavePromoter,
} from '@/hooks/usePromoters'
import { PLATFORM_DIMENSIONS, type PlatformFormat } from '@/types/design-studio'

/**
 * Brand identities available for the layer. Kept as a constant on purpose: the
 * only thing that changes between them today is the logo and the legal text,
 * so this needs neither a new tenant nor a migration.
 */
const BRAND_OPTIONS = [
  { key: 'xending', label: 'Xending', wordmark: 'Xending' },
  { key: 'xending_usa', label: 'Xending USA', wordmark: 'Xending USA' },
  { key: 'xending_capital', label: 'Xending Capital', wordmark: 'Xending Capital' },
] as const

type BrandKey = (typeof BRAND_OPTIONS)[number]['key']

interface BrandLayerDialogProps {
  mockup: SavedMockup
  onClose: () => void
}

export function BrandLayerDialog({ mockup, onClose }: BrandLayerDialogProps) {
  const { toast } = useToast()
  const { activeBusinessId } = useActiveBusiness()
  const { data: businessConfig } = useBusinessConfig()
  const saveMockup = useSaveMockup()
  const uploadLogo = useUploadBrandLogo()
  const deleteLogo = useDeleteBrandLogo()

  const [brandKey, setBrandKey] = useState<BrandKey>('xending')
  const { logos, isLoading: isLoadingLogos } = useBrandLogos(brandKey)

  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUrlDraft, setLogoUrlDraft] = useState('')
  const [wordmark, setWordmark] = useState<string>('xending')
  const [disclaimer, setDisclaimer] = useState('')
  const [disclaimerTheme, setDisclaimerTheme] = useState<'dark' | 'light'>('dark')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)

  // Saved legal texts per brand (brand_disclaimers).
  const { data: presets = [], error: presetsError } = useBrandDisclaimers(brandKey)
  const savePreset = useSaveBrandDisclaimer()
  const deletePreset = useDeleteBrandDisclaimer()
  const { data: promoters = [], error: promotersError } = usePromoters()
  const savePromoter = useSavePromoter()
  const deletePromoter = useDeletePromoter()

  // Patch for the legal text older mockups have baked in.
  const [coverEnabled, setCoverEnabled] = useState(false)
  const [coverHeightPct, setCoverHeightPct] = useState(9)
  const [coverColor, setCoverColor] = useState('#FFFFFF')
  const [isSampling, setIsSampling] = useState(false)

  const [personPhoto, setPersonPhoto] = useState<string | null>(null)
  const [personName, setPersonName] = useState('')
  const [personRole, setPersonRole] = useState('')

  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [sizeError, setSizeError] = useState(false)
  // 'native' exports exactly what the model produced. 'platform' letterboxes it
  // into the canonical size of the platform — bands, never a crop.
  const [exportTarget, setExportTarget] = useState<'native' | 'platform'>('native')
  const [isEditing, setIsEditing] = useState(false)
  const [editedHtml, setEditedHtml] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [brandBarOpen, setBrandBarOpen] = useState(true)

  // Brand name follows the selected identity, still editable by hand.
  useEffect(() => {
    const option = BRAND_OPTIONS.find((item) => item.key === brandKey)
    if (option) setWordmark(option.wordmark)
  }, [brandKey])

  /**
   * Prefill the legal text ONCE per brand. React Query refetches (window focus,
   * cache invalidation after saving a preset) change the array identity, and
   * without this guard the effect kept overwriting whatever the user was
   * typing — the disclaimer looked like it never stuck.
   */
  const prefilledBrandRef = useRef<BrandKey | null>(null)
  useEffect(() => {
    if (prefilledBrandRef.current === brandKey) return

    const preset = presets.find((p) => p.is_default) ?? presets[0]
    if (preset) {
      prefilledBrandRef.current = brandKey
      setActivePresetId(preset.id)
      setDisclaimer(preset.body)
      return
    }

    const fallback = (
      businessConfig?.short_disclaimer ||
      businessConfig?.disclaimer ||
      ''
    ).trim()
    // Only claim the brand as prefilled once there is something to fill with,
    // so a slow query still lands when it arrives.
    if (fallback) {
      prefilledBrandRef.current = brandKey
      setActivePresetId(null)
      setDisclaimer(fallback)
    }
  }, [brandKey, presets, businessConfig])

  // The canvas takes the image's real pixel size, so the layer adapts to any
  // image instead of assuming a platform preset.
  useEffect(() => {
    let cancelled = false
    // No crossOrigin on purpose: reading naturalWidth/Height needs no CORS, and
    // requesting it would break the load if the bucket omits the header.
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      if (!cancelled) setSizeError(true)
    }
    img.src = mockup.image_url
    return () => {
      cancelled = true
    }
  }, [mockup.image_url])

  /** Canonical size of the platform this mockup was generated for, if known. */
  const platformSize = PLATFORM_DIMENSIONS[mockup.platform as PlatformFormat] ?? null

  /** The canvas the layer is built and exported at. */
  const canvas =
    exportTarget === 'platform' && platformSize ? platformSize : size

  const baseHtml = useMemo(() => {
    if (!size || !canvas) return null
    return buildBrandLayerHtml({
      imageUrl: mockup.image_url,
      width: canvas.width,
      height: canvas.height,
      // Fitting to a format must not cut the piece: contain + bands.
      imageFit: exportTarget === 'platform' && platformSize ? 'contain' : 'cover',
      canvasBackground: coverEnabled ? coverColor : '#FFFFFF',
      logoUrl,
      wordmark,
      disclaimer,
      disclaimerTheme,
      promoter:
        personPhoto && personName.trim()
          ? { photoUrl: personPhoto, fullName: personName, role: personRole }
          : null,
      cover: coverEnabled ? { heightPct: coverHeightPct, color: coverColor } : null,
    })
  }, [
    size,
    canvas,
    exportTarget,
    platformSize,
    mockup.image_url,
    logoUrl,
    wordmark,
    disclaimer,
    disclaimerTheme,
    personPhoto,
    personName,
    personRole,
    coverEnabled,
    coverHeightPct,
    coverColor,
  ])

  const html = editedHtml ?? baseHtml

  /**
   * Debounced copy for the preview only. Feeding `html` straight into the
   * iframe's srcDoc reloaded the whole document on every keystroke, which
   * re-fetched the base image and the logo and made them blink out.
   * Export and the editor always use the immediate `html`.
   */
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setPreviewHtml(html), 300)
    return () => clearTimeout(timer)
  }, [html])

  /** Fit the real-size canvas into the preview box without overflowing it. */
  const previewScale = canvas
    ? Math.min(520 / canvas.width, 560 / canvas.height, 1)
    : 1

  const handleExport = useCallback(
    async (options: { save: boolean }) => {
      if (!html || !canvas) return
      setIsExporting(true)
      try {
        const dataUrl = await renderHtmlToPng(
          html,
          brandKey,
          canvas.width,
          canvas.height,
        )

        // Always give the user the file.
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `${brandKey}-${mockup.platform}-${mockup.id.slice(0, 8)}.png`
        link.click()

        if (options.save && activeBusinessId) {
          await saveMockup.mutateAsync({
            imageBase64: dataUrl.split(',')[1],
            platform: mockup.platform,
            selections: mockup.selections ?? undefined,
            promptUsed: mockup.prompt_used ?? undefined,
            parentMockupId: mockup.id,
            iterationFeedback: `Capa de marca: ${brandKey}`,
          })
        }

        toast({
          title: 'PNG exportado',
          description: `${canvas.width}×${canvas.height}${options.save ? ' · guardado como variante' : ''}`,
        })
      } catch (err) {
        toast({
          title: 'Error al exportar',
          description:
            err instanceof Error
              ? err.message
              : 'Revisa que el render server esté corriendo (cd renderer && node scripts/render-server.js)',
          variant: 'destructive',
        })
      } finally {
        setIsExporting(false)
      }
    },
    [html, canvas, brandKey, mockup, activeBusinessId, saveMockup, toast],
  )

  /** Turn the patch on and match its color to the image's real background. */
  const handleEnableCover = useCallback(async () => {
    setCoverEnabled(true)
    setIsSampling(true)
    try {
      const sampled = await sampleBottomColor(mockup.image_url)
      if (sampled) {
        setCoverColor(sampled)
      } else {
        toast({
          title: 'No pude leer el color de la imagen',
          description: 'Se queda en blanco. Ajústalo a mano si la pieza no es blanca.',
        })
      }
    } finally {
      setIsSampling(false)
    }
  }, [mockup.image_url, toast])

  /**
   * Change a brand element without throwing away manual edits: the edited HTML
   * is patched in place. When nothing has been edited yet, `baseHtml` simply
   * regenerates from state.
   */
  const applyBrandChange = useCallback(
    (patch: BrandLayerPatch) => {
      if (patch.logoUrl !== undefined) setLogoUrl(patch.logoUrl)
      if (patch.wordmark !== undefined) setWordmark(patch.wordmark ?? '')
      if (patch.disclaimer !== undefined) {
        setDisclaimer(patch.disclaimer ?? '')
      }

      if (!editedHtml) return

      const { html: patched, missing } = patchBrandLayerHtml(editedHtml, patch)
      if (missing.length > 0) {
        // The element was never in the edited layer (it was built without it),
        // so manual edits cannot be preserved.
        setEditedHtml(null)
        toast({
          title: 'Capa reconstruida',
          description: 'Ese elemento no existía en la versión editada.',
        })
        return
      }
      setEditedHtml(patched)
    },
    [editedHtml, toast],
  )

  /**
   * For the settings `patchBrandLayerHtml` cannot touch — the bottom cover, the
   * disclaimer theme and the person block change layout, not just content — the
   * layer has to be rebuilt from state. Warn once: after the first call
   * `editedHtml` is null and this is a no-op.
   */
  const rebuildLayer = useCallback(() => {
    if (!editedHtml) return
    setEditedHtml(null)
    toast({
      title: 'Capa reconstruida',
      description: 'Ese ajuste cambia el layout, así que se perdieron los movimientos manuales.',
    })
  }, [editedHtml, toast])

  const handleBrandSelect = useCallback(
    (key: BrandKey) => {
      setBrandKey(key)
      const option = BRAND_OPTIONS.find((item) => item.key === key)
      if (option) applyBrandChange({ wordmark: option.wordmark })
    },
    [applyBrandChange],
  )

  const handleUpload = async (file: File | undefined, target: 'logo' | 'person') => {
    if (!file) return
    try {
      const url = await uploadLogo.mutateAsync({
        file,
        brandKey,
        kind: target === 'logo' ? 'logo' : 'promoter',
      })
      if (target === 'logo') {
        applyBrandChange({ logoUrl: url })
      } else {
        setPersonPhoto(url)
        rebuildLayer()
      }
    } catch (err) {
      toast({
        title: 'Error al subir la imagen',
        description: err instanceof Error ? err.message : 'Intenta de nuevo',
        variant: 'destructive',
      })
    }
  }

  /**
   * Remove a logo from Storage. Deletes are permanent, so it asks first, and
   * clears the selection when the file being deleted is the one in use.
   */
  const handleDeleteLogo = async (logo: BrandLogo) => {
    const confirmed = window.confirm(
      `¿Borrar "${logo.name}"? Se elimina del storage y no se puede recuperar.`,
    )
    if (!confirmed) return

    try {
      await deleteLogo.mutateAsync(logo)
      if (logoUrl === logo.url) applyBrandChange({ logoUrl: null })
      toast({ title: 'Logo borrado', description: logo.name })
    } catch (err) {
      toast({
        title: 'No se pudo borrar el logo',
        description: err instanceof Error ? err.message : 'Intenta de nuevo',
        variant: 'destructive',
      })
    }
  }

  // --- Full editor takes over the screen ---
  if (isEditing && html && canvas) {
    return (
      <div className="fixed inset-0 z-[90] bg-background">
        <VisualDesignEditor
          html={html}
          pieceIndex={0}
          dimensions={canvas}
          editableElements={BRAND_LAYER_ELEMENTS}
          businessId={activeBusinessId}
          onApply={(next) => setEditedHtml(next)}
          onSave={(next) => {
            setEditedHtml(next)
            setIsEditing(false)
          }}
          onCancel={() => setIsEditing(false)}
        />

        {/* Brand controls, available without leaving the editor. Swapping any of
            these patches the layer in place, so drags and resizes survive. */}
        <div className="fixed bottom-4 left-4 z-[95] w-72 overflow-hidden rounded-xl border bg-background/95 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => setBrandBarOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            Marca
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', brandBarOpen && 'rotate-180')}
            />
          </button>

          {brandBarOpen && (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto border-t p-3">
              <div className="flex flex-wrap gap-1">
                {BRAND_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleBrandSelect(option.key)}
                    className={cn(
                      'rounded border px-2 py-1 text-[11px] transition',
                      brandKey === option.key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <Input
                value={wordmark}
                onChange={(e) => applyBrandChange({ wordmark: e.target.value })}
                placeholder="Nombre de marca"
                className="h-8 text-xs"
              />

              {logos.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {logos.map((logo) => (
                    <button
                      key={logo.url}
                      type="button"
                      onClick={() => applyBrandChange({ logoUrl: logo.url })}
                      className={cn(
                        'h-11 w-11 shrink-0 overflow-hidden rounded border bg-muted/30 p-1 transition',
                        logoUrl === logo.url
                          ? 'border-primary ring-1 ring-primary'
                          : 'hover:bg-muted',
                      )}
                      title={logo.name}
                    >
                      <img
                        src={logo.url}
                        alt={logo.name}
                        className="h-full w-full object-contain"
                      />
                    </button>
                  ))}
                </div>
              )}

              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setActivePresetId(preset.id)
                        applyBrandChange({ disclaimer: preset.body })
                      }}
                      className={cn(
                        'rounded border px-2 py-1 text-[11px] transition',
                        activePresetId === preset.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}

              <Textarea
                value={disclaimer}
                onChange={(e) => {
                  setActivePresetId(null)
                  applyBrandChange({ disclaimer: e.target.value })
                }}
                rows={3}
                placeholder="Texto legal…"
                className="text-[11px]"
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Montar marca"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Montar marca</h2>
            <p className="text-xs text-muted-foreground">
              {canvas && size
                ? exportTarget === 'native'
                  ? `${canvas.width}×${canvas.height} px · tamaño original de la imagen`
                  : `${canvas.width}×${canvas.height} px · la imagen (${size.width}×${size.height}) entra completa y el resto queda en banda`
                : sizeError
                  ? 'No se pudo leer la imagen'
                  : 'Leyendo tamaño de la imagen…'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Export size. Fitting never crops: the piece is contained and the
                leftover becomes a band, which is also where the legal text lands. */}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setExportTarget('native')
                  rebuildLayer()
                }}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs transition',
                  exportTarget === 'native'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
              >
                Nativo
              </button>
              <button
                type="button"
                disabled={!platformSize}
                onClick={() => {
                  setExportTarget('platform')
                  rebuildLayer()
                }}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs transition disabled:opacity-40',
                  exportTarget === 'platform'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-muted',
                )}
                title={
                  platformSize
                    ? `Ajustar a ${platformSize.width}×${platformSize.height}`
                    : 'Plataforma desconocida'
                }
              >
                Ajustar a formato
              </button>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[320px_1fr]">
          {/* Controls */}
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs">Marca</Label>
              <div className="flex flex-wrap gap-1.5">
                {BRAND_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleBrandSelect(option.key)}
                    className={cn(
                      'rounded-md border px-2.5 py-1.5 text-xs transition',
                      brandKey === option.key
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Logo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Logo</Label>
                <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Upload className="h-3.5 w-3.5" />
                  Subir
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files?.[0], 'logo')}
                  />
                </label>
              </div>
              {isLoadingLogos ? (
                <p className="text-xs text-muted-foreground">Cargando logos…</p>
              ) : logos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No encontré logos en el bucket <code>Brand</code> ni en{' '}
                  <code>design-images/brand-icons/</code>. Sube uno con el botón de arriba
                  o pega la URL abajo.
                </p>
              ) : (
                <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => applyBrandChange({ logoUrl: null })}
                    className={cn(
                      'flex h-14 items-center justify-center rounded border text-[10px] text-muted-foreground transition',
                      logoUrl === null ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted',
                    )}
                  >
                    Sin logo
                  </button>
                  {logos.map((logo) => (
                    <div key={logo.url} className="group relative">
                      <button
                        type="button"
                        onClick={() => applyBrandChange({ logoUrl: logo.url })}
                        className={cn(
                          'h-14 w-full overflow-hidden rounded border bg-muted/30 p-1 transition',
                          logoUrl === logo.url
                            ? 'border-primary ring-1 ring-primary'
                            : 'hover:bg-muted',
                        )}
                        title={logo.name}
                      >
                        <img
                          src={logo.url}
                          alt={logo.name}
                          className="h-full w-full object-contain"
                        />
                      </button>

                      {/* Only files uploaded from this panel can be removed. The
                          `Brand` bucket is shared with the presentation
                          templates, which point at one of its files. */}
                      {logo.deletable && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLogo(logo)}
                          disabled={deleteLogo.isPending}
                          aria-label={`Borrar logo ${logo.name}`}
                          title={`Borrar ${logo.name}`}
                          className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full border border-destructive/40 bg-background text-destructive shadow-sm transition hover:bg-destructive hover:text-destructive-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive group-hover:flex disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Escape hatch: any reachable image URL works as a logo. */}
              <div className="flex gap-1.5">
                <Input
                  value={logoUrlDraft}
                  onChange={(e) => setLogoUrlDraft(e.target.value)}
                  placeholder="…o pega la URL del logo"
                  className="h-8 text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  disabled={!logoUrlDraft.trim()}
                  onClick={() => applyBrandChange({ logoUrl: logoUrlDraft.trim() })}
                >
                  Usar
                </Button>
              </div>

              {/* Wordmark next to the symbol, like the presentation lockup. */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs" htmlFor="brand-wordmark">
                  Nombre de marca
                </Label>
                <Input
                  id="brand-wordmark"
                  value={wordmark}
                  onChange={(e) => applyBrandChange({ wordmark: e.target.value })}
                  placeholder="Vacío = solo el símbolo"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Patch out the baked-in legal text of older mockups */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Tapar disclaimer original</Label>
                <button
                  type="button"
                  onClick={() => {
                    rebuildLayer()
                    if (coverEnabled) setCoverEnabled(false)
                    else handleEnableCover()
                  }}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs transition',
                    coverEnabled
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  {coverEnabled ? 'Activado' : 'Activar'}
                </button>
              </div>

              {coverEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[coverHeightPct]}
                      onValueChange={([value]) => {
                        setCoverHeightPct(value)
                        rebuildLayer()
                      }}
                      min={2}
                      max={30}
                      step={1}
                      aria-label="Altura de la tapa"
                    />
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {coverHeightPct}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={coverColor}
                      onChange={(e) => {
                        setCoverColor(e.target.value)
                        rebuildLayer()
                      }}
                      className="h-7 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                      aria-label="Color de la tapa"
                    />
                    <span className="text-xs text-muted-foreground">
                      {isSampling ? 'Muestreando color…' : coverColor}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Cubre la franja inferior con el color del fondo. Para tapar algo que
                    no esté abajo, usa "Abrir editor" e inserta una forma.
                  </p>
                </div>
              )}
            </div>

            {/* Disclaimer */}
            <div className="space-y-2">
              <Label className="text-xs" htmlFor="brand-disclaimer">
                Disclaimer
              </Label>

              {presetsError && (
                <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
                  No pude leer los presets: {presetsError.message}. Si la tabla
                  <code> brand_disclaimers </code>no existe todavía, corre la migración
                  <code> 20260801_brand_layer_tables.sql</code>.
                </p>
              )}

              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset) => (
                    <span
                      key={preset.id}
                      className={cn(
                        'group inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition',
                        activePresetId === preset.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActivePresetId(preset.id)
                          applyBrandChange({ disclaimer: preset.body })
                        }}
                      >
                        {preset.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (activePresetId === preset.id) setActivePresetId(null)
                          deletePreset.mutate(preset.id)
                        }}
                        className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                        title="Quitar preset"
                        aria-label={`Quitar ${preset.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <Textarea
                id="brand-disclaimer"
                value={disclaimer}
                onChange={(e) => {
                  setActivePresetId(null)
                  applyBrandChange({ disclaimer: e.target.value })
                }}
                rows={4}
                placeholder="Texto legal de la marca…"
                className="text-xs"
              />

              <button
                type="button"
                disabled={!disclaimer.trim() || savePreset.isPending}
                onClick={async () => {
                  const label = window.prompt('Nombre del preset', 'Nuevo')
                  if (!label?.trim()) return
                  try {
                    const id = await savePreset.mutateAsync({
                      brandKey,
                      label: label.trim(),
                      body: disclaimer.trim(),
                    })
                    setActivePresetId(id)
                    toast({ title: 'Preset guardado' })
                  } catch (err) {
                    toast({
                      title: 'No se pudo guardar el preset',
                      description: err instanceof Error ? err.message : undefined,
                      variant: 'destructive',
                    })
                  }
                }}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Guardar este texto como preset de {
                  BRAND_OPTIONS.find((b) => b.key === brandKey)?.label
                }
              </button>
              <div className="flex gap-1.5">
                {(['dark', 'light'] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => {
                      setDisclaimerTheme(theme)
                      rebuildLayer()
                    }}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs transition',
                      disclaimerTheme === theme
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    {theme === 'dark' ? 'Texto oscuro' : 'Texto blanco'}
                  </button>
                ))}
              </div>
            </div>

            {/* Person */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Persona (opcional)</Label>
                <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <Upload className="h-3.5 w-3.5" />
                  Foto
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUpload(e.target.files?.[0], 'person')}
                  />
                </label>
              </div>
              {promotersError && (
                <p className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] leading-snug text-destructive">
                  No pude leer los promotores: {promotersError.message}. Si la tabla
                  <code> promoters </code>no existe todavía, corre la migración
                  <code> 20260801_brand_layer_tables.sql</code>.
                </p>
              )}

              {promoters.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {promoters.map((promoter) => (
                    <span
                      key={promoter.id}
                      className={cn(
                        'group inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition',
                        personName === promoter.full_name
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5"
                        onClick={() => {
                          setPersonName(promoter.full_name)
                          setPersonRole(promoter.role ?? '')
                          setPersonPhoto(promoter.photo_url)
                          rebuildLayer()
                        }}
                      >
                        {promoter.photo_url && (
                          <img
                            src={promoter.photo_url}
                            alt=""
                            className="h-4 w-4 rounded-full object-cover"
                          />
                        )}
                        {promoter.full_name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePromoter.mutate(promoter.id)}
                        className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
                        title="Quitar promotor"
                        aria-label={`Quitar ${promoter.full_name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <Input
                value={personName}
                onChange={(e) => {
                  setPersonName(e.target.value)
                  rebuildLayer()
                }}
                placeholder="Nombre"
                className="h-8 text-xs"
              />
              <Input
                value={personRole}
                onChange={(e) => {
                  setPersonRole(e.target.value)
                  rebuildLayer()
                }}
                placeholder="Rol"
                className="h-8 text-xs"
              />
              {personPhoto && (
                <div className="flex items-center gap-2">
                  <img
                    src={personPhoto}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPersonPhoto(null)
                      rebuildLayer()
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Quitar foto
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={!personName.trim() || savePromoter.isPending}
                onClick={async () => {
                  const existing = promoters.find(
                    (p) => p.full_name === personName.trim(),
                  )
                  try {
                    await savePromoter.mutateAsync({
                      id: existing?.id,
                      fullName: personName.trim(),
                      role: personRole,
                      photoUrl: personPhoto,
                    })
                    toast({
                      title: existing ? 'Promotor actualizado' : 'Promotor guardado',
                    })
                  } catch (err) {
                    toast({
                      title: 'No se pudo guardar el promotor',
                      description: err instanceof Error ? err.message : undefined,
                      variant: 'destructive',
                    })
                  }
                }}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Guardar esta persona como promotor
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex min-h-[320px] items-center justify-center rounded-lg bg-muted/40 p-3">
            {previewHtml && canvas ? (
              // The wrapper carries the scaled footprint so the transformed
              // iframe cannot overflow the dialog. Export uses the real px size.
              <div
                className="overflow-hidden rounded shadow-sm"
                style={{
                  width: canvas.width * previewScale,
                  height: canvas.height * previewScale,
                }}
              >
                <iframe
                  title="Previsualización de la capa de marca"
                  srcDoc={previewHtml}
                  style={{
                    width: canvas.width,
                    height: canvas.height,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                    border: 0,
                  }}
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">
          {editedHtml && (
            <button
              type="button"
              onClick={() => setEditedHtml(null)}
              className="mr-auto text-xs text-muted-foreground hover:text-foreground"
            >
              Descartar ediciones
            </button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            disabled={!html || isExporting}
            onClick={() => setIsEditing(true)}
          >
            Abrir editor
          </Button>
          <Button
            variant="outline"
            disabled={!html || isExporting}
            onClick={() => handleExport({ save: false })}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Descargar PNG'}
          </Button>
          <Button disabled={!html || isExporting} onClick={() => handleExport({ save: true })}>
            Exportar y guardar
          </Button>
        </div>
      </div>
    </div>
  )
}
