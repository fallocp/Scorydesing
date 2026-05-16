import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, Palette, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDesignStore } from '@/store/designStore';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useImageLibrary } from '@/hooks/useImageLibrary';
import { useDesignLibrary } from '@/hooks/useDesignLibrary';
import { useNarrativeAngles } from '@/hooks/useNarrativeAngles';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

// ─── Fetch all branches for the active business (no category filter) ───
function useAllBranches(businessId: string | null) {
  return useQuery({
    queryKey: ['all-commercial-branches', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commercial_branches')
        .select('id, name, slug')
        .eq('business_id', businessId!)
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!businessId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Image type labels ───
const IMAGE_TYPE_LABELS: Record<string, string> = {
  fotografia: 'Foto',
  infografia: 'Infografía',
  mapa_rutas: 'Mapa',
};

const FORMAT_LABELS: Record<string, string> = {
  'instagram-story': 'Story',
  'instagram-post': 'Post',
  'linkedin-post': 'LinkedIn',
  'banner': 'Banner',
};

function AssetLibraryPage() {
  const navigate = useNavigate();
  const { activeBusinessId } = useActiveBusiness();

  // Filters
  const [branchFilter, setBranchFilter] = useState<string>('__all__');
  const [angleFilter, setAngleFilter] = useState<string>('__all__');
  const [typeFilter, setTypeFilter] = useState<string>('__all__');
  const [formatFilter, setFormatFilter] = useState<string>('__all__');

  // Lightbox
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxMeta, setLightboxMeta] = useState<{ title?: string; subtitle?: string } | null>(null);

  // Data
  const { data: branches } = useAllBranches(activeBusinessId);
  const { data: angles } = useNarrativeAngles();

  // Fetch images from image_library
  const { data: allImages, isLoading: imagesLoading } = useImageLibrary(
    activeBusinessId ? {
      businessId: activeBusinessId,
      commercialBranchId: branchFilter !== '__all__' ? branchFilter : undefined,
      imageType: typeFilter !== '__all__' ? typeFilter : undefined,
    } : undefined
  );

  // Fetch designs from design_library
  const { data: allDesigns, isLoading: designsLoading } = useDesignLibrary(
    activeBusinessId ? {
      businessId: activeBusinessId,
      commercialBranchId: branchFilter !== '__all__' ? branchFilter : undefined,
      platformFormat: formatFilter !== '__all__' ? formatFilter : undefined,
      activeOnly: true,
    } : undefined
  );

  // Group images by branch → angle
  const groupedImages = useMemo(() => {
    if (!allImages || !branches) return [];

    const branchMap = new Map(branches.map((b: any) => [b.id, b.name]));

    // Filter by angle if selected
    let filtered = allImages as any[];
    if (angleFilter !== '__all__') {
      const selectedAngle = angles?.find((a: any) => a.id === angleFilter);
      if (selectedAngle) {
        filtered = filtered.filter((img: any) =>
          img.angle_tag === selectedAngle.slug || img.angle_tag === selectedAngle.name
        );
      }
    }

    // Group by branch
    const groups: { branchId: string; branchName: string; images: any[] }[] = [];
    const byBranch = new Map<string, any[]>();

    for (const img of filtered) {
      const key = img.commercial_branch_id || '__none__';
      if (!byBranch.has(key)) byBranch.set(key, []);
      byBranch.get(key)!.push(img);
    }

    for (const [branchId, imgs] of byBranch) {
      groups.push({
        branchId,
        branchName: branchId === '__none__' ? 'Sin rama asignada' : (branchMap.get(branchId) || 'Rama desconocida'),
        images: imgs,
      });
    }

    // Sort: named branches first, then "sin rama"
    groups.sort((a, b) => {
      if (a.branchId === '__none__') return 1;
      if (b.branchId === '__none__') return -1;
      return a.branchName.localeCompare(b.branchName);
    });

    return groups;
  }, [allImages, branches, angles, angleFilter]);

  // Group designs by branch → headline
  const groupedDesigns = useMemo(() => {
    if (!allDesigns || !branches) return [];

    const branchMap = new Map(branches.map((b: any) => [b.id, b.name]));

    const groups: { branchId: string; branchName: string; copies: { headline: string; designs: any[] }[] }[] = [];
    const byBranch = new Map<string, Map<string, any[]>>();

    for (const design of allDesigns as any[]) {
      const branchKey = design.commercial_branch_id || '__none__';
      if (!byBranch.has(branchKey)) byBranch.set(branchKey, new Map());
      const byHeadline = byBranch.get(branchKey)!;
      if (!byHeadline.has(design.headline)) byHeadline.set(design.headline, []);
      byHeadline.get(design.headline)!.push(design);
    }

    for (const [branchId, headlineMap] of byBranch) {
      const copies: { headline: string; designs: any[] }[] = [];
      for (const [headline, designs] of headlineMap) {
        copies.push({ headline, designs: designs.sort((a: any, b: any) => b.version_number - a.version_number) });
      }
      groups.push({
        branchId,
        branchName: branchId === '__none__' ? 'Sin rama asignada' : (branchMap.get(branchId) || 'Rama desconocida'),
        copies,
      });
    }

    groups.sort((a, b) => {
      if (a.branchId === '__none__') return 1;
      if (b.branchId === '__none__') return -1;
      return a.branchName.localeCompare(b.branchName);
    });

    return groups;
  }, [allDesigns, branches]);

  const handleDownloadDesign = (renderedUrl: string, headline: string) => {
    const link = document.createElement('a');
    link.href = renderedUrl;
    link.download = `${headline.slice(0, 40).replace(/\s+/g, '-').toLowerCase()}.png`;
    link.click();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label="Volver">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Biblioteca de Contenido</h1>
          <p className="text-sm text-muted-foreground">
            Tu repositorio de fotos y diseños organizados por rama y ángulo
          </p>
        </div>
      </div>

      {!activeBusinessId && (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Configura un negocio activo para ver tu biblioteca</p>
        </div>
      )}

      {activeBusinessId && (
        <Tabs defaultValue="photos" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="photos" className="gap-2">
              <ImageIcon className="h-4 w-4" /> Fotos / Assets
            </TabsTrigger>
            <TabsTrigger value="designs" className="gap-2">
              <Palette className="h-4 w-4" /> Diseños Finales
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════ TAB 1: Fotos / Assets ═══════════════ */}
          <TabsContent value="photos" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Rama" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las ramas</SelectItem>
                  {branches?.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={angleFilter} onValueChange={setAngleFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Ángulo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los ángulos</SelectItem>
                  {angles?.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los tipos</SelectItem>
                  <SelectItem value="fotografia">Fotografía</SelectItem>
                  <SelectItem value="infografia">Infografía / 3D</SelectItem>
                  <SelectItem value="mapa_rutas">Mapa de rutas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading */}
            {imagesLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" />
                ))}
              </div>
            )}

            {/* Grouped images */}
            {!imagesLoading && groupedImages.length > 0 && groupedImages.map((group) => (
              <div key={group.branchId} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{group.branchName}</h3>
                  <Badge variant="secondary" className="text-xs">{group.images.length} foto{group.images.length !== 1 ? 's' : ''}</Badge>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {group.images.map((img: any) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => {
                        setLightboxImage(img.image_url);
                        setLightboxMeta({
                          title: img.image_intent || 'Sin descripción',
                          subtitle: `${IMAGE_TYPE_LABELS[img.image_type] || img.image_type} · ${img.angle_tag || 'Sin ángulo'}`,
                        });
                      }}
                      className="group relative aspect-square rounded-lg overflow-hidden border hover:border-[#2ED4C7] transition-all hover:ring-2 hover:ring-[#2ED4C7]/20"
                    >
                      <img
                        src={img.image_url}
                        alt={img.image_intent || ''}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                        <span className="text-[10px] text-white line-clamp-2">
                          {img.image_intent || img.angle_tag || ''}
                        </span>
                      </div>
                      {/* Type badge */}
                      <div className="absolute top-1 right-1">
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-black/60 text-white border-0">
                          {IMAGE_TYPE_LABELS[img.image_type] || '📷'}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Empty */}
            {!imagesLoading && groupedImages.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>No hay fotos en tu biblioteca aún.</p>
                <p className="text-xs mt-1">Genera imágenes desde el editor de diseño y aparecerán aquí organizadas.</p>
              </div>
            )}
          </TabsContent>

          {/* ═══════════════ TAB 2: Diseños Finales ═══════════════ */}
          <TabsContent value="designs" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Rama" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las ramas</SelectItem>
                  {branches?.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={formatFilter} onValueChange={setFormatFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Formato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los formatos</SelectItem>
                  <SelectItem value="instagram-story">Story</SelectItem>
                  <SelectItem value="instagram-post">Post Cuadrado</SelectItem>
                  <SelectItem value="linkedin-post">LinkedIn</SelectItem>
                  <SelectItem value="banner">Banner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading */}
            {designsLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
                ))}
              </div>
            )}

            {/* Grouped designs */}
            {!designsLoading && groupedDesigns.length > 0 && groupedDesigns.map((group) => (
              <div key={group.branchId} className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b pb-2">{group.branchName}</h3>
                {group.copies.map((copy) => (
                  <div key={copy.headline} className="space-y-2 pl-2">
                    <p className="text-sm font-medium text-foreground">"{copy.headline}"</p>
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {copy.designs.map((design: any) => (
                        <button
                          key={design.id}
                          type="button"
                          onClick={() => {
                            const url = design.rendered_url || null;
                            if (url) {
                              setLightboxImage(url);
                              setLightboxMeta({
                                title: design.headline,
                                subtitle: `${FORMAT_LABELS[design.platform_format] || design.platform_format} · v${design.version_number} · ${design.template_id}`,
                              });
                            }
                          }}
                          className="group relative flex-shrink-0 w-28 rounded-lg overflow-hidden border-2 hover:border-[#2ED4C7] transition-all"
                        >
                          {design.rendered_url ? (
                            <img
                              src={design.rendered_url}
                              alt={design.headline}
                              className="w-full aspect-[9/16] object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full aspect-[9/16] bg-muted flex items-center justify-center">
                              <Palette className="h-6 w-6 text-muted-foreground/40" />
                            </div>
                          )}
                          {/* Version badge */}
                          <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-black/70 text-white border-0">
                              v{design.version_number}
                            </Badge>
                            {design.is_active && (
                              <span className="h-2 w-2 rounded-full bg-[#2ED4C7]" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {FORMAT_LABELS[copy.designs[0]?.platform_format] || ''} · {copy.designs[0]?.template_id} · {copy.designs.length} versión{copy.designs.length !== 1 ? 'es' : ''}
                    </p>
                  </div>
                ))}
              </div>
            ))}

            {/* Empty */}
            {!designsLoading && groupedDesigns.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Palette className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>No hay diseños guardados aún.</p>
                <p className="text-xs mt-1">Los diseños se guardan automáticamente al generarlos en el editor.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* ═══════════════ Lightbox ═══════════════ */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => { setLightboxImage(null); setLightboxMeta(null); }}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage}
              alt={lightboxMeta?.title || ''}
              className="max-h-[75vh] rounded-lg object-contain shadow-2xl"
            />
            {lightboxMeta && (
              <div className="text-center space-y-1">
                <p className="text-sm text-white font-medium">{lightboxMeta.title}</p>
                <p className="text-xs text-white/60">{lightboxMeta.subtitle}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleDownloadDesign(lightboxImage, lightboxMeta?.title || 'design')}
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Descargar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:text-white hover:bg-white/10"
                onClick={() => { setLightboxImage(null); setLightboxMeta(null); }}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetLibraryPage;
