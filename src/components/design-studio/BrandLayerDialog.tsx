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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { VisualDesignEditor } from '@/components/VisualDesignEditor'
import { useActiveBusiness } from '@/hooks/useActiveBusiness'
import { useBusinessConfig } from '@/hooks/useBusinessConfig'
import { useBrandLogos, useUploadBrandLogo } from '@/hooks/useBrandLogos'
import { useSaveMockup, type SavedMockup } from '@/hooks/useDesignMockups'
import { renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer'
import {
  BRAND_LAYER_ELEMENTS,
  buildBrandLayerHtml,
} from '@/utils/design-studio/buildBrandLayerHtml'
import { sampleBottomColor } from '@/utils/design-studio/sampleImageColor'
import { Slider } from '@/components/ui/slider'

/**
 * Brand identities available for the layer. Kept as a constant on purpose: the
 * only thing that changes between them today is the logo and the legal text,
 * so this needs neither a new tenant nor a migration.
 */
const BRAND_OPTIONS = [
  { key: 'xending', label: 'Xending' },
  { key: 'xending_usa', label: 'Xending USA' },
  { key: 'xending_capital', label: 'Xending Capital' },
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

  const [brandKey, setBrandKey] = useState<BrandKey>('xending')
  const { logos, isLoading: isLoadingLogos } = useBrandLogos(brandKey)

  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUrlDraft, setLogoUrlDraft] = useState('')
  const [disclaimer, setDisclaimer] = useState('')
  const [disclaimerTheme, setDisclaimerTheme] = useState<'dark' | 'light'>('dark')

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
  const [isEditing, setIsEditing] = useState(false)
  const [editedHtml, setEditedHtml] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Prefill with whatever legal text the tenant already has. Editable here, and
  // the definitive per-brand presets land in a table later.
  useEffect(() => {
    if (!businessConfig) return
    setDisclaimer(
      (businessConfig.short_disclaimer || businessConfig.disclaimer || '').trim(),
    )
  }, [businessConfig])

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

  const baseHtml = useMemo(() => {
    if (!size) return null
    return buildBrandLayerHtml({
      imageUrl: mockup.image_url,
      width: size.width,
      height: size.height,
      logoUrl,
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
    mockup.image_url,
    logoUrl,
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

  /** Fit the real-size canvas into the preview box without overflowing it. */
  const previewScale = size
    ? Math.min(520 / size.width, 560 / size.height, 1)
    : 1

  const handleExport = useCallback(
    async (options: { save: boolean }) => {
      if (!html || !size) return
      setIsExporting(true)
      try {
        const dataUrl = await renderHtmlToPng(html, brandKey, size.width, size.height)

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
          description: `${size.width}×${size.height}${options.save ? ' · guardado como variante' : ''}`,
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
    [html, size, brandKey, mockup, activeBusinessId, saveMockup, toast],
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

  const handleUpload = async (file: File | undefined, target: 'logo' | 'person') => {
    if (!file) return
    try {
      const url = await uploadLogo.mutateAsync({ file, brandKey })
      if (target === 'logo') setLogoUrl(url)
      else setPersonPhoto(url)
    } catch (err) {
      toast({
        title: 'Error al subir la imagen',
        description: err instanceof Error ? err.message : 'Intenta de nuevo',
        variant: 'destructive',
      })
    }
  }

  // --- Full editor takes over the screen ---
  if (isEditing && html && size) {
    return (
      <div className="fixed inset-0 z-[90] bg-background">
        <VisualDesignEditor
          html={html}
          pieceIndex={0}
          dimensions={size}
          editableElements={BRAND_LAYER_ELEMENTS}
          businessId={activeBusinessId}
          onApply={(next) => setEditedHtml(next)}
          onSave={(next) => {
            setEditedHtml(next)
            setIsEditing(false)
          }}
          onCancel={() => setIsEditing(false)}
        />
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
              {size
                ? `${size.width}×${size.height} px · se exporta a este mismo tamaño`
                : sizeError
                  ? 'No se pudo leer la imagen'
                  : 'Leyendo tamaño de la imagen…'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
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
                    onClick={() => setBrandKey(option.key)}
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
                    onClick={() => setLogoUrl(null)}
                    className={cn(
                      'flex h-14 items-center justify-center rounded border text-[10px] text-muted-foreground transition',
                      logoUrl === null ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted',
                    )}
                  >
                    Sin logo
                  </button>
                  {logos.map((logo) => (
                    <button
                      key={logo.url}
                      type="button"
                      onClick={() => setLogoUrl(logo.url)}
                      className={cn(
                        'h-14 overflow-hidden rounded border bg-muted/30 p-1 transition',
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
                  onClick={() => setLogoUrl(logoUrlDraft.trim())}
                >
                  Usar
                </Button>
              </div>
            </div>

            {/* Patch out the baked-in legal text of older mockups */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Tapar disclaimer original</Label>
                <button
                  type="button"
                  onClick={() =>
                    coverEnabled ? setCoverEnabled(false) : handleEnableCover()
                  }
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
                      onValueChange={([value]) => setCoverHeightPct(value)}
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
                      onChange={(e) => setCoverColor(e.target.value)}
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
              <Textarea
                id="brand-disclaimer"
                value={disclaimer}
                onChange={(e) => setDisclaimer(e.target.value)}
                rows={4}
                placeholder="Texto legal de la marca…"
                className="text-xs"
              />
              <div className="flex gap-1.5">
                {(['dark', 'light'] as const).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => setDisclaimerTheme(theme)}
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
              <Input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="Nombre"
                className="h-8 text-xs"
              />
              <Input
                value={personRole}
                onChange={(e) => setPersonRole(e.target.value)}
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
                    onClick={() => setPersonPhoto(null)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Quitar foto
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="flex min-h-[320px] items-center justify-center rounded-lg bg-muted/40 p-3">
            {html && size ? (
              // The wrapper carries the scaled footprint so the transformed
              // iframe cannot overflow the dialog. Export uses the real px size.
              <div
                className="overflow-hidden rounded shadow-sm"
                style={{
                  width: size.width * previewScale,
                  height: size.height * previewScale,
                }}
              >
                <iframe
                  title="Previsualización de la capa de marca"
                  srcDoc={html}
                  style={{
                    width: size.width,
                    height: size.height,
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
