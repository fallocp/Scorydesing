import { useState, useRef } from 'react';
import { Download, Loader2, Eye, Code, X, RotateCcw, Save, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDesignStore } from '@/store/designStore';
import { generatePieceHtml, renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer';
import { useSaveDesignPiece, useUpdateDesignPiece } from '@/hooks/useDesignPieces';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { BuiltPiece } from './PieceBuilder';

interface PieceGalleryProps {
  pieces: BuiltPiece[];
  branchName: string;
}

export function PieceGallery({ pieces, branchName }: PieceGalleryProps) {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const currentCampaign = useDesignStore((s) => s.currentCampaign);
  const [renderedPieces, setRenderedPieces] = useState<Record<number, string>>({});
  const [pieceHtmls, setPieceHtmls] = useState<Record<number, string>>({});
  const [savedPieceIds, setSavedPieceIds] = useState<Record<number, string>>({});
  const [renderingIndex, setRenderingIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editHtml, setEditHtml] = useState('');

  const savePieceMutation = useSaveDesignPiece();
  const updatePieceMutation = useUpdateDesignPiece();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [swapPhotoIndex, setSwapPhotoIndex] = useState<number | null>(null);

  // Replace photo in existing HTML and re-render (no Claude call)
  const handleSwapPhoto = (index: number) => {
    if (!pieceHtmls[index]) {
      toast({ title: 'Genera la pieza primero (Preview)', variant: 'destructive' });
      return;
    }
    setSwapPhotoIndex(index);
    fileInputRef.current?.click();
  };

  const handlePhotoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || swapPhotoIndex === null || !selectedBrand) return;

    setRenderingIndex(swapPhotoIndex);
    const index = swapPhotoIndex;
    setSwapPhotoIndex(null);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      // Upload to Supabase storage
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `swap/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('design-images')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage
        .from('design-images')
        .getPublicUrl(path);

      const newImageUrl = urlData.publicUrl;

      // Replace image URL in existing HTML
      const currentHtml = pieceHtmls[index];
      // Find the main photo img tag (not the logo) and replace its src
      let updatedHtml = currentHtml.replace(
        /(<img[^>]*class="[^"]*(?:photo|hero|main|piece)[^"]*"[^>]*src=")[^"]+(")/i,
        `$1${newImageUrl}$2`
      );

      // If no class-based match, fallback: replace first non-logo img src
      if (updatedHtml === currentHtml) {
        updatedHtml = currentHtml.replace(
          /(<img[^>]*src=")(?!data:image)(https?:\/\/[^"]+(?:\.jpg|\.jpeg|\.png|\.webp)[^"]*)(")/gi,
          (match, prefix, url, suffix) => {
            if (match.includes('class="logo"') || url.includes('logo') || url.includes('bola') || url.includes('Logo')) {
              return match;
            }
            return `${prefix}${newImageUrl}${suffix}`;
          }
        );
      }

      setPieceHtmls((prev) => ({ ...prev, [index]: updatedHtml }));

      // Re-render with new photo (no Claude call!)
      const dataUrl = await renderHtmlToPng(updatedHtml, selectedBrand);
      setRenderedPieces((prev) => ({ ...prev, [index]: dataUrl }));

      // Save to DB
      await savePieceToDb(index, updatedHtml, dataUrl);

      toast({ title: `Foto cambiada en pieza ${index + 1} — sin costo de IA` });
    } catch (err) {
      console.error('Error cambiando foto:', err);
      toast({
        title: 'Error al cambiar foto',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setRenderingIndex(null);
    }
  };

  // Save piece to Supabase
  const savePieceToDb = async (index: number, html: string, pngDataUrl?: string) => {
    if (!currentCampaign) return;

    const piece = pieces[index];
    const existingId = savedPieceIds[index];

    try {
      if (existingId) {
        // Update existing piece
        await updatePieceMutation.mutateAsync({
          id: existingId,
          htmlContent: html,
          pngUrl: pngDataUrl,
          status: pngDataUrl ? 'rendered' : 'html_ready',
        });
      } else {
        // Create new piece
        const saved = await savePieceMutation.mutateAsync({
          campaignId: currentCampaign.id,
          headline: piece.copyIdea.headline,
          subcopy: piece.copyIdea.subcopy,
          cta: piece.copyIdea.cta,
          htmlContent: html,
          pngUrl: pngDataUrl,
          status: pngDataUrl ? 'rendered' : 'html_ready',
        });
        setSavedPieceIds((prev) => ({ ...prev, [index]: saved.id }));
      }
    } catch (err) {
      console.error('Error guardando pieza en DB:', err);
      // Don't block the flow — just log
    }
  };

  // Step 1: Generate HTML only (for preview + edit)
  const handleGenerateHtml = async (piece: BuiltPiece, index: number) => {
    if (!selectedBrand || !piece.imageUrl) return;

    setRenderingIndex(index);
    try {
      const html = await generatePieceHtml({
        imageUrl: piece.imageUrl,
        headline: piece.copyIdea.headline,
        subcopy: piece.copyIdea.subcopy,
        cta: piece.copyIdea.cta,
        brand: selectedBrand,
        pieceNumber: index + 1,
        totalPieces: pieces.length,
      });

      setPieceHtmls((prev) => ({ ...prev, [index]: html }));

      // Also render to PNG for preview
      const dataUrl = await renderHtmlToPng(html, selectedBrand);
      setRenderedPieces((prev) => ({ ...prev, [index]: dataUrl }));

      // Auto-save to Supabase
      await savePieceToDb(index, html, dataUrl);

      toast({ title: `Pieza ${index + 1} generada y guardada` });
    } catch (err) {
      console.error('Error generando pieza:', err);
      toast({
        title: 'Error al generar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setRenderingIndex(null);
    }
  };

  // Open HTML editor
  const handleEditHtml = (index: number) => {
    const html = pieceHtmls[index];
    if (!html) {
      toast({ title: 'Genera la pieza primero (Preview)', variant: 'destructive' });
      return;
    }
    setEditHtml(html);
    setEditingIndex(index);
  };

  // Save edited HTML and re-render
  const handleSaveHtml = async () => {
    if (editingIndex === null || !selectedBrand) return;

    setPieceHtmls((prev) => ({ ...prev, [editingIndex]: editHtml }));
    setRenderingIndex(editingIndex);

    try {
      const dataUrl = await renderHtmlToPng(editHtml, selectedBrand);
      setRenderedPieces((prev) => ({ ...prev, [editingIndex]: dataUrl }));

      // Save edited HTML to Supabase
      await savePieceToDb(editingIndex, editHtml, dataUrl);

      toast({ title: `Pieza ${editingIndex + 1} actualizada y guardada` });
    } catch (err) {
      console.error('Error re-renderizando:', err);
      toast({ title: 'Error al re-renderizar', variant: 'destructive' });
    } finally {
      setRenderingIndex(null);
      setEditingIndex(null);
    }
  };

  // Download a piece (generate if needed, then download)
  const handleDownload = async (piece: BuiltPiece, index: number) => {
    if (!selectedBrand || !piece.imageUrl) return;

    setRenderingIndex(index);
    try {
      let dataUrl = renderedPieces[index];

      // If not rendered yet, generate + render
      if (!dataUrl) {
        const html = await generatePieceHtml({
          imageUrl: piece.imageUrl,
          headline: piece.copyIdea.headline,
          subcopy: piece.copyIdea.subcopy,
          cta: piece.copyIdea.cta,
          brand: selectedBrand,
          pieceNumber: index + 1,
          totalPieces: pieces.length,
        });
        setPieceHtmls((prev) => ({ ...prev, [index]: html }));
        dataUrl = await renderHtmlToPng(html, selectedBrand);
        setRenderedPieces((prev) => ({ ...prev, [index]: dataUrl }));
      }

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${branchName.toLowerCase().replace(/\s+/g, '-')}-pieza-${index + 1}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({ title: `Pieza ${index + 1} descargada` });
    } catch (err) {
      console.error('Error descargando pieza:', err);
      toast({
        title: 'Error al descargar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setRenderingIndex(null);
    }
  };

  const handleDownloadAll = async () => {
    for (let i = 0; i < pieces.length; i++) {
      await handleDownload(pieces[i], i);
    }
  };

  if (pieces.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No hay piezas armadas todavía.</p>
        <p className="text-xs mt-1">Vuelve al paso anterior para emparejar copy con imágenes.</p>
      </div>
    );
  }

  // HTML Editor Modal
  if (editingIndex !== null) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Editando HTML — Pieza {editingIndex + 1}
          </h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveHtml} disabled={renderingIndex !== null}>
              {renderingIndex !== null ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-1" />
              )}
              Guardar y Re-renderizar
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Edita el HTML directamente. Puedes cambiar textos, colores, posiciones, o eliminar elementos.
          Al guardar se re-renderiza automáticamente.
        </p>
        <textarea
          value={editHtml}
          onChange={(e) => setEditHtml(e.target.value)}
          className="w-full h-[600px] font-mono text-xs bg-zinc-950 text-green-400 p-4 rounded-lg border border-zinc-700 resize-y"
          spellCheck={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input for photo swap */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handlePhotoFileSelected}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Piezas Listas — {branchName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {pieces.length} pieza{pieces.length !== 1 ? 's' : ''}. Cada descarga incluye el branding de Xending.
          </p>
        </div>
        <Button onClick={handleDownloadAll} disabled={renderingIndex !== null}>
          <Download className="h-4 w-4 mr-2" />
          Descargar Todas
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pieces.map((piece, index) => {
          const rendered = renderedPieces[index];
          const hasHtml = !!pieceHtmls[index];
          const isRendering = renderingIndex === index;

          return (
            <Card key={index} className="overflow-hidden">
              <div className="relative">
                <img
                  src={rendered || piece.imageUrl}
                  alt={piece.copyIdea.headline}
                  className="w-full aspect-square object-cover"
                />
                <Badge className="absolute top-2 left-2 bg-black/60 text-white border-0 text-xs">
                  Pieza {index + 1}
                </Badge>
                {rendered && (
                  <Badge className="absolute top-2 right-2 bg-green-600 text-white border-0 text-xs">
                    Con branding
                  </Badge>
                )}
              </div>

              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-sm">{piece.copyIdea.headline}</h3>
                <p className="text-xs text-muted-foreground">{piece.copyIdea.subcopy}</p>
                <p className="text-xs font-medium text-[#2ED4C7]">{piece.copyIdea.cta}</p>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleGenerateHtml(piece, index)}
                    disabled={isRendering}
                  >
                    {isRendering ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 mr-1" />
                    )}
                    Preview
                  </Button>
                  {hasHtml && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSwapPhoto(index)}
                        disabled={isRendering}
                        title="Cambiar foto (sin costo IA)"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditHtml(index)}
                        disabled={isRendering}
                        title="Editar HTML"
                      >
                        <Code className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => handleDownload(piece, index)}
                    disabled={isRendering}
                  >
                    {isRendering ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1" />
                    )}
                    Descargar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
