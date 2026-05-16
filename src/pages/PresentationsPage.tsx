/**
 * PresentationsPage — Editor y viewer de presentaciones HTML con branding Xending.
 *
 * Permite:
 * - Visualizar presentaciones slide-by-slide (16:9)
 * - Navegar con teclado (← →) o botones
 * - Editar cada slide con Editor Visual o editor HTML raw
 * - Exportar HTML completo
 * - Descargar slide individual
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileImage,
  Presentation,
  Maximize2,
  Code2,
  Move,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { PRESENTATION_TEMPLATES, getPresentationHtml } from '@/constants/presentationTemplates';

import { renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer';
import { HtmlSectionEditor } from '@/components/HtmlSectionEditor';
import { VisualDesignEditor, type ElementDef } from '@/components/VisualDesignEditor';

/** Elements that can be edited/dragged in presentation slides */
const PRESENTATION_ELEMENTS: ElementDef[] = [
  { id: 'slide-card', label: 'Card principal', emoji: '📐', color: '#8B5CF6', selector: '.slide-card', editable: false, draggable: false },
  { id: 'h1',         label: 'Título',         emoji: '📝', color: '#F97316', selector: 'h1',          editable: true,  draggable: true },
  { id: 'h2',         label: 'Subtítulo',      emoji: '📝', color: '#F97316', selector: 'h2',          editable: true,  draggable: true },
  { id: 'h3',         label: 'Heading 3',      emoji: '📝', color: '#D97706', selector: 'h3',          editable: true,  draggable: true },
  { id: 'subtitle',   label: 'Subtexto',       emoji: '💬', color: '#06B6D4', selector: '.subtitle',   editable: true,  draggable: true },
  { id: 'body',       label: 'Body',           emoji: '💬', color: '#06B6D4', selector: '.body',       editable: true,  draggable: true },
  { id: 'tag',        label: 'Tag',            emoji: '🏷️', color: '#10B981', selector: '.tag',        editable: true,  draggable: true },
  { id: 'number',     label: 'Número',         emoji: '🔢', color: '#0D9488', selector: '.number',     editable: true,  draggable: false },
  { id: 'cta-btn',    label: 'CTA',            emoji: '🔘', color: '#EF4444', selector: '.cta-btn',    editable: true,  draggable: true },
  { id: 'logo-row',   label: 'Logo',           emoji: '🎨', color: '#8B5CF6', selector: '.logo-row',   editable: false, draggable: true },
  { id: 'divider',    label: 'Divider',        emoji: '➖', color: '#6366F1', selector: '.divider',    editable: false, draggable: true },
  { id: 'img-placeholder', label: 'Imagen', emoji: '📷', color: '#22C55E', selector: '.img-placeholder', editable: false, draggable: true },
  { id: 'hero-photo', label: 'Foto hero (slide 6)', emoji: '🖼️', color: '#14B8A6', selector: '.hero-photo', editable: false, draggable: false },
  { id: 'orb-halo',   label: 'Orb halo (slide 7)', emoji: '🌗', color: '#F97316', selector: '.orb-halo',   editable: false, draggable: true },
];

function PresentationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideHtmls, setSlideHtmls] = useState<string[]>(
    () => PRESENTATION_TEMPLATES.map((s) => s.html),
  );
  const [editingMode, setEditingMode] = useState<'none' | 'html' | 'visual'>('none');
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = PRESENTATION_TEMPLATES.length;

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  // Keyboard navigation (only when not editing)
  useEffect(() => {
    if (editingMode !== 'none') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, editingMode]);

  const handleExportHtml = useCallback(() => {
    const fullHtml = getPresentationHtml();
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'xending-global-pitch.html';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Presentación exportada', description: 'Archivo HTML descargado.' });
  }, [toast]);

  const handleDownloadSlide = useCallback(() => {
    const html = slideHtmls[currentSlide];
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slide-${currentSlide + 1}-${PRESENTATION_TEMPLATES[currentSlide].title.toLowerCase().replace(/\s+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Slide descargado' });
  }, [currentSlide, slideHtmls, toast]);

  // --- Export slides as PNG ---
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const handleExportSlidesAsPng = useCallback(async (count: number = 6) => {
    const total = Math.min(count, slideHtmls.length);
    setExporting(true);
    setExportProgress(0);
    toast({
      title: `Exportando ${total} slides a PNG`,
      description: 'Esto puede tardar unos segundos. No cierres la pestaña.',
    });

    try {
      for (let i = 0; i < total; i++) {
        setExportProgress(i);
        const html = slideHtmls[i];
        const slideInfo = PRESENTATION_TEMPLATES[i];

        // Render via Puppeteer server → PNG base64
        const pngDataUrl = await renderHtmlToPng(html, 'xending', 1920, 1080);

        // Decode base64 PNG directly to Blob (lossless, no compression artifacts)
        const base64 = pngDataUrl.replace(/^data:image\/png;base64,/, '');
        const bin = atob(base64);
        const bytes = new Uint8Array(bin.length);
        for (let b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
        const downloadBlob = new Blob([bytes], { type: 'image/png' });

        // Trigger download
        const url = URL.createObjectURL(downloadBlob);
        const a = document.createElement('a');
        a.href = url;
        const safeTitle = slideInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        a.download = `slide-${String(i + 1).padStart(2, '0')}-${safeTitle}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Small gap between downloads so the browser doesn't collapse them
        await new Promise((r) => setTimeout(r, 300));
      }

      setExportProgress(total);
      toast({
        title: `✅ ${total} slides exportados`,
        description: 'Revisá tu carpeta de descargas.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast({
        title: 'Error al exportar',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [slideHtmls, toast]);

  const handleFullscreen = useCallback(() => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  }, []);

  const handleSaveHtml = useCallback((newHtml: string) => {
    setSlideHtmls((prev) => {
      const updated = [...prev];
      updated[currentSlide] = newHtml;
      return updated;
    });
    setEditingMode('none');
    toast({ title: 'Slide actualizado' });
  }, [currentSlide, toast]);

  const handleCancelEdit = useCallback(() => {
    setEditingMode('none');
  }, []);

  const currentHtml = slideHtmls[currentSlide];
  const slideTitle = PRESENTATION_TEMPLATES[currentSlide].title;

  // --- Editor modes ---
  if (editingMode === 'visual') {
    return (
      <VisualDesignEditor
        html={currentHtml}
        pieceIndex={currentSlide}
        dimensions={{ width: 1920, height: 1080 }}
        editableElements={PRESENTATION_ELEMENTS}
        onSave={handleSaveHtml}
        onCancel={handleCancelEdit}
      />
    );
  }

  if (editingMode === 'html') {
    return (
      <HtmlSectionEditor
        html={currentHtml}
        pieceIndex={currentSlide}
        onSave={handleSaveHtml}
        onCancel={handleCancelEdit}
      />
    );
  }

  // --- Main viewer ---
  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Presentation className="h-5 w-5 text-[#2ED4C7]" />
              Presentaciones
            </h1>
            <p className="text-sm text-muted-foreground">
              Pitch decks y presentaciones con branding Xending
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingMode('visual')}
            className="gap-2"
          >
            <Move className="h-4 w-4" />
            Editor Visual
          </Button>
          <Button
            size="sm"
            onClick={() => setEditingMode('html')}
            className="gap-2 bg-[#0F1419] hover:bg-[#1a2332] text-white"
          >
            <Code2 className="h-4 w-4" />
            HTML
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFullscreen}
            className="gap-2"
          >
            <Maximize2 className="h-4 w-4" />
            Pantalla completa
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadSlide}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Descargar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExportSlidesAsPng(6)}
            disabled={exporting}
            className="gap-2"
          >
            <FileImage className="h-4 w-4" />
            {exporting ? `Exportando ${exportProgress + 1}/6…` : 'Exportar 6 PNG'}
          </Button>
          <Button
            size="sm"
            onClick={handleExportHtml}
            className="gap-2 bg-[#FF7A4A] hover:bg-[#E85A2C] text-white"
          >
            <Download className="h-4 w-4" />
            Exportar Todo
          </Button>
        </div>
      </div>

      {/* Slide Viewer */}
      <div ref={containerRef} className="space-y-4">
        <Card className="overflow-hidden border-2 border-[#0F1419]/10">
          <CardContent className="p-0">
            {/* 16:9 aspect ratio container */}
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                srcDoc={currentHtml}
                className="absolute inset-0 w-full h-full border-0"
                title={`Slide ${currentSlide + 1}: ${slideTitle}`}
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrev}
            disabled={currentSlide === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {currentSlide + 1} / {totalSlides}
            </span>
            <span className="text-sm font-medium text-foreground">
              {slideTitle}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={currentSlide === totalSlides - 1}
            className="gap-2"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Slide Thumbnails */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {PRESENTATION_TEMPLATES.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentSlide(idx)}
              className={cn(
                'flex-shrink-0 w-32 h-18 rounded-md border-2 transition-all overflow-hidden',
                'hover:border-[#2ED4C7]/50',
                idx === currentSlide
                  ? 'border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
                  : 'border-border opacity-70',
              )}
              aria-label={`Ir a slide ${idx + 1}: ${s.title}`}
            >
              <div className="w-full h-full bg-[#F5F3F0] flex items-center justify-center p-1">
                <span className="text-[8px] text-[#0F1419]/70 text-center leading-tight truncate">
                  {s.title}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <Card className="border-dashed border-[#2ED4C7]/30 bg-[#2ED4C7]/5">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">💡 Tip:</strong> Usa{' '}
            <strong>Editor Visual</strong> para mover elementos con drag & drop, o{' '}
            <strong>HTML</strong> para editar el código directamente.
            Los cambios se aplican solo al slide actual.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default PresentationsPage;
