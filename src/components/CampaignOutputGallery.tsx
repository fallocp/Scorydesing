import { Download, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface RenderedImage {
  url: string;
  filename: string;
  platformFormat: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  'instagram-story': 'Story',
  'instagram-post': 'Post',
  'linkedin-post': 'LinkedIn',
  banner: 'Banner',
};

interface CampaignOutputGalleryProps {
  images: RenderedImage[];
}

export function CampaignOutputGallery({ images }: CampaignOutputGalleryProps) {
  const handleDownload = (image: RenderedImage) => {
    const link = document.createElement('a');
    link.href = image.url;
    link.download = image.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (images.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Aún no hay imágenes renderizadas.</p>
        <p className="text-xs mt-1">
          Completa los pasos anteriores y renderiza tu campaña para ver los resultados aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Imágenes Renderizadas ({images.length})
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((image, index) => (
          <div
            key={`${image.filename}-${index}`}
            className="group relative rounded-lg border overflow-hidden"
          >
            <img
              src={image.url}
              alt={image.filename}
              className="w-full aspect-square object-cover"
              loading="lazy"
            />

            {/* Overlay with download button */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleDownload(image)}
              >
                <Download className="h-4 w-4 mr-1" />
                Descargar
              </Button>
            </div>

            {/* Platform label */}
            <div className="absolute bottom-2 left-2">
              <Badge variant="secondary" className="bg-black/60 text-white border-0 text-xs">
                {PLATFORM_LABELS[image.platformFormat] ?? image.platformFormat}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
