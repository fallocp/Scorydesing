import { useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBrandAssets } from '@/hooks/useBrandAssets';
import { useDesignStore } from '@/store/designStore';
import type { DesignImage } from '@/types/xendingDesign';

interface StockImageBrowserProps {
  onSelect?: (image: DesignImage) => void;
}

export function StockImageBrowser({ onSelect }: StockImageBrowserProps) {
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const { data: images, isLoading, error } = useBrandAssets(
    selectedBrand ? { brand: selectedBrand } : null
  );

  // Filter images by search query (matches tags or description)
  const filteredImages = (images ?? []).filter((img) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      img.description.toLowerCase().includes(query) ||
      img.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const handleSelect = (image: DesignImage) => {
    setSelectedImageId(image.id);
    onSelect?.(image);
  };

  if (!selectedBrand) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Por favor selecciona una marca para explorar imágenes stock.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por etiquetas o descripción..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive py-4">
          Error al cargar imágenes: {error.message}
        </p>
      )}

      {/* Image grid */}
      {!isLoading && filteredImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filteredImages.map((image) => {
            const isSelected = selectedImageId === image.id;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => handleSelect(image)}
                className={cn(
                  'group relative aspect-square rounded-lg overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-[#2ED4C7]/50',
                  isSelected
                    ? 'border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
                    : 'border-transparent hover:border-muted-foreground/30'
                )}
              >
                <img
                  src={image.storagePath}
                  alt={image.description}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                {/* Hover overlay with description */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                  <p className="text-xs text-white line-clamp-3 leading-tight">
                    {image.description}
                  </p>
                </div>
                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-[#2ED4C7] flex items-center justify-center">
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filteredImages.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery
            ? `No hay imágenes que coincidan con "${searchQuery}"`
            : 'Aún no hay imágenes stock disponibles para esta marca.'}
        </div>
      )}
    </div>
  );
}
